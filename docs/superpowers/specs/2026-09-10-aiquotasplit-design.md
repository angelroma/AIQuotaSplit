# AIQuotaSplit MVP Design

**Date:** 2026-09-10  
**Status:** Approved for implementation planning  
**Repository:** `angelroma/AIQuotaSplit` (public)  
**Skill:** `ai-quota-split`

## Purpose

AIQuotaSplit helps two people who use one Codex subscription understand how much of the shared weekly rate-limit allowance each person has approximately consumed. Each person may use multiple computers. A locally installed skill gathers aggregate Codex usage from each computer and sends it to a private dashboard.

The MVP reports an estimate, not an exact per-person bill. OpenAI exposes the authoritative account-wide rate-limit percentage but not a per-person subscription breakdown. AIQuotaSplit apportions that shared percentage using model-weighted local usage.

## MVP outcome

A successful MVP supports this workflow:

```text
Install skill -> register member and computer -> sync manually -> compare shares
```

Two members can install the public skill on multiple computers, register each computer to the correct member, run a manual sync, and see a password-protected dashboard containing:

- Account-wide weekly usage and reset time.
- Each member's estimated share of the account allowance.
- Each member's progress against their assigned quota percentage.
- The computers assigned to each member.
- Clear freshness, partial-data, unavailable-data, and unassigned-usage states.

## Product and repository naming

- Product: **AIQuotaSplit**
- GitHub repository: `https://github.com/angelroma/AIQuotaSplit`
- Skill directory and invocation name: `ai-quota-split`
- Planned installation source: `npx skills add angelroma/AIQuotaSplit`

The repository will be public. It must never contain deployment secrets, dashboard passwords, enrollment codes, device tokens, or personal configuration.

## Architecture

### Components

1. **AIQuotaSplit Site**
   - A minimal Sites-compatible web application.
   - Hosts the private dashboard and server endpoints.
   - Uses a D1 database for durable structured data.
   - Stores secret values in hosted environment configuration.

2. **AIQuotaSplit skill**
   - Distributed from the public GitHub repository through skills.sh.
   - Provides `setup`, `sync`, `status`, and `setup --reassign` workflows.
   - Includes deterministic local scripts for data collection and submission.
   - Uses the agent only for guided interaction and confirmation; measurement and upload logic remain in scripts.

3. **D1 database**
   - Stores members, devices, and cumulative sync reports.
   - One deployment represents one shared Codex subscription.

### Chosen stack

- Frontend and server runtime: ChatGPT Sites-compatible application
- Hosting: ChatGPT Sites
- Database: Sites D1 binding
- Dashboard authentication: one shared password verified server-side
- Enrollment authentication: one shared enrollment code
- Device authentication: one unique, revocable token per registered computer
- Local runtime: Node.js
- Local usage source: `ccusage` Codex JSON reports
- Account limit source: Codex App Server `account/rateLimits/read`
- Initial scheduling: manual skill invocation only

Firebase and Vercel are intentionally excluded from the MVP. Sites and D1 satisfy the hosting, server, storage, secret-management, and access needs with fewer services.

## Member onboarding

### Initial setup

The user invokes the skill's setup workflow. Setup requests the dashboard URL and enrollment code, fetches the current member list, and asks who uses the computer.

When members already exist, the skill presents numbered options:

```text
Who uses this computer?

1. Miguel - 2 computers
2. Mauro - 1 computer
3. Create a new member
```

The user may enter a number or a name. A deployment permits at most two active members. If two members already exist, setup presents only those two choices and does not offer to create a third member.

### Name matching

Names are normalized for whitespace, case, and accents before comparison.

- An exact normalized match is presented for confirmation.
- A close match is never selected automatically.
- A name with no close match is treated as a proposed new member and requires confirmation.

Example close match:

```text
You entered "Migul".
This looks similar to "Miguel".

1. Use Miguel
2. Create a new member named Migul
3. Go back
```

Example new member:

```text
"Mauro" appears to be a new member.
Create Mauro and assign "Mauro's MacBook Pro" to them? [y/N]
```

The backend also enforces normalized-name uniqueness so concurrent setup attempts cannot create duplicate exact matches.

## Device identity

Setup generates a random device UUID and stores it in the skill's local configuration. The backend returns a unique device token after registration.

- Future syncs reuse the device UUID and token.
- Re-running setup does not create a duplicate device when local configuration still exists.
- Changing the computer name updates the display label without changing device identity.
- One member may own multiple devices.
- `setup --reassign` moves an existing device to another confirmed member.
- Hardware serial numbers, MAC addresses, and IP addresses are not collected or stored.

If local configuration is lost, the computer is treated as a new device in the MVP. Removing or merging abandoned device records is outside the initial scope.

## Data collection and privacy

### Collected fields

- Member ID and display name
- Generated device UUID
- Computer display name
- Operating-system family
- Collector and skill version
- Sync timestamp
- Weekly input, output, cache-read, and cache-creation token totals
- Per-model aggregate totals
- Model-weighted estimated usage or API-equivalent cost
- Account-wide rate-limit `usedPercent`
- Account-wide `windowDurationMins`
- Account-wide `resetsAt`
- Data-source availability and freshness flags

