import assert from "node:assert/strict";
import test from "node:test";

import { collectUsage } from "../ccusage.mjs";

const window = { windowDurationMins: 10_080, resetsAt: 1_789_646_400 };

test("ccusage sums aggregate model fields and drops project metadata", async () => {
  const result = await collectUsage(window, {
    run: async () => JSON.stringify({
      daily: [{
        date: "20260910",
        project: "/secret/project",
        modelBreakdowns: [
          { modelName: "gpt-5", inputTokens: 100, outputTokens: 25, cacheReadTokens: 20, cacheCreationTokens: 10, totalTokens: 155, costUSD: 0.4, sessionId: "secret" },
        ],
      }],
    }),
  });

  assert.equal(result.totalTokens, 155);
  assert.equal(result.estimatedCostUsd, 0.4);
  assert.equal(result.modelBreakdown["gpt-5"].cacheReadTokens, 20);
  assert.equal(JSON.stringify(result).includes("project"), false);
  assert.equal(JSON.stringify(result).includes("sessionId"), false);
});

test("ccusage invalid output is unavailable rather than zero", async () => {
  await assert.rejects(() => collectUsage(window, { run: async () => "not-json" }), /CCUSAGE_UNAVAILABLE/);
});
