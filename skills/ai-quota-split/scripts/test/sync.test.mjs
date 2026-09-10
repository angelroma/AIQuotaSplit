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
