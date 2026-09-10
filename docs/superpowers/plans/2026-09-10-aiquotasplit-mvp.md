# AIQuotaSplit MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish a password-protected AIQuotaSplit dashboard plus a public installable skill that assigns computers to either of two members and manually syncs approximate weekly Codex usage without collecting prompts, code, paths, credentials, or IP addresses.

**Architecture:** A Vinext/Next-compatible ChatGPT Site serves the dashboard and JSON endpoints from a Cloudflare Worker, with D1 holding members, devices, and one cumulative report per device/reset window. A dependency-free Node.js collector inside `skills/ai-quota-split` reads the local Codex rate-limit meter through `codex app-server`, runs the pinned `ccusage` Codex daily report for the overlapping calendar dates, stores only a generated device identity locally, and sends an idempotent report to the Site.

**Tech Stack:** ChatGPT Sites Vinext starter, React 19, TypeScript, Tailwind CSS 4, bundled shadcn primitives, Zod, Drizzle ORM/D1, Web Crypto, Vitest, Node.js 22 built-ins, `ccusage@20.0.20`, Codex App Server JSONL protocol.

---

## Source map

The implementation creates or owns these files. Keep generated starter UI primitives and build helpers unchanged.

```text
.
├── .env.example                         Local secret names, never real values
├── .openai/hosting.json                 Sites project identity and logical DB binding
├── README.md                            Public setup, privacy, and skills.sh installation
├── app/
│   ├── api/
│   │   ├── dashboard/route.ts           Session-protected dashboard JSON
│   │   ├── enrollment/
│   │   │   ├── devices/route.ts         Register/reassign a generated device
│   │   │   └── members/route.ts         List/create the two members
│   │   ├── login/route.ts               Shared-password login
│   │   ├── logout/route.ts              Session removal
│   │   └── sync/route.ts                Bearer-authenticated cumulative report upsert
│   ├── globals.css                      AIQuotaSplit visual tokens and responsive layout
│   ├── layout.tsx                       Product metadata
│   ├── login/page.tsx                   Minimal login screen
│   └── page.tsx                         Protected server-rendered dashboard
├── components/
│   ├── dashboard.tsx                    Dashboard composition and refresh action
│   ├── device-list.tsx                  Connected-computer freshness list
│   ├── member-card.tsx                  Per-member allocation card
│   └── quota-card.tsx                   Shared weekly meter and 50% marker
├── db/
│   ├── index.ts                         D1 accessor
│   └── schema.ts                        Drizzle members/devices/sync_reports schema
├── drizzle/0000_ai_quota_split.sql      Generated initial schema migration
├── lib/
│   ├── allocation.test.ts               Allocation/freshness unit tests
│   ├── allocation.ts                    Active-window dashboard calculation
│   ├── auth.test.ts                     Password, cookie, enrollment, token tests
│   ├── auth.ts                          Hashing and signed 12-hour session cookies
│   ├── contracts.test.ts                Payload and range validation tests
│   ├── contracts.ts                     Shared server DTOs and Zod schemas
│   ├── repositories.ts                  All prepared D1 statements
│   └── repositories.test.ts             Idempotency and uniqueness tests using a fake DB
├── skills/ai-quota-split/
│   ├── SKILL.md                         Agent-facing setup/sync/status workflow
│   ├── agents/openai.yaml               Skill display metadata
│   ├── references/privacy.md            Exact collected/excluded field disclosure
│   └── scripts/
│       ├── ai-quota-split.mjs           CLI entrypoint
│       ├── app-server.mjs               JSONL rate-limit client
│       ├── ccusage.mjs                  Pinned ccusage runner and aggregate parser
│       ├── config.mjs                   Private local config/pending-report store
│       ├── identity.mjs                 Name normalization and fuzzy suggestions
│       ├── sync.mjs                     Collection, retry, submission, and receipt
│       └── test/*.test.mjs              Node test-runner coverage for every helper
├── test/fake-d1.ts                      Deterministic D1 test adapter
├── vitest.config.ts                     Server/unit test configuration
└── cloudflare-env.d.ts                  DB and hosted-secret binding types
```

## Stable contracts

Use these names in every server and collector task so later tasks do not invent parallel shapes.

```ts
export type RateLimitObservation = {
  usedPercent: number;
  windowDurationMins: number;
  resetsAt: number; // Unix seconds
};

export type TokenTotals = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
  weightedUsage: number; // ccusage estimated USD, used only as a relative weight
  modelBreakdown: Record<string, {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    totalTokens: number;
    weightedUsage: number;
  }>;
};

export type SyncReportInput = {
  schemaVersion: 1;
  deviceId: string;
  windowResetsAt: number;
  windowDurationMins: number;
  collectedAt: string;
  trackingStartedAt: string;
  localUsageAvailable: true;
  rateLimitAvailable: boolean;
  sharedUsedPercent: number | null;
  collectorVersion: string;
  totals: TokenTotals;
};
```

### Task 1: Initialize the Sites application and test harness

**Files:**
- Create from Sites starter: `.openai/hosting.json`, `package.json`, `package-lock.json`, `app/*`, `components/ui/*`, `db/*`, build configuration
- Create: `.env.example`
- Create: `vitest.config.ts`
- Modify: `package.json`
- Modify: `cloudflare-env.d.ts`
- Test: `lib/contracts.test.ts`

- [ ] **Step 1: Configure the portable Sites execution profile before setup**

Run:

```bash
node /Users/angelroma/.codex/plugins/cache/openai-curated-remote/sites/0.1.56/scripts/configure-execution-profile.mjs
```

Expected: JSON reports `profile: "portable"`; an empty project may report `configured: false`.

- [ ] **Step 2: Copy the Vinext starter into the current repository**

Run:

```bash
node /Users/angelroma/.codex/plugins/cache/openai-curated-remote/sites/0.1.56/scripts/project-setup.mjs
```

Expected: starter files appear while `.git` and `docs/` remain intact.

- [ ] **Step 3: Install the starter dependencies**

Run:

```bash
node /Users/angelroma/.codex/plugins/cache/openai-curated-remote/sites/0.1.56/scripts/install-dependencies.mjs
```

Expected: exit 0 and `node_modules` populated from the starter lockfile.

- [ ] **Step 4: Register the private unpublished Site once, while local work continues**

