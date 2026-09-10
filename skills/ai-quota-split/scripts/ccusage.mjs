import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(nodeExecFile);
const CCUSAGE_VERSION = "20.0.20";

function localDate(seconds) {
  const date = new Date(seconds * 1000);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

async function defaultRun({ since, until }) {
  const { stdout } = await execFile("npx", buildCcusageArgs(since, until), {
    encoding: "utf8", maxBuffer: 4 * 1024 * 1024, timeout: 30_000,
  });
  return stdout;
}

export function buildCcusageArgs(since, until) {
  return [
    "--offline", "-y", `ccusage@${CCUSAGE_VERSION}`, "codex", "daily",
    "--offline", "--json", "--breakdown", "--since", since, "--until", until,
  ];
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
  const inputTokens = amount(object, ["inputTokens", "uncachedInputTokens", "totalInputTokens"]);
  const outputTokens = amount(object, ["outputTokens", "totalOutputTokens"]);
  const cacheReadTokens = amount(object, ["cacheReadTokens", "cacheReadInputTokens", "cachedInputTokens", "totalCacheReadTokens"]);
  const cacheCreationTokens = amount(object, ["cacheCreationTokens", "cacheWriteTokens", "cacheWriteInputTokens", "totalCacheCreationTokens"]);
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens,
    estimatedCostUsd: nullableAmount(object, ["costUSD", "totalCost", "totalCostUSD", "cost"]),
  };
}

function modelRows(entry) {
  const candidate = entry?.modelBreakdowns ?? entry?.modelBreakdown ?? entry?.breakdown;
  if (Array.isArray(candidate)) return candidate.filter((value) => value && typeof value === "object");
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
  const modelsByName = new Map();

  for (const entry of entries) {
    const models = modelRows(entry);
    const safeModels = models.length ? models : [
      { ...entry, modelName: "all-models" },
    ];
    for (const model of safeModels) {
      const name = String(model.modelName ?? model.model ?? model.name ?? "unknown-model").slice(0, 128);
      const safeName = modelsByName.has(name) || modelsByName.size < 63 ? name : "other-models";
      if (!modelsByName.has(safeName)) modelsByName.set(safeName, zero());
      add(modelsByName.get(safeName), aggregateFields(model));
    }
  }

  const totals = zero();
  for (const model of modelsByName.values()) add(totals, model);
  if (modelsByName.size === 0) totals.estimatedCostUsd = 0;
  const modelBreakdown = Object.fromEntries(modelsByName);
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
