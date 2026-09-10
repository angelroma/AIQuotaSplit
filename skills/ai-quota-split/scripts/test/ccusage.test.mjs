import assert from "node:assert/strict";
import test from "node:test";

import { buildCcusageArgs, collectUsage } from "../ccusage.mjs";

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

test("documented type/data/summary totals do not parse as zero", async () => {
  const result = await collectUsage(window, {
    run: async () => JSON.stringify({
      type: "daily",
      data: [{
        date: "2026-09-10",
        models: ["gpt-5", "gpt-5-mini"],
        totalInputTokens: 100,
        totalOutputTokens: 25,
        totalCacheReadTokens: 20,
        totalCacheCreationTokens: 10,
        totalCostUSD: 0.4,
      }],
      summary: { totalTokens: 155 },
    }),
  });

  assert.equal(result.totalTokens, 155);
  assert.equal(result.estimatedCostUsd, 0.4);
  assert.deepEqual(Object.keys(result.modelBreakdown), ["all-models"]);
});

test("ccusage 20 model maps keep aggregate totals and expose each model", async () => {
  const result = await collectUsage(window, {
    run: async () => JSON.stringify({
      daily: [{
        date: "2026-09-10",
        inputTokens: 7_415_992,
        outputTokens: 746_896,
        cacheCreationTokens: 0,
        cacheReadTokens: 254_993_280,
        totalTokens: 263_156_168,
        costUSD: 186.98348,
        models: {
          "gpt-5.5": {
            inputTokens: 2_204_060,
            outputTokens: 24_747,
            cacheCreationTokens: 0,
            cacheReadTokens: 11_217_664,
            totalTokens: 13_446_471,
          },
          "gpt-5.6-sol": {
            inputTokens: 5_211_932,
            outputTokens: 722_149,
            cacheCreationTokens: 0,
            cacheReadTokens: 243_775_616,
            totalTokens: 249_709_697,
          },
        },
      }],
      totals: {
        inputTokens: 7_415_992,
        outputTokens: 746_896,
        cacheCreationTokens: 0,
        cacheReadTokens: 254_993_280,
        totalTokens: 263_156_168,
        costUSD: 186.98348,
      },
    }),
  });

  assert.equal(result.totalTokens, 263_156_168);
  assert.equal(result.estimatedCostUsd, 186.98348);
  assert.deepEqual(Object.keys(result.modelBreakdown), ["gpt-5.5", "gpt-5.6-sol"]);
  assert.equal(result.modelBreakdown["gpt-5.5"].totalTokens, 13_446_471);
  assert.equal(result.modelBreakdown["gpt-5.5"].estimatedCostUsd, null);
});

test("npx and ccusage both receive offline mode", () => {
  const args = buildCcusageArgs("20260901", "20260908");
  assert.equal(args.filter((value) => value === "--offline").length, 2);
  assert.ok(args.indexOf("daily") < args.lastIndexOf("--offline"));
});
