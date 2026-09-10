---
name: ai-quota-split
description: Set up, manually synchronize, or inspect AIQuotaSplit on a computer that contributes aggregate local Codex usage to a private two-person weekly quota dashboard. Use for AIQuotaSplit setup, sync, status, member selection, or device reassignment; do not use for ChatGPT billing or API metering questions that do not involve this dashboard.
---

# AIQuotaSplit

Route the request to `setup`, `sync`, `status`, or explicit reassignment. Resolve every script path relative to this `SKILL.md`; do not assume the current working directory.

## Safety boundary

Before the first setup or upload, read [references/privacy.md](references/privacy.md), summarize what is collected and excluded, mention the one-time pinned ccusage download, and ask the user to confirm. Never inspect raw Codex JSONL, prompts, responses, project files, browser cookies, or credentials yourself. The deterministic collector reads aggregate fields locally.

Do not create a scheduler in this MVP. Explain that results are estimates because ccusage filters by whole local calendar days while the account window can reset mid-day, and because the Codex rate limit is account-wide.

## Response style

Never expose raw JSON. Translate successful command output into short Markdown. Use bold labels, compact token values such as `189.9M tokens`, USD with two decimals, a relative reset followed by the exact reset date, and one dashboard link. Lead with **Setup complete**, **Sync complete**, or **Status** as specified below. Use **Needs attention** for actionable failures and explain the next action in one sentence. Do not claim estimated local cost is subscription billing.

## Setup

Ask for the dashboard URL and enrollment code. Pass the code through stdin, never as an argument or in visible command output.

1. Run `node <skill-dir>/scripts/ai-quota-split.mjs setup list --url <site> --enrollment-code-stdin`.
2. Present every existing member as a numbered choice. Accept a number or a typed name.
3. For a typed name, pipe the member-list JSON into `node <skill-dir>/scripts/ai-quota-split.mjs identity rank --name <typed-name>`. Use its deterministic choices; exact normalized matches may be confirmed directly, but never silently choose a fuzzy match.
4. For a close match such as “Migul” and “Miguel,” offer exactly: **Use Miguel**, **Create Migul**, or **Go back**.
5. For a new name, state that it appears to be a new member and require confirmation before running `setup create-member --name <confirmed>`. Never offer creation when two members already exist.
6. After an existing or newly created member is explicitly selected and the privacy summary is accepted, run `setup register --member-id <uuid> --url <site> --privacy-accepted --enrollment-code-stdin`.

If the computer is already configured for a different person, explain the change and require explicit confirmation before `setup reassign --member-id <uuid> --url <site> --privacy-accepted --enrollment-code-stdin`. Reassignment is blocked until an active cumulative weekly window ends.

Lead with **Setup complete** after successful registration or reassignment, then show the member, computer, and one dashboard link with bold labels. Keep the receipt brief; do not repeat the enrollment code or raw identifiers.

Format a successful setup receipt like this:

```markdown
**Setup complete**

- **Member:** <member>
- **Computer:** <computer>

[Open dashboard](<dashboard-url>)
```

## Sync

Run `node <skill-dir>/scripts/ai-quota-split.mjs sync`. Report the returned member, computer, window reset, shared percentage or unavailable state, local token/cost total, queue state, and dashboard URL. If the exact 10,080-minute Codex window is unavailable and there is no still-active saved window, stop; do not invent a window or run ccusage.

On `DEVICE_AUTH_REQUIRED`, recommend setup. Never register automatically. On `CCUSAGE_UNAVAILABLE`, say that nothing was uploaded as zero. On an unreachable dashboard, explain that the newest cumulative report was queued locally.

Lead with **Sync complete** after a successful sync, then show the member, computer, shared percentage or unavailable state, compact local tokens, estimated local cost in USD or `Unavailable`, queue state, the relative reset followed by the exact reset date, and one dashboard link. Label local cost as an API-equivalent estimate, not subscription billing.

Format a successful sync receipt like this:

```markdown
**Sync complete**

- **Member:** <member>
- **Computer:** <computer>
- **Shared usage:** 42%
- **Local tokens:** 189.9M tokens
- **Estimated local cost:** $134.29 API-equivalent
- **Reset:** 6d 18h — Thursday, September 17 at 8:00 AM
- **Queue:** Clear

[Open dashboard](<dashboard-url>)
```

## Status

Run `node <skill-dir>/scripts/ai-quota-split.mjs status`. This reads local AIQuotaSplit state only. Report the member, computer, dashboard URL, last successful sync, queued state, and whether the computer is synced, out of sync after 24 hours, or never synced.

Lead with **Status** and show the member, computer, sync state, last successful sync, queue state, and one dashboard link with bold labels. If the status is actionable, lead with **Needs attention** instead and explain the next action in one sentence.

Format a healthy status receipt like this:

```markdown
**Status**

- **Member:** <member>
- **Computer:** <computer>
- **Sync:** Synced
- **Last successful sync:** <relative time>
- **Queue:** Clear

[Open dashboard](<dashboard-url>)
```
