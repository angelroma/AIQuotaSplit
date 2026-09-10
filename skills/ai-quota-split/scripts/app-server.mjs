import { spawn as nodeSpawn } from "node:child_process";

const WEEKLY_MINUTES = 10_080;
const BUNDLED_CODEX = "/Applications/ChatGPT.app/Contents/Resources/codex";

export function resolveCodexExecutable(env = process.env) {
  return env.CODEX_CLI_PATH?.trim() || "codex";
}

function validWindow(value) {
  return value &&
    typeof value.usedPercent === "number" &&
    Number.isFinite(value.usedPercent) &&
    value.usedPercent >= 0 && value.usedPercent <= 100 &&
    Number.isInteger(value.windowDurationMins) && value.windowDurationMins > 0 &&
    Number.isInteger(value.resetsAt) && value.resetsAt > 0;
}

export function selectWeeklyRateLimit(snapshot) {
  const candidates = Array.isArray(snapshot)
    ? snapshot
    : snapshot && typeof snapshot === "object"
      ? [snapshot.primary, snapshot.secondary, snapshot]
      : [];
  const weekly = candidates.find((candidate) => validWindow(candidate) && candidate.windowDurationMins === WEEKLY_MINUTES);
  return weekly ? {
    usedPercent: weekly.usedPercent,
    windowDurationMins: weekly.windowDurationMins,
    resetsAt: weekly.resetsAt,
  } : null;
}

function runJsonl(executable, { spawn = nodeSpawn, timeoutMs = 10_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ["app-server"], { stdio: ["pipe", "pipe", "pipe"] });
    const responses = new Map();
    let buffer = "";
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      if (error) reject(error);
      else resolve(responses);
    };
    const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
    const timer = setTimeout(() => finish(new Error("APP_SERVER_TIMEOUT")), timeoutMs);

    child.on("error", (error) => finish(error));
    child.stdin.on("error", (error) => finish(error));
    child.on("close", () => {
      if (!settled) finish(new Error("APP_SERVER_UNAVAILABLE"));
    });
    child.stderr.on("data", () => {});
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        try {
          const message = JSON.parse(line);
          if (!Number.isInteger(message.id)) continue;
          if (message.error) return finish(new Error("APP_SERVER_REQUEST_FAILED"));
          responses.set(message.id, message.result);
          if (message.id === 0) {
            send({ method: "initialized", params: {} });
            send({ method: "account/read", id: 1, params: { refreshToken: false } });
          } else if (message.id === 1) {
            send({ method: "account/rateLimits/read", id: 2, params: {} });
          } else if (message.id === 2) {
            finish();
          }
        } catch {
          finish(new Error("APP_SERVER_INVALID_JSON"));
        }
      }
    });

    send({ method: "initialize", id: 0, params: { clientInfo: { name: "ai_quota_split", title: "AIQuotaSplit", version: "0.1.0" } } });
  });
}

async function defaultRunAppServer(messages, options = {}) {
  const executable = resolveCodexExecutable(options.env);
  try {
    return await runJsonl(executable, options);
  } catch (error) {
    if (
      executable === "codex" &&
      process.platform === "darwin" &&
      (error?.code === "ENOENT" || error?.message === "APP_SERVER_UNAVAILABLE")
    ) {
      return runJsonl(BUNDLED_CODEX, options);
    }
    throw error;
  }
}

export async function readRateLimits(options = {}) {
  const messages = [
    { method: "initialize", id: 0, params: { clientInfo: { name: "ai_quota_split", title: "AIQuotaSplit", version: "0.1.0" } } },
    { method: "initialized", params: {} },
    { method: "account/read", id: 1, params: { refreshToken: false } },
    { method: "account/rateLimits/read", id: 2, params: {} },
  ];
  const responses = await (options.runAppServer ?? defaultRunAppServer)(messages, options);
  const account = responses.get(1)?.account;
  if (!account || (account.type && account.type !== "chatgpt")) throw new Error("CHATGPT_AUTH_REQUIRED");
  const result = responses.get(2);
  const snapshot = result?.rateLimitsByLimitId?.codex ?? result?.rateLimits;
  return selectWeeklyRateLimit(snapshot);
}
