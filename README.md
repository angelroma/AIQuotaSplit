# AIQuotaSplit

AIQuotaSplit is a small, private dashboard that estimates how two people contribute to one account-wide weekly Codex allowance across multiple computers. Each person receives a fixed 50% share for the MVP.

It combines the authoritative account-wide percentage exposed by the local Codex App Server with aggregate local usage from each registered computer. The result is an estimate—not billing data or an official per-person breakdown.

## Install the skill

```bash
npx skills add angelroma/AIQuotaSplit --skill ai-quota-split
```

Then ask Codex to run `$ai-quota-split setup`, `$ai-quota-split sync`, or `$ai-quota-split status`.

Setup explains the privacy boundary before the first upload, lists the existing members, confirms close name matches instead of guessing, and registers the computer to the selected person. The MVP sync is manual so the dashboard clearly shows computers that are stale or have never synced.

## What the dashboard shows

- The current exact 10,080-minute Codex rate-limit window and reset time
- Account-wide usage with a visible 50% midpoint
- Estimated account usage attributed to each member and consumption of their half
- Registered computers with synced, out-of-sync, and never-synced states
- Partial, unavailable, and unassigned-data notices
- The immediately previous weekly window

## Privacy and security

The collector uploads token totals, aggregate model names/cost when available, timestamps, device identity, and the account-wide weekly percentage. It never uploads prompts, responses, code, file paths, project names, session IDs, cookies, account credentials, hardware serial numbers, or an application IP-address field.

Raw Codex JSONL remains local. The pinned [`ccusage@20.0.20`](https://ccusage.com/guide/daily-reports) package reads it on the computer and returns aggregates. Device tokens are stored in owner-only local files and only their SHA-256 hashes are stored in D1. Dashboard and enrollment secrets are PBKDF2-hashed; dashboard sessions are signed, Secure, HttpOnly, and SameSite=Strict.

See the complete [privacy boundary](skills/ai-quota-split/references/privacy.md).

## Local development

Requirements: Node.js 22.13 or newer and `sqlite3` for migration tests.

```bash
npm install
npm test
node --test skills/ai-quota-split/scripts/test/*.test.mjs
npm run build
npm run dev
```

The hosted Site uses these secret bindings:

- `DASHBOARD_PASSWORD_HASH`
- `ENROLLMENT_CODE_HASH`
- `SESSION_SECRET`

Never commit their values. D1 migrations are generated under `drizzle/`.

## How allocation works

For the active window, AIQuotaSplit takes the newest cumulative report from each active computer. If every current report contains an estimated cost, cost is used as a relative model-aware weight. If any report lacks cost, token counts are used for every computer so units are never mixed.

```text
member account % = shared account % × member local weight / total local weight
personal half consumed % = member account % / 50 × 100
```

Whole-day local reporting can overlap a mid-day subscription reset, so the UI always labels incomplete coverage. If no exact weekly meter is available and there is no still-active saved window, the collector stops before running ccusage and does not invent a reset.

## Responsible use

AIQuotaSplit does not change subscription limits, account permissions, or service terms. Each user is responsible for following the terms and access rules of the services they use.

## License

MIT
