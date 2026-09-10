import { collectUsage as defaultCollectUsage } from "./ccusage.mjs";
import { clearPending as defaultClearPending, readConfig as defaultReadConfig, readPending as defaultReadPending, saveConfig as defaultSaveConfig, savePending as defaultSavePending } from "./config.mjs";
import { readRateLimits as defaultReadRateLimits } from "./app-server.mjs";

const WEEKLY_MINUTES = 10_080;

async function defaultPost(config, payload) {
  return fetch(new URL("/api/sync", config.dashboardUrl), {
    method: "POST",
    headers: { Authorization: `Bearer ${config.deviceToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function successful(response) {
  return response && (response.ok === true || (response.status >= 200 && response.status < 300));
}

function authFailure(response) {
  return response?.status === 401 || response?.status === 403;
}

export function redactSecrets(text, secrets) {
  return secrets.filter(Boolean).reduce((result, secret) => result.split(secret).join("[redacted]"), String(text));
}

async function upload(config, payload, post) {
  const response = await post(config, payload);
  if (authFailure(response)) throw new Error("DEVICE_AUTH_REQUIRED");
  if (!successful(response)) throw new Error("SYNC_UNAVAILABLE");
  return response;
}

export async function synchronize(dependencies = {}) {
  const loadConfig = dependencies.loadConfig ?? defaultReadConfig;
  const readPending = dependencies.readPending ?? defaultReadPending;
  const savePending = dependencies.savePending ?? defaultSavePending;
  const clearPending = dependencies.clearPending ?? defaultClearPending;
  const saveConfig = dependencies.saveConfig ?? defaultSaveConfig;
  const readRateLimits = dependencies.readRateLimits ?? defaultReadRateLimits;
  const collectUsage = dependencies.collectUsage ?? defaultCollectUsage;
  const post = dependencies.post ?? defaultPost;
  const now = (dependencies.now ?? (() => Math.floor(Date.now() / 1000)))();
  const config = await loadConfig();
  if (!config?.deviceToken || !config?.dashboardUrl || !config?.deviceId) throw new Error("SETUP_REQUIRED");

  const pending = await readPending();
  if (pending) {
    try {
      await upload(config, pending, post);
      await clearPending();
    } catch (error) {
      if (error.message === "DEVICE_AUTH_REQUIRED") throw error;
    }
  }

  let observed = null;
  try {
    observed = await readRateLimits();
  } catch {
    observed = null;
  }
  const remembered = config.lastKnownWindow;
  const rememberedActive = remembered &&
    remembered.windowDurationMins === WEEKLY_MINUTES &&
    remembered.resetsAt > now;
  const window = observed ?? (rememberedActive ? remembered : null);
  if (!window || window.windowDurationMins !== WEEKLY_MINUTES) throw new Error("WEEKLY_WINDOW_UNAVAILABLE");

  const usage = await collectUsage(window);
  const collectedAt = new Date(now * 1000).toISOString();
  const payload = {
    schemaVersion: 1,
    deviceId: config.deviceId,
    windowResetsAt: window.resetsAt,
    windowDurationMins: window.windowDurationMins,
    collectedAt,
    trackingStartedAt: config.trackingStartedAt,
    localUsageAvailable: true,
    rateLimitAvailable: Boolean(observed),
    sharedUsedPercent: observed?.usedPercent ?? null,
    collectorVersion: "0.1.0",
    totals: usage,
  };

  const nextConfig = {
    ...config,
    lastKnownWindow: { windowDurationMins: window.windowDurationMins, resetsAt: window.resetsAt },
    lastSuccessfulSyncAt: config.lastSuccessfulSyncAt ?? null,
  };
  await saveConfig(nextConfig);
  let queued = false;
  try {
    await upload(config, payload, post);
    await clearPending();
    nextConfig.lastSuccessfulSyncAt = collectedAt;
    await saveConfig(nextConfig);
  } catch (error) {
    if (error.message === "DEVICE_AUTH_REQUIRED") throw error;
    await savePending(payload);
    queued = true;
  }

  return {
    queued,
    member: config.memberDisplayName,
    computer: config.deviceDisplayName,
    dashboardUrl: config.dashboardUrl,
    windowResetsAt: window.resetsAt,
    sharedUsedPercent: observed?.usedPercent ?? null,
    totalTokens: usage.totalTokens,
    estimatedCostUsd: usage.estimatedCostUsd,
    collected: ["token totals", "model names", "estimated cost", "weekly rate-limit percentage and reset"],
    neverCollected: ["prompts", "responses", "source code", "file paths", "project names", "session ids", "browser cookies", "account credentials", "IP address fields"],
  };
}
