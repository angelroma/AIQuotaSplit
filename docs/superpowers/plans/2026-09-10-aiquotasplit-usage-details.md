# AIQuotaSplit Usage Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group computers beneath their owners, expose safe per-member and per-device usage totals, make the weekly reset prominent, and make skill responses easier to read.

**Architecture:** Extend `buildDashboard` to derive one normalized `UsageTotals` object per current device report, then aggregate those objects by member and account without changing the database. Render the existing dashboard contract through focused formatting and usage-detail components; keep CLI JSON unchanged and improve the public skill's presentation rules.

**Tech Stack:** TypeScript, React 19, Vinext/Next-compatible components, D1-backed report rows, Vitest, ESLint, Sites hosting

---

## File map

- `lib/allocation.ts`: parse stored report totals and model JSON; aggregate device, member, and account usage.
- `lib/allocation.test.ts`: prove aggregation, unavailable costs, deduplication, malformed model JSON, and freshness.
- `lib/usage-format.ts`: pure compact-number, currency, date, and reset-countdown formatters.
- `lib/usage-format.test.ts`: boundary tests for reset and numeric formatting.
- `components/reset-countdown.tsx`: client-updating reset countdown with exact local date.
- `components/usage-details.tsx`: collapsed token-component and model summary.
- `components/device-list.tsx`: owner-scoped computer rows with usage and sync status.
- `components/member-card.tsx`: member totals, allocation, freshness, and nested computers.
- `components/quota-card.tsx`: account meter, reset, and locally observed totals.
- `components/dashboard.tsx`: compose the grouped member layout and refresh flow.
- `app/globals.css`: responsive grouped-card, reset, totals, and disclosure styling.
- `skills/ai-quota-split/SKILL.md`: friendly response templates and compact formatting requirements.
- `skills/ai-quota-split/scripts/test/skill-guidance.test.mjs`: enforce the public response contract.

### Task 1: Extend the dashboard data contract

**Files:**
- Modify: `lib/allocation.ts`
- Modify: `lib/allocation.test.ts`

- [ ] **Step 1: Add failing fixture data and aggregate expectations**

Extend each fixture report with token components and model JSON:

```ts
input_tokens: tokens[index] - 30,
output_tokens: 10,
cache_read_tokens: 15,
cache_creation_tokens: 5,
model_breakdown_json: JSON.stringify({
  "gpt-5": {
    inputTokens: tokens[index] - 30,
    outputTokens: 10,
    cacheReadTokens: 15,
    cacheCreationTokens: 5,
    totalTokens: tokens[index],
    estimatedCostUsd: costs[index],
  },
}),
```

Add assertions proving the account, member, and device values:

```ts
expect(result.localUsage).toMatchObject({ totalTokens: 400, estimatedCostUsd: 4 });
expect(result.members[0].localUsage).toMatchObject({ totalTokens: 300, estimatedCostUsd: 3 });
expect(result.members[0].deviceCount).toBe(1);
expect(result.members[0].freshness).toBe("synced");
expect(result.devices[0].localUsage?.modelBreakdown[0]).toMatchObject({
  model: "gpt-5",
  totalTokens: 300,
  estimatedCostUsd: 3,
});
```

Add separate tests for two computers assigned to Miguel, a null estimated cost, a newer duplicate report, malformed `model_breakdown_json`, and a member with no computers.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- lib/allocation.test.ts`

Expected: FAIL because `localUsage`, `deviceCount`, `freshness`, and device report totals are not in `DashboardView`.

- [ ] **Step 3: Add normalized usage types and parsers**

Add these exported types to `lib/allocation.ts`:

```ts
export type ModelUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
  estimatedCostUsd: number | null;
};

export type UsageTotals = Omit<ModelUsage, "model"> & {
  modelBreakdown: ModelUsage[];
};

export type DeviceFreshness = "synced" | "out-of-sync" | "never-synced";
```

Implement `usageFromReport(report)` so numeric fields default to zero only when a report exists, cost remains nullable, and `model_breakdown_json` is parsed defensively into an alphabetically sorted array. Invalid JSON yields an empty breakdown without failing the dashboard.

Implement `sumUsage(items)` with these rules:

```ts
const estimatedCostUsd = items.every((item) => item.estimatedCostUsd !== null)
  ? round(items.reduce((sum, item) => sum + (item.estimatedCostUsd ?? 0), 0))
  : null;
