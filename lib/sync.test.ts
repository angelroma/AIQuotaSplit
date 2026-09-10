import { describe, expect, it } from "vitest";

import { hashDeviceToken } from "./auth";
import { postSyncReport } from "./sync";
import { scriptedD1 } from "../test/fake-d1";

const deviceId = "018f4d0e-7b8d-7c3a-9af7-03c260b94f3b";
const memberId = "018f4d0e-7b8d-7c3a-9af7-03c260b94f3c";
const token = "collector-device-token";
const now = 2_000_000_000;
const resetsAt = now + 86_400;

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    deviceId,
    windowResetsAt: resetsAt,
    windowDurationMins: 10_080,
    collectedAt: new Date(now * 1000).toISOString(),
    trackingStartedAt: new Date((resetsAt - 10_080 * 60) * 1000).toISOString(),
    localUsageAvailable: true,
    rateLimitAvailable: true,
    sharedUsedPercent: 38,
    collectorVersion: "0.1.0",
    totals: {
      inputTokens: 5,
      outputTokens: 3,
      cacheReadTokens: 1,
      cacheCreationTokens: 1,
      totalTokens: 10,
      estimatedCostUsd: 0.1,
      modelBreakdown: {
        "gpt-5": {
          inputTokens: 5,
          outputTokens: 3,
          cacheReadTokens: 1,
          cacheCreationTokens: 1,
          totalTokens: 10,
          estimatedCostUsd: 0.1,
        },
      },
    },
    ...overrides,
  };
}

async function activeDevice() {
  return {
    id: deviceId,
    memberId,
    displayName: "Laptop",
    platform: "macos",
    tokenHash: await hashDeviceToken(token),
    registeredAt: 1,
    lastSyncAt: null,
    revokedAt: null,
  };
}

function request(payload: unknown, authorization = `Bearer ${token}`) {
  return new Request("https://aiquotasplit.example/api/sync", {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

describe("collector sync authentication", () => {
  it("rejects missing device credentials before reading a report", async () => {
    const response = await postSyncReport(
      request(validPayload(), ""),
      { db: scriptedD1([]).db },
      { now: () => now },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "DEVICE_AUTH_REQUIRED" });
  });

  it("does not reveal whether an unknown or revoked device exists", async () => {
    const unknown = await postSyncReport(
      request(validPayload()),
      { db: scriptedD1([]).db },
      { now: () => now, findDevice: async () => null },
    );
    const revoked = await postSyncReport(
      request(validPayload()),
      { db: scriptedD1([]).db },
      {
        now: () => now,
        findDevice: async () => ({ ...(await activeDevice()), revokedAt: 10 }),
      },
    );

    expect(unknown.status).toBe(401);
    expect(revoked.status).toBe(401);
    expect(await unknown.json()).toEqual(await revoked.json());
  });
});

describe("collector sync validation", () => {
  it("accepts only the exact seven-day Codex window", async () => {
    const response = await postSyncReport(
      request(validPayload({ windowDurationMins: 300 })),
      { db: scriptedD1([]).db },
      { now: () => now, findDevice: activeDevice },
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "WEEKLY_WINDOW_REQUIRED" });
  });

  it("rejects a device id that does not match the bearer token", async () => {
    const response = await postSyncReport(
      request(
        validPayload({
          deviceId: "018f4d0e-7b8d-7c3a-9af7-03c260b94f40",
        }),
      ),
      { db: scriptedD1([]).db },
      { now: () => now, findDevice: activeDevice },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "DEVICE_MISMATCH" });
  });

  it("rejects reports from outside their stated window", async () => {
    const response = await postSyncReport(
      request(
        validPayload({
          collectedAt: new Date((resetsAt + 1) * 1000).toISOString(),
        }),
      ),
      { db: scriptedD1([]).db },
      { now: () => resetsAt + 1, findDevice: activeDevice },
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "INVALID_WINDOW_TIME" });
  });

  it("rejects reports larger than 128 KiB", async () => {
    const oversized = `${JSON.stringify(validPayload())}${" ".repeat(131_073)}`;
    const response = await postSyncReport(
      new Request("https://aiquotasplit.example/api/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: oversized,
      }),
      { db: scriptedD1([]).db },
      { now: () => now, findDevice: activeDevice },
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "REPORT_TOO_LARGE" });
  });

  it("stores only validated aggregate usage", async () => {
    const stored: unknown[] = [];
    const response = await postSyncReport(
      request(validPayload()),
      { db: scriptedD1([]).db },
      {
        now: () => now,
        randomUUID: () => "report-id",
        findDevice: activeDevice,
        upsertReport: async (_db, report) => {
          stored.push(report);
        },
      },
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true, windowResetsAt: resetsAt });
    expect(stored).toEqual([
      expect.objectContaining({
        id: "report-id",
        deviceId,
        totalTokens: 10,
        sharedUsedPercent: 38,
        limitId: "codex",
      }),
    ]);
    expect(JSON.stringify(stored)).not.toContain("Laptop");
  });
});