Use the native Sites `create_site` tool from the owning task as soon as `.openai/hosting.json` exists. Save the returned Site ID atomically as `project_id`, preserve the D1/R2 declarations added below, keep the source write credential only in session memory, and do not issue a second create call if the first result is ambiguous. Registration creates an unpublished Site; it does not expose the unfinished application.

- [ ] **Step 5: Add the test command and Vitest**

Run:

```bash
npm install zod
npm install --save-dev vitest
```

Then add to `package.json`:

```json
"test": "vitest run --passWithNoTests",
"test:watch": "vitest"
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
```

- [ ] **Step 6: Declare only required hosted and local settings**

Set `.openai/hosting.json` to preserve the registered `project_id` and use this capability shape:

```json
{
  "d1": "DB",
  "r2": null
}
```

Create `.env.example`:

```dotenv
DASHBOARD_PASSWORD_HASH=
SESSION_SECRET=
ENROLLMENT_CODE_HASH=
```

Extend `cloudflare-env.d.ts` without removing starter declarations:

```ts
interface CloudflareEnv {
  DB: D1Database;
  DASHBOARD_PASSWORD_HASH: string;
  SESSION_SECRET: string;
  ENROLLMENT_CODE_HASH: string;
}
```

- [ ] **Step 7: Verify the untouched starter and harness**

Run:

```bash
npm test
npm run build
```

Expected: Vitest exits 0 with no tests yet, and the starter build exits 0.

- [ ] **Step 8: Commit the scaffold**

```bash
git add .env.example .openai app build cloudflare-env.d.ts components components.json db drizzle.config.ts eslint.config.mjs hooks lib next.config.ts package.json package-lock.json postcss.config.mjs public scripts tsconfig.json vendor vite.config.ts vitest.config.ts
git commit -m "chore: initialize AIQuotaSplit site"
```

### Task 2: Define and validate the API contracts

**Files:**
- Create: `lib/contracts.ts`
- Create: `lib/contracts.test.ts`

- [ ] **Step 1: Write failing contract tests**

Create `lib/contracts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { syncReportSchema } from "./contracts";

const valid = {
  schemaVersion: 1,
  deviceId: "018f4d0e-7b8d-7c3a-9af7-03c260b94f3b",
  windowResetsAt: 1789646400,
  windowDurationMins: 10080,
  collectedAt: "2026-09-10T15:00:00.000Z",
  trackingStartedAt: "2026-09-10T14:00:00.000Z",
  localUsageAvailable: true,
  rateLimitAvailable: true,
  sharedUsedPercent: 38,
  collectorVersion: "0.1.0",
  totals: {
    inputTokens: 100,
    outputTokens: 40,
    cacheReadTokens: 10,
    cacheCreationTokens: 5,
    totalTokens: 155,
    weightedUsage: 0.22,
    modelBreakdown: {},
  },
};

describe("syncReportSchema", () => {
  it("accepts the stable v1 payload", () => {
    expect(syncReportSchema.parse(valid).deviceId).toBe(valid.deviceId);
  });

  it.each([
    [{ ...valid, sharedUsedPercent: 101 }, "sharedUsedPercent"],
    [{ ...valid, windowDurationMins: 0 }, "windowDurationMins"],
    [{ ...valid, deviceId: "not-a-uuid" }, "deviceId"],
    [{ ...valid, totals: { ...valid.totals, totalTokens: -1 } }, "totalTokens"],
  ])("rejects invalid ranges", (payload, field) => {
    expect(() => syncReportSchema.parse(payload)).toThrow(field);
  });

  it("rejects a tracking start after collection", () => {
    expect(() => syncReportSchema.parse({
      ...valid,
      trackingStartedAt: "2026-09-11T00:00:00.000Z",
    })).toThrow("trackingStartedAt");
  });
});
```

- [ ] **Step 2: Run the contract test to verify failure**

Run: `npm test -- lib/contracts.test.ts`

Expected: FAIL because `./contracts` does not exist.

- [ ] **Step 3: Implement the shared schemas and DTO types**

Create `lib/contracts.ts` with:

```ts
import { z } from "zod";

const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const modelTotalsSchema = z.object({
  inputTokens: count,
  outputTokens: count,
  cacheReadTokens: count,
  cacheCreationTokens: count,
  totalTokens: count,
  weightedUsage: z.number().finite().min(0),
}).strict();

export const syncReportSchema = z.object({
  schemaVersion: z.literal(1),
  deviceId: z.string().uuid(),
  windowResetsAt: z.number().int().positive(),
  windowDurationMins: z.number().int().min(1).max(43200),
  collectedAt: z.string().datetime(),
  trackingStartedAt: z.string().datetime(),
  localUsageAvailable: z.literal(true),
  rateLimitAvailable: z.boolean(),
  sharedUsedPercent: z.number().min(0).max(100).nullable(),
  collectorVersion: z.string().min(1).max(32),
  totals: modelTotalsSchema.extend({
    modelBreakdown: z.record(z.string().min(1).max(128), modelTotalsSchema).refine(
      (value) => Object.keys(value).length <= 64,
      "modelBreakdown has too many models",
    ),
  }),
}).strict().superRefine((value, ctx) => {
  if (Date.parse(value.trackingStartedAt) > Date.parse(value.collectedAt)) {
    ctx.addIssue({ code: "custom", path: ["trackingStartedAt"], message: "trackingStartedAt must not be after collectedAt" });
  }
  if (value.rateLimitAvailable !== (value.sharedUsedPercent !== null)) {
    ctx.addIssue({ code: "custom", path: ["sharedUsedPercent"], message: "sharedUsedPercent must match rateLimitAvailable" });
  }
});

export const memberNameSchema = z.string().trim().min(1).max(80);
export const deviceRegistrationSchema = z.object({
  deviceId: z.string().uuid(),
  memberId: z.string().uuid(),
  displayName: z.string().trim().min(1).max(120),
  platform: z.enum(["macos", "windows", "linux", "other"]),
  reassign: z.boolean().default(false),
}).strict();

export type SyncReportInput = z.infer<typeof syncReportSchema>;
export type DeviceRegistrationInput = z.infer<typeof deviceRegistrationSchema>;
```

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- lib/contracts.test.ts`

Expected: PASS.

```bash
git add lib/contracts.ts lib/contracts.test.ts
git commit -m "feat: define sync and enrollment contracts"
```

### Task 3: Add the D1 schema and repository boundary

**Files:**
- Modify: `db/schema.ts`
- Modify: `db/index.ts`
- Create: `lib/repositories.ts`
- Create: `lib/repositories.test.ts`
- Create: `test/fake-d1.ts`
- Create generated: `drizzle/0000_ai_quota_split.sql`

- [ ] **Step 1: Write failing repository tests for two-member uniqueness and report upsert**

In `lib/repositories.test.ts`, build tests around a `RepositoryDb` fake rather than importing Cloudflare globals:

```ts
import { describe, expect, it } from "vitest";
import { createMemoryRepositoryDb } from "../test/fake-d1";
import { createMember, upsertSyncReport } from "./repositories";