```

Token components are summed, and same-name models are merged with the same nullable-cost rule.

- [ ] **Step 4: Attach current report totals to devices and aggregate upward**

Extend the dashboard contract:

```ts
localUsage: UsageTotals | null; // account

// each member
localUsage: UsageTotals | null;
deviceCount: number;
freshness: DeviceFreshness | null;

// each device
localUsage: UsageTotals | null;
```

Build devices from `currentReports`, group them by `memberId`, and calculate member freshness with this order:

```ts
const freshnessRank = { synced: 0, "out-of-sync": 1, "never-synced": 2 } as const;
```

A member without active computers receives `deviceCount: 0`, `freshness: null`, and `localUsage: null`. The account receives `localUsage: null` when there are no current reports.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- lib/allocation.test.ts`

Expected: PASS, including aggregation, duplicate-report, null-cost, malformed-model, and freshness cases.

- [ ] **Step 6: Commit the contract change**

```bash
git add lib/allocation.ts lib/allocation.test.ts
git commit -m "feat: expose grouped usage totals"
```

### Task 2: Add deterministic display formatting

**Files:**
- Create: `lib/usage-format.ts`
- Create: `lib/usage-format.test.ts`

- [ ] **Step 1: Write failing formatting tests**

Create tests with a fixed local-independent duration input:

```ts
expect(formatCompactTokens(189_854_215)).toBe("189.9M tokens");
expect(formatEstimatedCost(134.29087)).toBe("$134.29");
expect(formatEstimatedCost(null)).toBe("Unavailable");
expect(formatResetCountdown(6 * 86_400 + 18 * 3_600)).toBe("6d 18h");
expect(formatResetCountdown(3 * 3_600 + 24 * 60)).toBe("3h 24m");
expect(formatResetCountdown(45 * 60)).toBe("45m");
expect(formatResetCountdown(-1)).toBe("Reset due");
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- lib/usage-format.test.ts`

Expected: FAIL because `lib/usage-format.ts` does not exist.

- [ ] **Step 3: Implement the pure formatters**

Create `lib/usage-format.ts` with:

```ts
export function formatCompactTokens(value: number) {
  const formatted = new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
  return `${formatted} tokens`;
}

export function formatEstimatedCost(value: number | null) {
  return value === null
    ? "Unavailable"
    : new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
}

export function formatResetCountdown(secondsRemaining: number) {
  if (secondsRemaining <= 0) return "Reset due";
  const days = Math.floor(secondsRemaining / 86_400);
  const hours = Math.floor((secondsRemaining % 86_400) / 3_600);
  const minutes = Math.floor((secondsRemaining % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}
```

Also export `formatExactReset(iso)` using `Intl.DateTimeFormat` with weekday, month, day, hour, and minute; return `Waiting for a weekly meter` for null.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- lib/usage-format.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the formatting helpers**

```bash
git add lib/usage-format.ts lib/usage-format.test.ts
git commit -m "feat: format quota usage summaries"
```

### Task 3: Make the account reset and local totals prominent

