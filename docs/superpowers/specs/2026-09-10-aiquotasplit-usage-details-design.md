# AIQuotaSplit Usage Details Design

**Date:** 2026-09-10  
**Status:** Approved design; awaiting written-spec review  
**Scope:** Dashboard usage hierarchy and skill response presentation

## Goal

Make the current weekly quota easier to understand by showing a prominent reset, locally observed totals, member summaries, and each member's computers in one grouped view. Keep the public skill's responses concise and friendly while preserving deterministic machine-readable command output.

## Product principles

- Totals are the primary view. Daily history is not part of this change.
- The account-wide Codex meter and locally attributed usage are visibly distinct.
- Cost is shown before tokens because it is easier to compare across models.
- Estimated cost is described as an API-equivalent local estimate, never as subscription billing.
- Computers appear directly beneath their owner.
- Prompt, response, project, path, session, credential, cookie, and IP data remain excluded.

## Dashboard hierarchy

### Account summary

The first dashboard card shows:

- Account-wide weekly quota used.
- A live reset countdown.
- The exact reset date and time in the viewer's local timezone.
- Total estimated cost observed across the current local reports.
- Total tokens observed across the current local reports.
- Tracking start and allocation-basis context.

The reset countdown is the most prominent time value. It updates in the client without a reload and uses coarse, readable units such as `6d 18h` or `3h 24m`. The exact local date remains visible for precision. An unavailable weekly meter is shown as unavailable rather than inferred.

### Member groups

Each member receives one section containing:

- Display name and assigned 50% share.
- Percentage points attributed from the full account meter.
- Percentage of the member's half consumed and remaining.
- Estimated local cost.
- Total local tokens.
- Active computer count.
- An overall freshness signal derived from the member's computers.

Both member groups remain visible together so the two people can compare usage without switching tabs.

### Computers nested by member

Every active computer appears inside its owner's section. Each row shows:

- Computer display name and platform.
- Estimated local cost as the primary usage value.
- Total tokens as the secondary value.
- Last successful sync time.
- Synced, out-of-sync, or never-synced state.
- Existing device-management control.

An optional `Usage details` disclosure may show input, output, cache-creation, and cache-read token totals plus per-model aggregate totals. It stays collapsed by default. No daily, project, conversation, or file-level detail is added.

## Data semantics

For the active account window, the server selects the newest cumulative report for each registered computer. Repeated syncs upsert the same device/window record, so they do not double-count usage.

Member token totals are the sum of the newest active-window reports for that member's computers. Member estimated cost is available only when every included report has an estimated cost; account estimated cost is available only when every included account report has one. A missing estimated cost therefore stays unavailable and never becomes zero.

The Codex `sharedUsedPercent` value is account-wide. AIQuotaSplit does not claim that Codex provides a per-person limiter. Member account percentage is attributed using model-aware estimated cost when every applicable report has a cost; otherwise allocation falls back to tokens. The dashboard labels partial, unavailable, and unassigned states.

A computer becomes out of sync 24 hours after its last successful report. A member's freshness is the least-fresh state among that member's active computers, with `never synced` taking precedence over `out of sync`, then `synced`. Stale computers remain visible and their age is explicit so users can decide whether to run a manual sync. No scheduler is added in this MVP.

## Available ccusage data

The pinned ccusage collector can provide aggregate date, model names, input tokens, output tokens, cache-creation tokens, cache-read tokens, total tokens, estimated cost, and per-model breakdown. The source also supports grouping by project, but AIQuotaSplit deliberately does not request or upload project identifiers because they are outside the product's privacy boundary.

Reference: <https://ccusage.com/guide/daily-reports>

## Dashboard contract changes

The dashboard view model adds aggregate usage to each device and member:

- `inputTokens`
- `outputTokens`
- `cacheCreationTokens`
- `cacheReadTokens`
- `totalTokens`
- `estimatedCostUsd`
- `modelBreakdown`
- `lastSyncAt` and freshness remain available on devices

The account view adds corresponding local totals. Model breakdown entries contain only a model name and aggregate token/cost totals. The existing database already stores these fields in cumulative sync reports, so this change does not require a schema migration.

## Friendly skill responses

The scripts continue returning structured JSON. This keeps parsing, tests, and error handling deterministic. The public `SKILL.md` instructs the agent to translate that result into a compact human response.

A successful sync response uses this shape:

```text
Sync complete

Miguel · Miguel's MacBook Pro
Weekly account usage: 14%
Resets in 6 days, 18 hours — Sep 17 at 9:35 AM
This computer: $134.29 estimated cost · 189.9M tokens
Dashboard updated successfully.
```

Setup and status follow the same principles: lead with the result, group related facts, use readable dates and compact numbers, and finish with the next useful action only when one is needed.

Failures are presented under a short `Needs attention` label:

- Device authentication required: recommend setup without registering automatically.
- Collector unavailable: state that nothing was uploaded as zero.
- Dashboard unreachable: state that the newest cumulative report is queued locally.
- Rate-limit unavailable: state that no window was invented and no collection was run unless a still-active saved window exists.

The response never prints enrollment codes, device tokens, credentials, or raw local records.

## Error and empty states

- A member without computers shows a setup instruction inside that member group.
- A registered computer without a report shows `Never synced` and no numeric zero totals.
- Partial member data displays a concise quality notice.
- An expired or missing reset displays `Waiting for a weekly meter`.
- Refresh failures preserve the last loaded estimate and explain that it may be stale.
- The existing device revocation flow remains unchanged.

## Responsive behavior

On wide screens, the account summary and member groups use the available width while keeping both members comparable. On narrow screens, the account summary, member groups, and computer rows stack vertically. Cost, tokens, and sync state remain readable without horizontal scrolling. The nested ownership relationship is preserved at every size.

## Testing

Automated tests cover:

- Per-device totals from the newest cumulative active-window report.
- Member and account aggregation across multiple computers.
- Repeated-sync deduplication.
- Estimated-cost availability and token fallback.
- Token component and model-breakdown propagation.
- Synced, out-of-sync, and never-synced states.
- Reset countdown formatting near day, hour, minute, and expired boundaries.
- Empty member and missing-meter behavior.
- Public skill instructions for friendly setup, sync, status, and warning responses.

The existing authentication, enrollment, sync, allocation, dashboard, lint, and production-build checks must continue to pass.

## Out of scope

- Daily charts or daily history.
- Project, file, session, prompt, or response reporting.
- Exact per-person subscription metering.
- Automated scheduling.
- Editing the 50/50 member split.
- Historical-window browsing.