### Explicitly excluded fields

- Prompts and model responses
- Source code and file contents
- Filenames and project paths
- Conversation titles and chat history
- Account cookies, ChatGPT tokens, or other ChatGPT credentials
- Dashboard password and enrollment code
- Raw device tokens
- Hardware serial numbers and MAC addresses
- Public and private IP addresses

The skill displays the collected and excluded categories before the first upload and includes a concise privacy summary in every sync receipt.

## Synchronization

### Manual MVP flow

```text
$ai-quota-split sync
        |
        +--> Read local Codex aggregates through ccusage
        |
        +--> Read shared percentage and reset time through Codex App Server
        |
        +--> Submit one authenticated cumulative report
        |
        +--> Display a local receipt and dashboard link
```

Reports contain cumulative values for a device and weekly window, not increment-only counters. The server upserts the latest report for that device and window. Repeated submissions therefore do not double-count usage.

### Weekly window

The active window is identified by `resetsAt` and `windowDurationMins`, not by a calendar-week boundary. Its nominal start is:

```text
window_start = resetsAt - (windowDurationMins * 60 seconds)
```

The newest valid account-rate-limit observation supplies the dashboard's authoritative shared percentage and reset time. A changed `resetsAt` starts a new window; previous windows remain read-only.

The collector requests `ccusage codex daily --json` data for the calendar dates that overlap the account window. Because `ccusage` date filters are day-based while the subscription window may reset during a day, the boundary day's local total is approximate.

Because the MVP uses manual synchronization and day-level `ccusage` aggregates, the first tracked window or a window that spans long gaps may be incomplete. The UI must display when tracking began and label member allocations as estimates.

## Allocation calculation

For the active window, the dashboard selects the newest cumulative report from every registered device. It sums device weights by member, then apportions the shared percentage:

```text
member_weight = sum(latest device weighted usage for member)
total_weight = sum(member_weight for all members)
member_account_percent = shared_used_percent * member_weight / total_weight
member_quota_consumed_percent = member_account_percent / member_assigned_quota_percent * 100
```

For a 50/50 split, a member attributed 21 percentage points has consumed 42% of their personal half.

If `shared_used_percent` is greater than zero but no valid local weight exists, the shared percentage is shown as unassigned. If only some devices have usable current reports, the dashboard labels the allocation partial rather than silently presenting it as complete.

The MVP supports exactly two active members and assigns each member 50%. Advanced quota editing is outside the MVP; the database schema keeps the assigned percentage explicit so the feature can be added later without migrating the core allocation model.

## Database model

### `members`

- `id`
- `display_name`
- `normalized_name` (unique)
- `quota_percent`
- `created_at`
- `updated_at`

### `devices`

- `id` (generated device UUID)
- `member_id`
- `display_name`
- `platform`
- `token_hash`
- `registered_at`
- `last_sync_at`
- `revoked_at` (nullable)

### `sync_reports`

- `id`
- `device_id`
- `window_resets_at`
- `window_duration_mins`
- `collected_at`
- `tracking_started_at`
- `input_tokens`
- `output_tokens`
- `cache_read_tokens`
- `cache_creation_tokens`
- `total_tokens`
- `weighted_usage`
- `model_breakdown_json`
- `shared_used_percent` (nullable)
- `rate_limit_available`
- `local_usage_available`
- `collector_version`
- unique key on `(device_id, window_resets_at)`

## Server interfaces

### Dashboard authentication

- The Site is reachable at its public URL so collectors can call the ingestion endpoint, but every application route enforces its own authorization and no usage data appears in static HTML.
- A login endpoint compares the submitted password against a slow password hash stored as a hosted secret.
- Successful login creates a 12-hour `HttpOnly`, `Secure`, `SameSite=Strict` session cookie.
- Dashboard data endpoints require a valid session.

### Enrollment

- Enrollment endpoints require the enrollment code.
- Setup can list member display names and device counts, create a confirmed new member, or register a device.
- A device token is returned only once when registration succeeds.
- Stored device tokens are hashed.

### Sync ingestion

- Sync requests use the device token as a bearer credential.
- A token can submit reports only for its device.
- The server validates numeric ranges, timestamps, payload size, and supported schema version.
- Sync uses an upsert keyed by device and weekly window.
- Revoked devices cannot submit reports.

## Dashboard design

The approved visual direction is a centered, minimal desktop layout with no sidebar:

1. Compact AIQuotaSplit header with privacy indicator and last-update time.
2. Large weekly-quota card with shared `usedPercent`, reset time, a 0-100 progress bar, and a visible quota-split marker.
3. Equal member cards with account percentage, percentage of personal quota consumed, remaining allowance, and simple progress bars.
4. Connected-computers list with owner, freshness status, and last sync time.
5. A prominent but calm data-quality notice when the estimate is partial, stale, unavailable, or unassigned.