**Files:**
- Create: `components/reset-countdown.tsx`
- Modify: `components/quota-card.tsx`
- Modify: `components/dashboard.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Add the live countdown component**

Create a client component that computes `Date.parse(resetsAt) - Date.now()`, renders `formatResetCountdown`, and updates every 60 seconds. It also renders `formatExactReset(resetsAt)` and clears its interval on unmount:

```tsx
export function ResetCountdown({ resetsAt }: { resetsAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = resetsAt ? (Date.parse(resetsAt) - now) / 1000 : null;
  return (
    <div className="quota-reset">
      <span>Resets in</span>
      <strong>{seconds === null ? "Unavailable" : formatResetCountdown(seconds)}</strong>
      <small>{formatExactReset(resetsAt)}</small>
    </div>
  );
}
```

- [ ] **Step 2: Expand the account quota card**

In `QuotaCard`, add `ResetCountdown` beside the account percentage and show:

```tsx
<div className="local-account-totals">
  <div><span>Observed locally</span><strong>{formatEstimatedCost(data.localUsage?.estimatedCostUsd ?? null)}</strong><small>Estimated API-equivalent cost</small></div>
  <div><span>Tokens</span><strong>{data.localUsage ? formatCompactTokens(data.localUsage.totalTokens) : "Unavailable"}</strong><small>Across current computer reports</small></div>
</div>
```

Remove the duplicate hero reset block from `Dashboard`; keep the short privacy explanation.

- [ ] **Step 3: Style the reset and totals responsively**

Add `.quota-reset` and `.local-account-totals` styles using the existing dark quota-card palette. On screens below 620px, stack the percentage/reset header and keep both totals in two equal columns. Below 390px, stack the totals into one column.

- [ ] **Step 4: Verify type-check through the production build**

Run: `npm run build`

Expected: successful Vinext/Sites build with no TypeScript error.

- [ ] **Step 5: Commit the account summary**

```bash
git add components/reset-countdown.tsx components/quota-card.tsx components/dashboard.tsx app/globals.css
git commit -m "feat: emphasize weekly reset and local spend"
```

### Task 4: Group computers inside member cards

**Files:**
- Create: `components/usage-details.tsx`
- Modify: `components/device-list.tsx`
- Modify: `components/member-card.tsx`
- Modify: `components/dashboard.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Create the collapsed aggregate detail**

Render a native accessible disclosure only when usage exists:

```tsx
<details className="usage-details">
  <summary>Usage details</summary>
  <dl className="token-breakdown">
    <div><dt>Input</dt><dd>{formatCompactTokens(usage.inputTokens)}</dd></div>
    <div><dt>Output</dt><dd>{formatCompactTokens(usage.outputTokens)}</dd></div>
    <div><dt>Cache read</dt><dd>{formatCompactTokens(usage.cacheReadTokens)}</dd></div>
    <div><dt>Cache create</dt><dd>{formatCompactTokens(usage.cacheCreationTokens)}</dd></div>
  </dl>
  {usage.modelBreakdown.length ? (
    <ul className="model-breakdown">
      {usage.modelBreakdown.map((model) => (
        <li key={model.model}>
          <strong>{model.model}</strong>
          <span>{formatEstimatedCost(model.estimatedCostUsd)}</span>
          <small>{formatCompactTokens(model.totalTokens)}</small>
        </li>
      ))}
    </ul>
  ) : null}
</details>
```

Each model row shows model name, estimated cost or `Unavailable`, and total tokens. Do not render projects, paths, or sessions.

- [ ] **Step 2: Convert `DeviceList` into an owner-scoped list**

Change its props to:

```ts
{
  devices: DashboardView["devices"];
  onChanged: () => void;
}
```

Remove the global owner lookup and section heading. Each row renders cost first, tokens second, sync status, last sync, the `UsageDetails` disclosure, and the existing revoke control. When the array is empty, show the existing setup instruction inside the member card.

- [ ] **Step 3: Expand `MemberCard` and nest its devices**

Change its props to include filtered devices and `onChanged`. Add member totals:

```tsx
<div className="member-local-totals">
  <div><span>Estimated local cost</span><strong>{formatEstimatedCost(member.localUsage?.estimatedCostUsd ?? null)}</strong></div>
  <div><span>Local tokens</span><strong>{member.localUsage ? formatCompactTokens(member.localUsage.totalTokens) : "Unavailable"}</strong></div>
</div>
<DeviceList devices={devices} onChanged={onChanged} />
```

Show computer count and member freshness near the member name. Preserve account-share and personal-half figures and meter.

- [ ] **Step 4: Compose grouped members in `Dashboard`**

For each member, filter `data.devices` by `member.id` and pass `refresh` as `onChanged`. Remove the standalone registered-computers section.

- [ ] **Step 5: Style the grouped layout**

Make `.dashboard-grid` a single account-summary region followed by `.member-stack`; give member cards enough width for nested rows. Add styles for `.member-local-totals`, `.usage-details`, `.token-breakdown`, `.model-breakdown`, and embedded `.device-list`. Preserve keyboard-visible disclosure and device-menu behavior. At 820px and 620px, stack totals and device metadata without horizontal scrolling.

- [ ] **Step 6: Run quality checks**

Run: `npm test`

Expected: all Vitest tests pass.

Run: `npm run lint`

Expected: ESLint exits 0.

Run: `npm run build`

Expected: production build succeeds.

- [ ] **Step 7: Commit the grouped dashboard**

```bash
git add components/usage-details.tsx components/device-list.tsx components/member-card.tsx components/dashboard.tsx app/globals.css
git commit -m "feat: group computers by member"
```

### Task 5: Make skill answers friendly and consistent

**Files:**
- Modify: `skills/ai-quota-split/SKILL.md`
- Create: `skills/ai-quota-split/scripts/test/skill-guidance.test.mjs`

- [ ] **Step 1: Write a failing guidance test**

Read `SKILL.md` relative to the test file and assert that it contains the required presentation rules:

```js
assert.match(skill, /Lead with \*\*Setup complete\*\*/);
assert.match(skill, /Lead with \*\*Sync complete\*\*/);
assert.match(skill, /Lead with \*\*Status\*\*/);
assert.match(skill, /Needs attention/);
assert.match(skill, /compact token/i);
assert.match(skill, /exact reset/i);
assert.match(skill, /Never expose raw JSON/);
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- skills/ai-quota-split/scripts/test/skill-guidance.test.mjs`

Expected: FAIL because the current skill does not define the friendly response contract.

- [ ] **Step 3: Add presentation rules without changing CLI JSON**

Add a `Response style` section that requires:

```markdown
## Response style

Never expose raw JSON. Translate successful command output into short Markdown.
Use bold labels, compact token values such as `189.9M tokens`, USD with two decimals,
a relative reset followed by the exact reset date, and one dashboard link.
Lead with **Setup complete**, **Sync complete**, or **Status**.
Use **Needs attention** for actionable failures and explain the next action in one sentence.
Do not claim estimated local cost is subscription billing.
```

Update Setup, Sync, and Status with the approved examples and preserve every existing safety and error rule.

- [ ] **Step 4: Run skill and repository tests**

Run: `npm test -- skills/ai-quota-split/scripts/test/skill-guidance.test.mjs`

Expected: PASS.

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 5: Commit the skill presentation update**

```bash
git add skills/ai-quota-split/SKILL.md skills/ai-quota-split/scripts/test/skill-guidance.test.mjs
git commit -m "feat: format friendly skill receipts"
```

### Task 6: Final verification and delivery

**Files:**
- Verify: all modified files
- Update only if required by validation: `README.md`

- [ ] **Step 1: Run the complete verification suite**

Run: `npm test`

Expected: all tests pass with no skipped required cases.

Run: `npm run lint`

Expected: ESLint exits 0.

Run: `npm run build`

Expected: Sites production output succeeds and exports a callable Worker entrypoint.

- [ ] **Step 2: Inspect the final diff**

Run: `git diff main...HEAD --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: clean worktree.

- [ ] **Step 3: Validate the production artifact contract**

Run: `rg -n "Observed locally|Estimated API-equivalent cost|Resets in|Usage details" dist/server dist/client`

Expected: the built application contains all four user-facing labels.

Run: `rg -n "project_name|project_path|session_id|prompt|response" components lib/allocation.ts`

Expected: no newly rendered usage field exposes project, session, prompt, or response data. Existing explanatory privacy copy may contain the words `prompt` or `response`; inspect those matches and confirm they are static exclusion statements only.

- [ ] **Step 4: Publish only after the user approves deployment**

Save a new Sites version from the verified build and deploy it to the existing AIQuotaSplit project. Confirm terminal deployment status before handing off the live URL. Push the reviewed branch or merge it into `main` according to the user's chosen repository workflow.

- [ ] **Step 5: Refresh the installed local skill**

After the public repository version is finalized, update the installed `ai-quota-split` skill from that exact revision and run `$ai-quota-split status` to confirm the friendly response rules are active without uploading new usage.
