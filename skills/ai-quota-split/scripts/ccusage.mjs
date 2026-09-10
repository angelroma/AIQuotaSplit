import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(nodeExecFile);
const CCUSAGE_VERSION = "20.0.20";

function localDate(seconds) {
  const date = new Date(seconds * 1000);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

async function defaultRun({ since, until }) {
  const { stdout } = await execFile("npx", [
    "--offline", "-y", `ccusage@${CCUSAGE_VERSION}`, "codex", "daily", "--json", "--breakdown", "--since", since, "--until", until,
  ], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024, timeout: 30_000 });
  return stdout;
}

export async function prepareCcusage({ run } = {}) {
  if (run) return run();
  try {
    await execFile("npx", ["-y", `ccusage@${CCUSAGE_VERSION}`, "--version"], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      timeout: 60_000,
    });
  } catch {
    throw new Error("CCUSAGE_INSTALL_UNAVAILABLE");
  }
}

function amount(object, names) {
  for (const name of names) {
    if (typeof object?.[name] === "number" && Number.isFinite(object[name]) && object[name] >= 0) return object[name];
  }
  return 0;
}

function nullableAmount(object, names) {
  for (const name of names) {
    if (typeof object?.[name] === "number" && Number.isFinite(object[name]) && object[name] >= 0) return object[name];
  }
  return null;
}

function aggregateFields(object) {
  const inputTokens = amount(object, ["inputTokens", "uncachedInputTokens"]);
  const outputTokens = amount(object, ["outputTokens"]);
  const cacheReadTokens = amount(object, ["cacheReadTokens", "cacheReadInputTokens", "cachedInputTokens"]);
  const cacheCreationTokens = amount(object, ["cacheCreationTokens", "cacheWriteTokens", "cacheWriteInputTokens"]);
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens,
    estimatedCostUsd: nullableAmount(object, ["costUSD", "totalCost", "cost"]),
  };
}

function modelRows(entry) {
  const candidate = entry?.modelBreakdowns ?? entry?.modelBreakdown ?? entry?.models;
  if (Array.isArray(candidate)) return candidate;
  if (candidate && typeof candidate === "object") {
    return Object.entries(candidate).map(([modelName, values]) => ({ modelName, ...values }));
  }
  return [];
}

function add(target, values) {
  target.inputTokens += values.inputTokens;
  target.outputTokens += values.outputTokens;
  target.cacheReadTokens += values.cacheReadTokens;
  target.cacheCreationTokens += values.cacheCreationTokens;
  target.totalTokens += values.totalTokens;
  target.estimatedCostUsd =
    target.estimatedCostUsd === null || values.estimatedCostUsd === null
      ? null
      : target.estimatedCostUsd + values.estimatedCostUsd;
}

function zero() {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };
}

export function parseCcusage(value) {
  const entries = Array.isArray(value?.daily)
    ? value.daily
    : Array.isArray(value?.data)
      ? value.data
      : value?.totals || value?.summary
        ? [value.totals ?? value.summary]
        : [];
  const modelBreakdown = {};

  for (const entry of entries) {
    const models = modelRows(entry);
    const safeModels = models.length ? models : [
      { ...entry, modelName: "all-models" },
    ];
    for (const model of safeModels) {
      const name = String(model.modelName ?? model.model ?? model.name ?? "unknown-model").slice(0, 128);
      modelBreakdown[name] ??= zero();
      add(modelBreakdown[name], aggregateFields(model));
    }
  }

  const totals = zero();
  for (const model of Object.values(modelBreakdown)) add(totals, model);
  if (Object.keys(modelBreakdown).length === 0) totals.estimatedCostUsd = 0;
  return { ...totals, modelBreakdown };
}

export async function collectUsage(window, { run = defaultRun } = {}) {
  const start = window.resetsAt - window.windowDurationMins * 60;
  try {
    const output = await run({ since: localDate(start), until: localDate(window.resetsAt), window });
    const parsed = JSON.parse(output);
    return parseCcusage(parsed);
  } catch {
    throw new Error("CCUSAGE_UNAVAILABLE");
  }
}
