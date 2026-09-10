import assert from "node:assert/strict";
import test from "node:test";

import { readRateLimits, selectWeeklyRateLimit } from "../app-server.mjs";

test("app-server initializes and verifies the account before reading rate limits", async () => {
  const calls = [];
  const observed = await readRateLimits({
    runAppServer: async (messages) => {
      calls.push(...messages);
      return new Map([
        [0, { protocolVersion: "2025-01-01" }],
        [1, { account: { type: "chatgpt" } }],
        [2, {
          rateLimitsByLimitId: {
            codex: {
              primary: { usedPercent: 12, windowDurationMins: 300, resetsAt: 1_789_640_000 },
              secondary: { usedPercent: 38, windowDurationMins: 10_080, resetsAt: 1_789_646_400 },
            },
          },
        }],
      ]);
    },
  });

  assert.deepEqual(calls.map((message) => message.method), [
    "initialize",
    "initialized",
    "account/read",
    "account/rateLimits/read",
  ]);
  assert.deepEqual(observed, {
    usedPercent: 38,
    windowDurationMins: 10_080,
    resetsAt: 1_789_646_400,
  });
});

test("weekly selection fails closed instead of choosing a nearby window", () => {
  assert.equal(selectWeeklyRateLimit({ primary: { usedPercent: 5, windowDurationMins: 10_000, resetsAt: 2 } }), null);
});
