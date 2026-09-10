import assert from "node:assert/strict";
import test from "node:test";

import { synchronize } from "../sync.mjs";

const config = {
  schemaVersion: 1,
  dashboardUrl: "https://quota.example",
  memberId: "member",
  memberDisplayName: "Miguel",
  deviceId: "device",
  deviceDisplayName: "Laptop",
  deviceToken: "secret-token",
  trackingStartedAt: "2026-01-01T00:00:00.000Z",
  lastKnownWindow: null,
  privacyAcceptedVersion: 1,
};

test("ccusage failure never uploads zero usage", async () => {
  const posted = [];
  await assert.rejects(() => synchronize({
    loadConfig: async () => config,
    readPending: async () => null,
    readRateLimits: async () => ({ usedPercent: 38, windowDurationMins: 10_080, resetsAt: 2_000_100_000 }),
    collectUsage: async () => { throw new Error("CCUSAGE_UNAVAILABLE"); },
    post: async (...args) => { posted.push(args); },
    now: () => 2_000_000_000,
  }), /CCUSAGE_UNAVAILABLE/);
  assert.equal(posted.length, 0);
});

test("no exact weekly window means ccusage is not run", async () => {
  let collected = false;
  await assert.rejects(() => synchronize({
    loadConfig: async () => config,
    readPending: async () => null,
    readRateLimits: async () => null,
    collectUsage: async () => { collected = true; },
    now: () => 2_000_000_000,
  }), /WEEKLY_WINDOW_UNAVAILABLE/);
  assert.equal(collected, false);
});

test("sync requires the persisted privacy acknowledgement", async () => {
  let collected = false;
  await assert.rejects(() => synchronize({
    loadConfig: async () => ({ ...config, privacyAcceptedVersion: undefined }),
    readPending: async () => null,
    collectUsage: async () => { collected = true; },
    now: () => 2_000_000_000,
  }), /PRIVACY_CONFIRMATION_REQUIRED/);
  assert.equal(collected, false);
});

test("a permanent 422 rejection is not queued", async () => {
  let queued = false;
  await assert.rejects(() => synchronize({
    loadConfig: async () => config,
    readPending: async () => null,
    readRateLimits: async () => ({ usedPercent: 38, windowDurationMins: 10_080, resetsAt: 2_000_100_000 }),
    collectUsage: async () => ({ inputTokens: 1, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 1, estimatedCostUsd: null, modelBreakdown: { codex: { inputTokens: 1, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 1, estimatedCostUsd: null } } }),
    post: async () => ({ ok: false, status: 422 }),
    saveConfig: async () => {},
    savePending: async () => { queued = true; },
    now: () => 2_000_000_000,
  }), /SYNC_REJECTED/);
  assert.equal(queued, false);
});

test("a successful current upload does not delete an unrelated older pending window", async () => {
  let cleared = false;
  let posts = 0;
  const oldPending = { deviceId: "device", windowResetsAt: 1_999_000_000, collectedAt: "2026-01-01T00:00:00.000Z" };
  await synchronize({
    loadConfig: async () => config,
    readPending: async () => oldPending,
    readRateLimits: async () => ({ usedPercent: 38, windowDurationMins: 10_080, resetsAt: 2_000_100_000 }),
    collectUsage: async () => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0, estimatedCostUsd: 0, modelBreakdown: {} }),
    post: async () => ({ ok: ++posts > 1, status: posts > 1 ? 202 : 503 }),
    clearPending: async () => { cleared = true; },
    saveConfig: async () => {},
    savePending: async () => {},
    now: () => 2_000_000_000,
  });
  assert.equal(cleared, false);
});