The interface uses an off-white background, charcoal typography, restrained blue and green member accents, orange warnings, subtle borders, and generous whitespace. It avoids decorative charts, detailed token tables, navigation complexity, and setup internals.

## Freshness and confidence

- **Synced:** last successful report is less than 24 hours old.
- **Out of sync:** last successful report is at least 24 hours old.
- **Never synced:** registered device has no report.
- **Partial estimate:** one or more active devices are out of sync, have never synced, or lack one required data source.
- **Rate limit unavailable:** local usage was reported but the shared account meter could not be read.
- **Unassigned usage:** shared account usage exists but there is no valid local weight to allocate some or all of it.

Stale reports remain visible but muted. The UI never removes warnings merely because it can calculate a numeric result.

## Sync receipt

A successful manual run returns a concise receipt:

```text
AIQuotaSplit sync complete

Member: Miguel
Computer: Miguel's MacBook Pro
Weekly window: Sep 10 - Sep 17
Shared Codex usage: 38%
Local usage uploaded: 1,248,300 weighted tokens
Last synchronized: Just now

Collected:
- Member and generated device IDs
- Computer display name
- Weekly model and token totals
- Shared rate-limit percentage and reset time

Never collected:
- Prompts or responses
- Source code or filenames
- Project paths
- Chat history
- ChatGPT credentials
```

When only part of the sync succeeds, the receipt identifies which source failed and whether a partial report was uploaded or queued.

## Failure behavior

- **`ccusage` unavailable or fails:** do not upload zero usage; explain the failure and how to retry.
- **Codex rate-limit read fails:** upload local usage with a null shared percentage, retain the last known account observation in the dashboard, and show `Rate limit unavailable`.
- **Site unreachable:** retain one pending cumulative report locally, replacing it with a newer cumulative report when appropriate, and retry it on the next manual sync.
- **Rate-limit read fails with no known window:** retain the local report for retry instead of assigning it to an invented window. If a prior active window is known locally, upload the report to that window with a null shared percentage and a partial-data flag.
- **Invalid or revoked device token:** stop and suggest rerunning setup; never register a duplicate implicitly.
- **Repeated sync:** upsert the cumulative report; never add it as another usage increment.
- **Reset timestamp changes:** begin a new window and retain the previous one as read-only history.
- **Similar member names:** require explicit numbered selection.
- **Concurrent exact-name creation:** backend uniqueness wins; setup refreshes the member list and asks the user to choose the existing member.
- **Malformed or oversized payload:** reject it without changing stored data and return an actionable error.

Secrets must be redacted from errors and logs.

## Validation and testing

### Skill and collector

- Exact, case-insensitive, accent-insensitive, and fuzzy member-name matching
- New-member confirmation and cancellation
- Existing-device reuse and explicit reassignment
- Privacy summary content
- `ccusage` success, missing-command, invalid-JSON, and empty-data cases
- Codex rate-limit success and unavailable cases
- Single pending-report creation, replacement, and retry
- Secret redaction

### Server and database

- Dashboard, enrollment, and device-token authorization boundaries
- Token hashing and revocation
- Payload schema, range, timestamp, and size validation
- Idempotent upsert per device and window
- Concurrent normalized-name uniqueness
- New-window rollover and historical preservation
- Allocation arithmetic and explicit unassigned remainder

### Dashboard

- Shared and member percentages render consistently
- Member allocations plus unassigned usage equal the shared percentage within rounding tolerance
- Synced, out-of-sync, never-synced, partial, unavailable, and unassigned states
- Password/session behavior
- Empty state before the first member or report
- Responsive layout for desktop and narrow mobile viewing

## MVP acceptance criteria

The MVP is complete when:

1. Two people can install the skill from the public repository.
2. Each person can register one or more computers.
3. Existing members appear as numbered choices.
4. Misspellings suggest likely matches without automatic selection.
5. New members require confirmation.
6. Manual sync gathers local Codex aggregates.
7. Manual sync reads the shared weekly Codex percentage and reset time when available.
8. Repeated syncs do not duplicate usage.
9. Devices roll up under their assigned member.
10. Member allocation plus unassigned usage matches the shared account usage within rounding tolerance.
11. The dashboard displays freshness and confidence states.
12. Dashboard and ingestion access are independently authenticated.
13. No excluded sensitive fields are collected or stored.

## Out of scope for the MVP

- Native automatic scheduling
- Codex scheduled-task synchronization
- Email, push, or chat notifications
- Automatic quota enforcement or blocking
- Multiple shared subscriptions in one deployment
- Detailed session, conversation, or project history
- Exact billing or guaranteed per-person metering
- Advanced member and quota administration
- Device merging after local configuration loss
- Mobile application
- IP-address collection

## Future iteration

The first follow-up may add a native scheduler created by the skill's setup script:

- macOS: `launchd`
- Windows: Task Scheduler
- Linux: `systemd` timer or cron

The scheduler will invoke the deterministic collector directly rather than start a model conversation, so tracking does not materially consume the quota it measures. Manual `$ai-quota-split sync` remains available.