describe("repositories", () => {
  it("enforces two active members and normalized-name uniqueness", async () => {
    const db = createMemoryRepositoryDb();
    await createMember(db, { displayName: "Miguel", normalizedName: "miguel" });
    await expect(createMember(db, { displayName: "Míguel", normalizedName: "miguel" }))
      .rejects.toThrow("MEMBER_NAME_EXISTS");
    await createMember(db, { displayName: "Mauro", normalizedName: "mauro" });
    await expect(createMember(db, { displayName: "Angel", normalizedName: "angel" }))
      .rejects.toThrow("MEMBER_LIMIT_REACHED");
  });

  it("replaces one device/window report instead of incrementing it", async () => {
    const db = createMemoryRepositoryDb();
    await upsertSyncReport(db, { deviceId: "device", windowResetsAt: 100, totalTokens: 10, collectedAt: "2026-09-10T10:00:00Z" });
    await upsertSyncReport(db, { deviceId: "device", windowResetsAt: 100, totalTokens: 25, collectedAt: "2026-09-10T11:00:00Z" });
    expect(db.reports).toEqual([{ deviceId: "device", windowResetsAt: 100, totalTokens: 25, collectedAt: "2026-09-10T11:00:00Z" }]);
  });
});
```

- [ ] **Step 2: Run the repository test to verify failure**

Run: `npm test -- lib/repositories.test.ts`

Expected: FAIL because the repository and fake do not exist.

- [ ] **Step 3: Define the Drizzle schema**

Replace starter schema content in `db/schema.ts` with three focused tables. Use UUID text keys, Unix-second reset keys, ISO timestamps, explicit foreign keys, and these indexes:

```ts
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const members = sqliteTable("members", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  quotaPercent: real("quota_percent").notNull().default(50),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("idx_members_normalized_name").on(table.normalizedName)]);

export const devices = sqliteTable("devices", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull().references(() => members.id),
  displayName: text("display_name").notNull(),
  platform: text("platform").notNull(),
  tokenHash: text("token_hash").notNull(),
  registeredAt: text("registered_at").notNull(),
  lastSyncAt: text("last_sync_at"),
  revokedAt: text("revoked_at"),
}, (table) => [
  index("idx_devices_member_id").on(table.memberId),
  uniqueIndex("idx_devices_token_hash").on(table.tokenHash),
]);

export const syncReports = sqliteTable("sync_reports", {
  id: text("id").primaryKey(),
  deviceId: text("device_id").notNull().references(() => devices.id),
  windowResetsAt: integer("window_resets_at").notNull(),
  windowDurationMins: integer("window_duration_mins").notNull(),
  collectedAt: text("collected_at").notNull(),
  trackingStartedAt: text("tracking_started_at").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  cacheReadTokens: integer("cache_read_tokens").notNull(),
  cacheCreationTokens: integer("cache_creation_tokens").notNull(),
  totalTokens: integer("total_tokens").notNull(),
  weightedUsage: real("weighted_usage").notNull(),
  modelBreakdownJson: text("model_breakdown_json").notNull(),
  sharedUsedPercent: real("shared_used_percent"),
  rateLimitAvailable: integer("rate_limit_available", { mode: "boolean" }).notNull(),
  localUsageAvailable: integer("local_usage_available", { mode: "boolean" }).notNull(),
  collectorVersion: text("collector_version").notNull(),
}, (table) => [
  uniqueIndex("idx_sync_reports_device_window").on(table.deviceId, table.windowResetsAt),
  index("idx_sync_reports_window_collected").on(table.windowResetsAt, table.collectedAt),
]);
```

- [ ] **Step 4: Implement one database accessor and repository functions**

Keep `db/index.ts` limited to `drizzle(env.DB)`. In `lib/repositories.ts`, export `listMembers`, `createMember`, `registerDevice`, `findDeviceByTokenHash`, `upsertSyncReport`, and `loadDashboardRows`. Each application query must use one prepared SQL statement, and multi-statement device/report writes must use `env.DB.batch`. Convert unique-constraint errors to the exact domain codes `MEMBER_NAME_EXISTS`, `MEMBER_LIMIT_REACHED`, and `DEVICE_REASSIGN_CONFIRMATION_REQUIRED`.

The report upsert must use this conflict rule:

```sql
ON CONFLICT(device_id, window_resets_at) DO UPDATE SET
  window_duration_mins = excluded.window_duration_mins,
  collected_at = excluded.collected_at,
  tracking_started_at = excluded.tracking_started_at,
  input_tokens = excluded.input_tokens,
  output_tokens = excluded.output_tokens,
  cache_read_tokens = excluded.cache_read_tokens,
  cache_creation_tokens = excluded.cache_creation_tokens,
  total_tokens = excluded.total_tokens,
  weighted_usage = excluded.weighted_usage,
  model_breakdown_json = excluded.model_breakdown_json,
  shared_used_percent = excluded.shared_used_percent,
  rate_limit_available = excluded.rate_limit_available,
  local_usage_available = excluded.local_usage_available,
  collector_version = excluded.collector_version
WHERE excluded.collected_at >= sync_reports.collected_at
```

- [ ] **Step 5: Generate and inspect the immutable migration**

Run:

```bash
npm run db:generate
```

Expected: one new SQL migration plus matching Drizzle metadata. Inspect it for three tables, foreign keys, both unique indexes, and complete D1-compatible statements; append `PRAGMA optimize;` as its own statement only if the generator omitted it.

- [ ] **Step 6: Run tests and commit**

Run: `npm test -- lib/repositories.test.ts`

Expected: PASS.

```bash
git add db lib/repositories.ts lib/repositories.test.ts test/fake-d1.ts drizzle
git commit -m "feat: add member device and report storage"
```

### Task 4: Implement hashing and 12-hour dashboard sessions

**Files:**
- Create: `lib/auth.ts`
- Create: `lib/auth.test.ts`
- Create: `app/api/login/route.ts`
- Create: `app/api/logout/route.ts`
- Create: `app/login/page.tsx`

- [ ] **Step 1: Write failing auth tests**

Create tests that pin these observable behaviors:

```ts
import { describe, expect, it } from "vitest";
import { createSessionCookie, hashSecret, verifySecret, verifySessionCookie } from "./auth";

