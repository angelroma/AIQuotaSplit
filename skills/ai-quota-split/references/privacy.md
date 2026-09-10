# AIQuotaSplit privacy boundary

AIQuotaSplit reads Codex usage logs locally through the pinned `ccusage@20.0.20` package and reads the account-wide Codex weekly rate-limit meter through the local Codex App Server. On first setup, `npx` may download and execute that pinned third-party ccusage package from the npm registry. Later syncs request offline mode from both npm and ccusage.

Only these aggregate fields are sent to the dashboard:

- Generated device ID, computer display name, operating-system family, chosen member ID, and collector version
- Weekly window duration and reset timestamp, collection timestamp, and local tracking start
- Aggregate input, output, cache-read, cache-creation, and total token counts
- Aggregate model names and their token totals
- Estimated aggregate cost when ccusage supplies it
- Account-wide weekly used percentage when an exact 10,080-minute Codex window is available

The collector never sends or intentionally reads for upload:

- Prompts, responses, conversation text, or source code
- File contents, file paths, repository names, or project names
- Session IDs, thread IDs, browser cookies, or ChatGPT credentials
- The enrollment code, dashboard password, or raw device bearer token
- A user name from the operating system, hardware serial number, or an IP-address field

Raw Codex JSONL remains on the computer. ccusage parses it locally and returns aggregates; neither the agent nor the dashboard server receives raw logs. Ordinary hosting and network infrastructure may process connection metadata such as an IP address, but AIQuotaSplit does not add an IP field to reports or store one in its application database.

Local configuration is stored in an owner-only file under `~/.config/ai-quota-split` on macOS/Linux or `%APPDATA%\AIQuotaSplit` on Windows. It contains the device bearer token. The dashboard stores only one-way hashes of its generated high-entropy device, dashboard, and enrollment credentials. Dashboard sessions use a signed Secure, HttpOnly, SameSite=Strict cookie.

Reports are cumulative per computer and weekly reset window. A queued report replaces an older compatible report instead of accumulating raw event history. Results are estimates because ccusage date filters operate on local calendar days while the subscription window can reset during a day.
