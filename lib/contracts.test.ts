import { describe, expect, it } from "vitest";

import { syncReportSchema } from "./contracts";

const valid = {
  schemaVersion: 1,
  deviceId: "018f4d0e-7b8d-7c3a-9af7-03c260b94f3b",
  windowResetsAt: 1_789_646_400,
  windowDurationMins: 10_080,
  collectedAt: "2026-09-10T15:00:00.000Z",
  trackingStartedAt: "2026-09-10T14:00:00.000Z",
  localUsageAvailable: true,
  rateLimitAvailable: true,
  sharedUsedPercent: 38,
  collectorVersion: "0.1.0",
  totals: {
    inputTokens: 100,
    outputTokens: 40,
    cacheReadTokens: 10,
    cacheCreationTokens: 5,
    totalTokens: 155,
    estimatedCostUsd: 0.22,
    modelBreakdown: {
      "gpt-5.6-sol": {
        inputTokens: 100,
        outputTokens: 40,
        cacheReadTokens: 10,
        cacheCreationTokens: 5,
        totalTokens: 155,
        estimatedCostUsd: 0.22,
      },
    },
  },
} as const;

describe("syncReportSchema", () => {
  it("accepts and canonicalizes the stable v1 payload", () => {
    const result = syncReportSchema.parse({
      ...valid,
      collectedAt: "2026-09-10T10:00:00-05:00",
    });

    expect(result.deviceId).toBe(valid.deviceId);
    expect(result.collectedAt).toBe("2026-09-10T15:00:00.000Z");
  });

  it.each([
    [{ ...valid, sharedUsedPercent: 101 }, "sharedUsedPercent"],
    [{ ...valid, windowDurationMins: 0 }, "windowDurationMins"],
    [{ ...valid, deviceId: "not-a-uuid" }, "deviceId"],
    [
      { ...valid, totals: { ...valid.totals, totalTokens: -1 } },
      "totalTokens",
    ],
  ])("rejects invalid ranges", (payload, field) => {
    expect(() => syncReportSchema.parse(payload)).toThrow(field);
  });

  it("rejects a tracking start after collection", () => {
    expect(() =>
      syncReportSchema.parse({
        ...valid,
        trackingStartedAt: "2026-09-11T00:00:00.000Z",
      }),
    ).toThrow("trackingStartedAt");
  });

  it("requires the rate-limit flag and percentage to agree", () => {
    expect(() =>
      syncReportSchema.parse({
        ...valid,
        rateLimitAvailable: false,
      }),
    ).toThrow("sharedUsedPercent");
  });

  it("rejects totals that do not equal their components", () => {
    expect(() =>
      syncReportSchema.parse({
        ...valid,
        totals: { ...valid.totals, totalTokens: 154 },
      }),
    ).toThrow("totalTokens");
  });

  it("rejects a model breakdown that does not reconcile", () => {
    expect(() =>
      syncReportSchema.parse({
        ...valid,
        totals: {
          ...valid.totals,
          modelBreakdown: {
            "gpt-5.6-sol": {
              ...valid.totals.modelBreakdown["gpt-5.6-sol"],
              totalTokens: 154,
            },
          },
        },
      }),
    ).toThrow("modelBreakdown");
  });
});