describe("auth", () => {
  it("hashes with PBKDF2 and compares without storing plaintext", async () => {
    const stored = await hashSecret("correct horse", new Uint8Array(16).fill(7));
    expect(stored).toMatch(/^pbkdf2-sha256\$210000\$/);
    await expect(verifySecret("correct horse", stored)).resolves.toBe(true);
    await expect(verifySecret("wrong", stored)).resolves.toBe(false);
  });

  it("signs a strict 12-hour cookie and rejects expiration", async () => {
    const now = 1_789_000_000;
    const cookie = await createSessionCookie("session-secret", now);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
    await expect(verifySessionCookie(cookie, "session-secret", now + 43_199)).resolves.toBe(true);
    await expect(verifySessionCookie(cookie, "session-secret", now + 43_201)).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run the auth test to verify failure**

Run: `npm test -- lib/auth.test.ts`

Expected: FAIL because `lib/auth.ts` does not exist.

- [ ] **Step 3: Implement Web Crypto helpers**

In `lib/auth.ts`, use `crypto.subtle` only. Store password/enrollment/device verifiers as `pbkdf2-sha256$210000$<base64 salt>$<base64 digest>`. Compare decoded digest bytes in a constant-time loop. Sign `base64url({v:1,exp})` with HMAC-SHA-256 and expose:

```ts
export const SESSION_COOKIE = "aiqs_session";
export async function hashSecret(secret: string, salt = crypto.getRandomValues(new Uint8Array(16))): Promise<string>;
export async function verifySecret(candidate: string, stored: string): Promise<boolean>;
export async function hashDeviceToken(token: string): Promise<string>;
export async function createSessionCookie(secret: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string>;
export async function verifySessionCookie(cookieHeader: string | null, secret: string, nowSeconds?: number): Promise<boolean>;
export function clearSessionCookie(): string;
```

`hashDeviceToken` must use SHA-256 because device tokens are 32 random bytes and need deterministic indexed lookup; dashboard and enrollment secrets use PBKDF2.

- [ ] **Step 4: Add login/logout routes and login page**

`POST /api/login` parses an `application/x-www-form-urlencoded` password, verifies `DASHBOARD_PASSWORD_HASH`, sets the session cookie, and redirects to `/`. Invalid credentials redirect to `/login?error=1` without revealing which check failed. `POST /api/logout` clears the cookie and redirects to `/login`.

`app/login/page.tsx` uses bundled `Card`, `Input`, `Label`, and `Button`, includes a password field, generic error copy, and no usage data in the HTML.

- [ ] **Step 5: Run auth tests and commit**

Run: `npm test -- lib/auth.test.ts`

Expected: PASS.

```bash
git add lib/auth.ts lib/auth.test.ts app/api/login app/api/logout app/login
git commit -m "feat: protect dashboard with signed sessions"
```

### Task 5: Implement enrollment and device registration

**Files:**
- Create: `lib/names.ts`
- Create: `lib/names.test.ts`
- Create: `app/api/enrollment/members/route.ts`
- Create: `app/api/enrollment/devices/route.ts`

- [ ] **Step 1: Write failing normalization tests**

```ts
import { describe, expect, it } from "vitest";
import { normalizeMemberName } from "./names";

describe("normalizeMemberName", () => {
  it.each([
    [" Miguel ", "miguel"],
    ["MÍGUEL", "miguel"],
    ["Miguel   Martinez", "miguel martinez"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeMemberName(input)).toBe(expected);
  });
});
```

Run: `npm test -- lib/names.test.ts`

Expected: FAIL because `lib/names.ts` does not exist.

- [ ] **Step 2: Implement normalization**

```ts
export function normalizeMemberName(value: string): string {
  return value.trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}
```

- [ ] **Step 3: Add enrollment authorization and member routes**

Both endpoints require `Authorization: Enrollment <code>` and verify it against `ENROLLMENT_CODE_HASH`. `GET /api/enrollment/members` returns only `{ members: [{ id, displayName, deviceCount }], canCreate: boolean }`. `POST` validates `{ displayName }`, normalizes it server-side, creates it with a UUID and `quotaPercent: 50`, and returns HTTP 409 with `MEMBER_NAME_EXISTS` or `MEMBER_LIMIT_REACHED` when appropriate.

- [ ] **Step 4: Add device registration and reassignment**

`POST /api/enrollment/devices` validates `deviceRegistrationSchema`. A new UUID gets a 32-byte random base64url token, stores only its SHA-256 hash, and returns `{ deviceId, memberId, deviceToken }` once. An existing device may update its display name without a new row or token; moving to another member requires `reassign: true`. A revoked device returns HTTP 403.

- [ ] **Step 5: Test route authorization and commit**

Add route-level tests to `lib/auth.test.ts` using `Request` objects and injected env helpers. Assert no enrollment code appears in JSON/errors, missing/wrong codes return 401, the third member returns 409, and reassignment without confirmation returns 409.

Run: `npm test -- lib/names.test.ts lib/auth.test.ts lib/repositories.test.ts`

Expected: PASS.

```bash
git add lib/names.ts lib/names.test.ts lib/auth.test.ts app/api/enrollment
git commit -m "feat: add two-member device enrollment"
```

### Task 6: Implement authenticated idempotent sync ingestion

**Files:**
- Create: `app/api/sync/route.ts`
- Modify: `lib/contracts.test.ts`
- Modify: `lib/repositories.test.ts`

- [ ] **Step 1: Add failing ingestion boundary tests**

Add tests for:

```ts
it("rejects bodies over 128 KiB before JSON parsing", async () => {
  const response = await postSync(new Request("https://site/api/sync", {
    method: "POST",
    headers: { "content-length": "131073" },
    body: "x",
  }), fakeEnv());
  expect(response.status).toBe(413);
});

it("rejects an invalid or revoked bearer token", async () => {
  const response = await postSync(syncRequest(valid, "bad-token"), fakeEnv());
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "DEVICE_AUTH_REQUIRED" });
});

it("upserts the same device and reset window", async () => {
  const first = await postSync(syncRequest(valid, deviceToken), fakeEnv());
  const second = await postSync(syncRequest({ ...valid, totals: { ...valid.totals, totalTokens: 200 } }, deviceToken), fakeEnv());
  expect(first.status).toBe(200);
  expect(second.status).toBe(200);
  expect(fakeDb.reports).toHaveLength(1);
  expect(fakeDb.reports[0].totalTokens).toBe(200);
});
```

- [ ] **Step 2: Run the ingestion tests to verify failure**

Run: `npm test -- lib/contracts.test.ts lib/repositories.test.ts`

Expected: FAIL until the exported route handler exists.

- [ ] **Step 3: Implement `POST /api/sync`**

Export a pure `postSync(request, env)` for testing and `POST(request)` for Vinext. Enforce, in order: 128 KiB limit, bearer syntax, SHA-256 token lookup, non-revoked device, JSON parse, schema validation, token/device ID match, plausible timestamps (collection not more than 10 minutes in the future; reset not more than 31 days away), and cumulative upsert. Update `devices.last_sync_at` in the same `batch` as the report upsert. Return:

```json
{
  "ok": true,
  "deviceId": "...",
  "windowResetsAt": 1789646400,
  "dashboardUrl": "https://.../",
  "privacy": "Aggregate tokens, model totals, device label, and weekly rate-limit status only."
}
```

Never log an Authorization header, request body, enrollment code, session cookie, or raw device token.

- [ ] **Step 4: Run focused and full tests, then commit**

Run:

```bash
npm test -- lib/contracts.test.ts lib/repositories.test.ts
npm test
```

Expected: PASS.

```bash
git add app/api/sync/route.ts lib/contracts.test.ts lib/repositories.test.ts
git commit -m "feat: ingest cumulative weekly device reports"
```

### Task 7: Calculate allocation, freshness, partial data, and rollover

**Files:**
- Create: `lib/allocation.ts`
- Create: `lib/allocation.test.ts`
- Create: `app/api/dashboard/route.ts`

- [ ] **Step 1: Write failing calculation tests**

Cover the exact arithmetic and every data-quality state:

```ts
import { describe, expect, it } from "vitest";
import { buildDashboard } from "./allocation";

describe("buildDashboard", () => {
  it("allocates shared usage by current device weight", () => {
    const result = buildDashboard(fixture({ sharedUsedPercent: 38, weights: [3, 1] }), NOW);
    expect(result.members.map((member) => member.accountPercent)).toEqual([28.5, 9.5]);
    expect(result.members.map((member) => member.personalQuotaConsumedPercent)).toEqual([57, 19]);
    expect(result.unassignedPercent).toBe(0);
  });

  it("keeps shared usage explicitly unassigned without local weight", () => {
    const result = buildDashboard(fixture({ sharedUsedPercent: 38, weights: [0, 0] }), NOW);
    expect(result.unassignedPercent).toBe(38);
    expect(result.quality).toContain("unassigned");
  });

  it("uses the newest valid account observation and one latest report per device", () => {
    const result = buildDashboard(rolloverFixture(), NOW);
    expect(result.window.resetsAt).toBe(NEW_RESET);
    expect(result.sharedUsedPercent).toBe(12);
    expect(result.previousWindows).toHaveLength(1);
  });

  it.each([
    [23 * 60 * 60, "synced"],
    [24 * 60 * 60, "out-of-sync"],
  ])("classifies device age %s", (ageSeconds, status) => {
    const result = buildDashboard(fixture({ deviceAgeSeconds: ageSeconds }), NOW);
    expect(result.devices[0].freshness).toBe(status);
  });
});
```

- [ ] **Step 2: Run the allocation test to verify failure**

Run: `npm test -- lib/allocation.test.ts`

Expected: FAIL because `lib/allocation.ts` does not exist.

- [ ] **Step 3: Implement the pure dashboard builder**

Export `buildDashboard(rows, nowSeconds)` and return:

```ts
export type DashboardView = {
  generatedAt: string;
  sharedUsedPercent: number | null;
  unassignedPercent: number;
  window: { startsAt: string | null; resetsAt: string | null; durationMins: number | null };
  trackingStartedAt: string | null;
  quality: Array<"partial" | "rate-limit-unavailable" | "unassigned">;
  members: Array<{
    id: string;
    displayName: string;
    quotaPercent: number;
    accountPercent: number;
    personalQuotaConsumedPercent: number;
    personalQuotaRemainingPercent: number;
  }>;
  devices: Array<{
    id: string;
    memberId: string;
    displayName: string;
    platform: string;
    lastSyncAt: string | null;
    freshness: "synced" | "out-of-sync" | "never-synced";
  }>;
  previousWindows: Array<{ resetsAt: string; sharedUsedPercent: number | null }>;
};
```

Round public percentages to two decimals only after allocation. Ensure `sum(member.accountPercent) + unassignedPercent` equals the shared percentage within `0.01`. Mark partial when any active device is stale/never synced/missing one source; retain the most recent valid shared observation when a later local-only report has `sharedUsedPercent: null`.

- [ ] **Step 4: Add the protected dashboard endpoint**

`GET /api/dashboard` verifies `aiqs_session`, loads all active members/devices and current plus immediately previous window rows, passes them to `buildDashboard`, and returns `Cache-Control: private, no-store`. Missing/invalid session returns 401; D1 failure returns 503 with `{ error: "DASHBOARD_UNAVAILABLE" }`.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- lib/allocation.test.ts`

Expected: PASS.

```bash
git add lib/allocation.ts lib/allocation.test.ts app/api/dashboard/route.ts
git commit -m "feat: calculate weekly quota allocation"
```

### Task 8: Build the approved minimal dashboard

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`
- Modify: `app/page.tsx`
- Create: `components/dashboard.tsx`
- Create: `components/quota-card.tsx`
- Create: `components/member-card.tsx`
- Create: `components/device-list.tsx`

- [ ] **Step 1: Replace starter metadata and theme tokens**

Set title `AIQuotaSplit` and description `A private estimate of how two people share one weekly Codex allowance.` In `app/globals.css`, define off-white background, charcoal text, blue member A, green member B, orange warning, 16px body text, restrained 14px labels, subtle borders, and responsive spacing. Preserve accessible contrast and both light/dark token blocks if both exist.

- [ ] **Step 2: Build the protected server page**

`app/page.tsx` must mark `dynamic = "force-dynamic"`, verify the signed cookie server-side, redirect unauthenticated viewers to `/login`, load the same view-model service used by `/api/dashboard`, and render `<Dashboard initialData={data} />`. No usage value may be embedded in a static build artifact.

- [ ] **Step 3: Compose the first viewport from bundled primitives**

Use bundled `Card`, `Badge`, `Progress`, `Button`, and `Alert` primitives. The first viewport order is:

```tsx
<main>
  <Header product="AIQuotaSplit" privacy="Aggregate usage only" updatedAt={data.generatedAt} />
  <QuotaCard usedPercent={data.sharedUsedPercent} window={data.window} />
  <section aria-label="Member allocation" className="member-grid">
    {data.members.map((member, index) => <MemberCard key={member.id} member={member} accent={index === 0 ? "blue" : "green"} />)}
  </section>
  <QualityNotice quality={data.quality} unassignedPercent={data.unassignedPercent} />
  <DeviceList devices={data.devices} members={data.members} />
</main>
```

The quota card shows the account-wide percent, reset time, 0–100 bar, and a 50% marker. Each member card shows account percentage, percent of their half consumed, and remaining percentage of their half. Device rows show owner, platform, last sync, and `Synced`, `Out of sync`, or `Never synced`. Empty state says exactly what to run: `$ai-quota-split setup`, then `$ai-quota-split sync`.

- [ ] **Step 4: Add mobile and 200%-zoom behavior**

At narrow widths, stack member cards and device metadata without horizontal scrolling. Keep tap targets at least 44px, progress labels outside bars, and essential status text at 14px or larger. Respect `prefers-reduced-motion`; do not add charts, a sidebar, imagery, or decorative animation.

- [ ] **Step 5: Build and commit the recognizable product slice**

Run:

```bash
npm test
node /Users/angelroma/.codex/plugins/cache/openai-curated-remote/sites/0.1.56/scripts/build-site.mjs
```

Expected: all tests PASS; build emits `dist/server/index.js` whose default export has a callable Worker `fetch`.

```bash
git add app components
git commit -m "feat: build AIQuotaSplit dashboard"
```

### Task 9: Build the local collector and resilient pending-report queue

**Files:**
- Create: `skills/ai-quota-split/scripts/app-server.mjs`
- Create: `skills/ai-quota-split/scripts/ccusage.mjs`
- Create: `skills/ai-quota-split/scripts/config.mjs`
- Create: `skills/ai-quota-split/scripts/sync.mjs`
- Create: `skills/ai-quota-split/scripts/test/app-server.test.mjs`
- Create: `skills/ai-quota-split/scripts/test/ccusage.test.mjs`
- Create: `skills/ai-quota-split/scripts/test/config.test.mjs`
- Create: `skills/ai-quota-split/scripts/test/sync.test.mjs`

- [ ] **Step 1: Initialize the public skill package before adding collector files**

Run the official initializer once, before `skills/ai-quota-split` exists:

```bash
python3 /Users/angelroma/.codex/skills/.system/skill-creator/scripts/init_skill.py ai-quota-split --path skills --resources scripts,references --interface display_name=AIQuotaSplit --interface short_description="Split shared weekly Codex usage privately" --interface default_prompt="Set up, sync, or check this computer's AIQuotaSplit usage."
```

Expected: `skills/ai-quota-split/SKILL.md`, `agents/openai.yaml`, `scripts/`, and `references/` exist. Do not run the initializer again.

- [ ] **Step 2: Write failing Node tests for the collector boundaries**

Use `node:test`, temporary directories from `mkdtemp`, and injected `spawn`/`fetch`. Tests must cover:

```js
test("app-server initializes before reading rate limits", async () => {
  const observed = await readRateLimits({ spawn: fakeAppServer([
    { id: 0, result: { userAgent: "codex" } },
    { id: 1, result: { rateLimits: [{ usedPercent: 38, windowDurationMins: 10080, resetsAt: 1789646400 }] } },
  ]) });
  assert.deepEqual(observed, { usedPercent: 38, windowDurationMins: 10080, resetsAt: 1789646400 });
});

test("ccusage sums only returned aggregate fields and never project metadata", async () => {
  const result = await collectUsage(WINDOW, { run: fakeCcusage(CCUSAGE_JSON) });
  assert.equal(result.totalTokens, 155);
  assert.equal(JSON.stringify(result).includes("project"), false);
});

test("a newer cumulative pending report replaces the old one", async () => {
  await savePending(firstReport, tempConfigDir);
  await savePending(newerReport, tempConfigDir);
  assert.deepEqual(await readPending(tempConfigDir), newerReport);
});

test("ccusage failure never uploads zero usage", async () => {
  await assert.rejects(() => synchronize({ collectUsage: failingCollector, post: spyPost }), /CCUSAGE_UNAVAILABLE/);
  assert.equal(spyPost.calls.length, 0);
});
```

Run: `node --test skills/ai-quota-split/scripts/test/*.test.mjs`

Expected: FAIL because helpers do not exist.

- [ ] **Step 3: Implement the Codex App Server JSONL client**

In `app-server.mjs`, spawn `codex app-server` with piped stdio and a 10-second timeout. Send newline-delimited messages in this order:

```json
{"method":"initialize","id":0,"params":{"clientInfo":{"name":"ai_quota_split","title":"AIQuotaSplit","version":"0.1.0"}}}
{"method":"initialized","params":{}}
{"method":"account/rateLimits/read","id":1,"params":{}}
```

Ignore notifications, match replies by `id`, validate `usedPercent` 0–100, positive `windowDurationMins`, and positive Unix `resetsAt`, then terminate the child. Preflight `account/read` and require ChatGPT-backed authentication. Read `rateLimitsByLimitId.codex` when present, otherwise the backward-compatible `rateLimits` snapshot; inspect both `primary` and `secondary` and select the window whose duration is exactly 10,080 minutes. Do not assume either position is weekly, merge buckets, or choose the nearest duration. If no exact weekly window exists, report it unavailable. Resolve the executable from `CODEX_CLI_PATH`, then `codex` on `PATH`, then `/Applications/ChatGPT.app/Contents/Resources/codex` on macOS. Never print app-server stderr unless redacted.

- [ ] **Step 4: Implement the pinned ccusage runner**

Compute `windowStart = resetsAt - windowDurationMins * 60`, convert start/reset instants to local inclusive `YYYYMMDD` dates, and execute:

```text
npx -y ccusage@20.0.20 codex daily --json --breakdown --since <YYYYMMDD> --until <YYYYMMDD>
```

Support both documented JSON shapes (`{type,data,summary}` and `{daily,totals}`), normalize token field aliases, sum per-model aggregates, and use cost (`costUSD` or `totalCost`) as `weightedUsage`. If cost is unavailable, fall back to `totalTokens` as a relative weight and set an internal receipt note; never upload project/session/file metadata. Empty results are valid zero local activity; command failure or invalid JSON is `CCUSAGE_UNAVAILABLE` and must not upload.

- [ ] **Step 5: Implement private local state**

Use `path.join(os.homedir(), ".config", "ai-quota-split")` on macOS/Linux and `path.join(process.env.APPDATA ?? os.homedir(), "AIQuotaSplit")` on Windows. Store `config.json` and at most one `pending-report.json`, create files with mode `0o600` and their directory with `0o700`, and persist atomically through a same-directory temporary file plus rename.

`config.json` contains only:

```json
{
  "schemaVersion": 1,
  "dashboardUrl": "https://...",
  "memberId": "uuid",
  "memberDisplayName": "Miguel",
  "deviceId": "uuid",
  "deviceDisplayName": "Miguel's MacBook Pro",
  "deviceToken": "random bearer token",
  "trackingStartedAt": "ISO timestamp",
  "lastKnownWindow": null
}
```

Never copy this file into the repository or print `deviceToken`.

- [ ] **Step 6: Implement synchronization and receipts**

The sync order is: load config; retry a compatible pending report; read rate limit; collect ccusage for that window; build v1 cumulative payload; POST with the device bearer token; update `lastKnownWindow`; remove the pending report after a confirmed 2xx. On an unreachable Site, replace the pending report only if it has the same device/window and a newer `collectedAt`, or if it belongs to a newer reset window. If rate-limit reading fails and `lastKnownWindow` exists, collect/upload with null shared percentage; if no window is known, keep the local result pending without inventing reset values. A 401/403 stops with `DEVICE_AUTH_REQUIRED` and recommends setup; it never registers automatically.

Print the approved receipt with member, computer, window, shared usage or unavailable state, weighted local total, dashboard URL, collected categories, and the explicit never-collected list. Run every message through `redactSecrets(text, [deviceToken])`.

- [ ] **Step 7: Run collector tests and commit**

Run: `node --test skills/ai-quota-split/scripts/test/*.test.mjs`

Expected: PASS with no real Codex process, network request, or home-directory write.

```bash
git add skills/ai-quota-split/scripts
git commit -m "feat: collect and sync private Codex aggregates"
```

### Task 10: Create the guided public skill

**Files:**
- Create with initializer: `skills/ai-quota-split/SKILL.md`
- Create with initializer: `skills/ai-quota-split/agents/openai.yaml`
- Create: `skills/ai-quota-split/references/privacy.md`
- Create: `skills/ai-quota-split/scripts/ai-quota-split.mjs`
- Create: `skills/ai-quota-split/scripts/identity.mjs`
- Create: `skills/ai-quota-split/scripts/test/identity.test.mjs`

- [ ] **Step 1: Write failing fuzzy-match tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { rankMemberChoices } from "../identity.mjs";

test("exact matching ignores case accents and whitespace", () => {
  assert.equal(rankMemberChoices(" MÍGUEL ", [{ id: "1", displayName: "Miguel" }])[0].kind, "exact");
});

test("Migul suggests Miguel but never selects automatically", () => {
  assert.deepEqual(rankMemberChoices("Migul", [{ id: "1", displayName: "Miguel" }])[0], {
    kind: "similar",
    member: { id: "1", displayName: "Miguel" },
  });
});

test("an unrelated name remains a confirmable new member", () => {
  assert.equal(rankMemberChoices("Mauro", [{ id: "1", displayName: "Miguel" }])[0].kind, "new");
});
```

Run: `node --test skills/ai-quota-split/scripts/test/identity.test.mjs`

Expected: FAIL because `identity.mjs` does not exist.

- [ ] **Step 2: Implement deterministic setup/status commands**

`identity.mjs` normalizes NFD accents/whitespace/case and uses a bounded Levenshtein distance of `max(1, floor(name.length * 0.25))` only for suggestions. `ai-quota-split.mjs` exposes machine-readable commands for the skill:

```text
node scripts/ai-quota-split.mjs setup list --url <site> --enrollment-code-stdin
node scripts/ai-quota-split.mjs setup create-member --name <confirmed> --url <site> --enrollment-code-stdin
node scripts/ai-quota-split.mjs setup register --member-id <uuid> --url <site> --enrollment-code-stdin
node scripts/ai-quota-split.mjs setup reassign --member-id <uuid> --enrollment-code-stdin
node scripts/ai-quota-split.mjs sync
node scripts/ai-quota-split.mjs status
```

Secrets enter via stdin, never argv. `status` reads local state only and reports member/device, dashboard URL, last successful sync, queued state, and whether the device is out of sync at 24 hours.

- [ ] **Step 3: Write the concise agent workflow in `SKILL.md`**

Use frontmatter:

```yaml
---
name: ai-quota-split
description: Set up, manually synchronize, or inspect AIQuotaSplit on a computer that contributes aggregate local Codex usage to a private two-person weekly quota dashboard. Use for AIQuotaSplit setup, sync, status, member selection, or device reassignment; do not use for ChatGPT billing or API metering questions that do not involve this dashboard.
---
```

The body must instruct the agent to:

1. Route to `setup`, `sync`, `status`, or `setup --reassign`.
2. Before first upload, read and summarize `references/privacy.md` and ask for confirmation.
3. During setup, list numbered existing members; accept a number or typed name; use deterministic identity ranking; never silently choose a fuzzy match.
4. Offer `Use Miguel`, `Create Migul`, and `Go back` for a close match; require confirmation before every new member; do not offer a third member.
5. Run only the deterministic script matching the confirmed action; never inspect raw JSONL logs, prompts, project files, browser cookies, or credentials.
6. Explain that totals are estimates because ccusage date filters are day-granular and account rate limits are account-wide.
7. Never create a scheduler in the MVP.

- [ ] **Step 4: Add the exact privacy reference and metadata**

`references/privacy.md` must list every collected/excluded field from the design, explain local secret storage and server-side token hashing, and state that the Site receives no IP field even though ordinary hosting infrastructure may process connection metadata. Keep automatic invocation enabled in `agents/openai.yaml` and do not add an explicit-only policy.

- [ ] **Step 5: Validate the skill and run all script tests**

Run:

```bash
python3 /Users/angelroma/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/ai-quota-split
node --test skills/ai-quota-split/scripts/test/*.test.mjs
```

Expected: validator prints success; all Node tests PASS.

- [ ] **Step 6: Commit the installable skill**

```bash
git add skills/ai-quota-split
git commit -m "feat: add guided AIQuotaSplit skill"
```

### Task 11: Document, harden, publish, and verify the MVP

**Files:**
- Create: `README.md`
- Modify: `.gitignore`
- Modify: `.openai/hosting.json` only through Sites registration
- Modify: any source file only for failures found by the checks below

- [ ] **Step 1: Write the public repository README**

Document:

```markdown
# AIQuotaSplit

AIQuotaSplit estimates how two people split one shared weekly Codex allowance across multiple computers.

## Install the skill

```bash
npx skills add angelroma/AIQuotaSplit
```

Then ask Codex to run `$ai-quota-split setup`, `$ai-quota-split sync`, or `$ai-quota-split status`.
```

Also include prerequisites (Node 22+, Codex CLI signed into the shared subscription), the manual-only MVP workflow, estimate limitations, collected/excluded data, self-hosting secret names, and links to the approved design/spec. Do not include live passwords, enrollment codes, device tokens, personal config, or copied local output.

- [ ] **Step 2: Prevent secret and local-state commits**

Ensure `.gitignore` contains:

```gitignore
.env
.env.*
!.env.example
.wrangler/
.sites-runtime/
node_modules/
dist/
*.log
```

Run:

```bash
git grep -n -I -E '(deviceToken|DASHBOARD_PASSWORD=|ENROLLMENT_CODE=|SESSION_SECRET=)' -- ':!docs/**' ':!*.test.*' ':!.env.example'
```

Expected: no plaintext secret assignments or example device token values.

- [ ] **Step 3: Run the complete local verification matrix**

Run:

```bash
npm test
node --test skills/ai-quota-split/scripts/test/*.test.mjs
python3 /Users/angelroma/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/ai-quota-split
node /Users/angelroma/.codex/plugins/cache/openai-curated-remote/sites/0.1.56/scripts/build-site.mjs
```

Expected: all tests and validation PASS; build exits 0; `dist/server/index.js` exists and exports a default object with callable `fetch`.

- [ ] **Step 4: Verify the registered Site identity before packaging**

Re-read `.openai/hosting.json` and confirm the `project_id` saved in Task 1 is present alongside `d1: "DB"` and `r2: null`. If registration was still running, collect that original call; do not create a replacement Site.

- [ ] **Step 5: Configure hosted secrets and publish through Sites**

Generate high-entropy values locally, convert the shared dashboard password and enrollment code to the same PBKDF2 storage format used by `lib/auth.ts`, configure `DASHBOARD_PASSWORD_HASH`, `ENROLLMENT_CODE_HASH`, and `SESSION_SECRET` through Sites secret management, inspect/apply the D1 migration, save a version, and deploy through the `sites-hosting` skill with a public access policy. Public reachability is required for device collectors; application routes still enforce the shared dashboard session, enrollment code, or device bearer token independently. Verify deployment status in the terminal before using the URL.

- [ ] **Step 6: Perform a safe end-to-end smoke test**

With test-only enrollment credentials and a generated device token:

1. Confirm unauthenticated `/` redirects to `/login` and `/api/dashboard` returns 401.
2. Confirm login sets a secure cookie and reveals an empty dashboard.
3. Create Miguel; exact normalized duplicate returns 409.
4. Create Mauro; a third member returns 409.
5. Register two generated devices, one per member.
6. POST a 38% window with weights 3 and 1; dashboard shows 28.5% and 9.5%, totaling 38%.
7. Repost one device/window with a newer cumulative value; row count stays constant.
8. Confirm wrong/revoked device tokens fail and no response includes any supplied secret.
9. Confirm a 24-hour-old device becomes `Out of sync` and the dashboard becomes partial.

Remove or revoke the smoke-test devices after verification if they were created in the production deployment; do not delete member or report history without an explicit cleanup path.

- [ ] **Step 7: Create and push the public GitHub repository**

Run only after the secret scan and clean-tree verification:

```bash
gh repo create angelroma/AIQuotaSplit --public --source=. --remote=origin --push
```

Expected: repository exists at `https://github.com/angelroma/AIQuotaSplit`, branch `main` is pushed, and `npx skills add angelroma/AIQuotaSplit` discovers `skills/ai-quota-split/SKILL.md`.

- [ ] **Step 8: Commit final documentation before or with the first push**

```bash
git add README.md .gitignore .openai/hosting.json
git commit -m "docs: add installation and privacy guide"
git status --short
```

Expected: commit succeeds and final status is clean.

## Final acceptance check

- [ ] Two members can register multiple generated device identities, and the server rejects a third member.
- [ ] Similar names are suggested but never selected automatically; new names and reassignment require confirmation.
- [ ] `ccusage@20.0.20` provides date-filtered Codex aggregates; prompts, source, paths, sessions, and IP are absent from payloads.
- [ ] Codex App Server provides the account-wide percentage/reset when available; its failure produces a visible partial state.
- [ ] One cumulative report per device/reset window prevents double-counting and preserves previous windows.
- [ ] Allocated member percentages plus unassigned usage equal the shared percentage within `0.01`.
- [ ] Dashboard, enrollment, and ingestion each enforce their independent credentials.
- [ ] Password/enrollment secrets are slow-hashed; device tokens are random, deterministically hashed, and revocable.
- [ ] Dashboard shows synced, out-of-sync, never-synced, partial, unavailable, unassigned, and empty states on desktop and narrow layouts.
- [ ] Skill validation, unit tests, Worker build, deployed smoke test, secret scan, GitHub push, and skills.sh discovery all succeed.
