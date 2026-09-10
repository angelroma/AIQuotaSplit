import { describe, expect, it } from "vitest";

import { buildDashboard, type DashboardRows } from "./allocation";

const NOW = 2_000_000_000;
const RESET = NOW + 86_400;
const PREVIOUS_RESET = RESET - 10_080 * 60;

function fixture(options: {
  sharedUsedPercent?: number;
  costs?: Array<number | null>;
  tokens?: number[];
  deviceAgeSeconds?: number;
  omitSecondReport?: boolean;
  trackingLate?: boolean;
} = {}): DashboardRows {
  const costs = options.costs ?? [3, 1];
  const tokens = options.tokens ?? [300, 100];
  const collectedAt = NOW - (options.deviceAgeSeconds ?? 60);
  const reports = [0, 1]
    .filter((index) => !(index === 1 && options.omitSecondReport))
    .map((index) => ({
      id: `report-${index}`,
      device_id: `device-${index}`,
      member_id: `member-${index}`,
      window_resets_at: RESET,
      window_duration_mins: 10_080,
      collected_at: collectedAt,
      tracking_started_at: options.trackingLate
        ? RESET - 1_000
        : RESET - 10_080 * 60,
      input_tokens: tokens[index] - 30,
      output_tokens: 10,
      cache_read_tokens: 15,
      cache_creation_tokens: 5,
      total_tokens: tokens[index],
      estimated_cost_usd: costs[index],
      model_breakdown_json: JSON.stringify({
        "gpt-5": {
          inputTokens: tokens[index] - 30,
          outputTokens: 10,
          cacheReadTokens: 15,
          cacheCreationTokens: 5,
          totalTokens: tokens[index],
          estimatedCostUsd: costs[index],
        },
      }),
    }));

  return {
    members: [0, 1].map((index) => ({
      id: `member-${index}`,
      slot: index + 1,
      display_name: index === 0 ? "Miguel" : "Mauro",
      quota_percent: 50,
    })),
    devices: [0, 1].map((index) => ({
      id: `device-${index}`,
      member_id: `member-${index}`,
      display_name: `Laptop ${index + 1}`,
      platform: "macos",
      last_sync_at: collectedAt,
    })),
    reports,
    observations: [
      {
        id: "observation-current",
        window_resets_at: RESET,
        window_duration_mins: 10_080,
        observed_at: NOW - 30,
        shared_used_percent: options.sharedUsedPercent ?? 38,
      },
    ],
  };
}

describe("buildDashboard", () => {
  it("allocates shared usage by current device cost when all costs exist", () => {
    const result = buildDashboard(fixture(), NOW);

    expect(result.weightBasis).toBe("estimated-cost");
    expect(result.members.map((member) => member.accountPercent)).toEqual([
      28.5,
      9.5,
    ]);
    expect(
      result.members.map((member) => member.personalQuotaConsumedPercent),
    ).toEqual([57, 19]);
    expect(result.unassignedPercent).toBe(0);
    expect(result.localUsage).toMatchObject({
      totalTokens: 400,
      estimatedCostUsd: 4,
    });
    expect(result.members[0].localUsage).toMatchObject({
      totalTokens: 300,
      estimatedCostUsd: 3,
    });
    expect(result.members[0].deviceCount).toBe(1);
    expect(result.members[0].freshness).toBe("synced");
    expect(result.devices[0].localUsage?.modelBreakdown[0]).toMatchObject({
      model: "gpt-5",
      totalTokens: 300,
      estimatedCostUsd: 3,
    });
  });

  it("aggregates two computers assigned to the same member", () => {
    const rows = fixture();
    rows.devices[1].member_id = "member-0";
    rows.devices[1].last_sync_at = NOW - 24 * 60 * 60;
    rows.reports[1].member_id = "member-0";

    const result = buildDashboard(rows, NOW);

    expect(result.members[0].deviceCount).toBe(2);
    expect(result.members[0].freshness).toBe("out-of-sync");
    expect(result.members[0].localUsage).toMatchObject({
      totalTokens: 400,
      estimatedCostUsd: 4,
    });
    expect(result.members[0].localUsage?.modelBreakdown).toEqual([
      expect.objectContaining({
        model: "gpt-5",
        totalTokens: 400,
        estimatedCostUsd: 4,
      }),
    ]);
  });

  it("keeps estimated usage cost unavailable when any current cost is null", () => {
    const result = buildDashboard(fixture({ costs: [3, null] }), NOW);

    expect(result.localUsage?.estimatedCostUsd).toBeNull();
    expect(result.members[0].localUsage?.estimatedCostUsd).toBe(3);
    expect(result.members[1].localUsage?.estimatedCostUsd).toBeNull();
    expect(result.devices[1].localUsage?.estimatedCostUsd).toBeNull();
  });

  it("uses only the newest report for each computer in usage totals", () => {
    const rows = fixture();
    rows.reports.push({
      ...rows.reports[0],
      id: "newer-device-0-report",
      collected_at: NOW - 1,
      input_tokens: 470,
      total_tokens: 500,
      estimated_cost_usd: 5,
      model_breakdown_json: JSON.stringify({
        "gpt-5": {
          inputTokens: 470,
          outputTokens: 10,
          cacheReadTokens: 15,
          cacheCreationTokens: 5,
          totalTokens: 500,
          estimatedCostUsd: 5,
        },
      }),
    });

    const result = buildDashboard(rows, NOW);

    expect(result.localUsage).toMatchObject({
      totalTokens: 600,
      estimatedCostUsd: 6,
    });
    expect(result.devices[0].localUsage).toMatchObject({
      totalTokens: 500,
      estimatedCostUsd: 5,
    });
  });

  it("ignores malformed model breakdown JSON", () => {
    const rows = fixture();
    rows.reports[0].model_breakdown_json = "{not json";

    const result = buildDashboard(rows, NOW);

    expect(result.devices[0].localUsage?.modelBreakdown).toEqual([]);
    expect(result.devices[0].localUsage?.totalTokens).toBe(300);
  });

  it("reports null usage and freshness for a member without computers", () => {
    const rows = fixture();
    rows.devices = [rows.devices[0]];
    rows.reports = [rows.reports[0]];

    const result = buildDashboard(rows, NOW);

    expect(result.members[1].deviceCount).toBe(0);
    expect(result.members[1].freshness).toBeNull();
    expect(result.members[1].localUsage).toBeNull();
  });

  it("uses tokens for every device when any current report has no cost", () => {
    const result = buildDashboard(
      fixture({ costs: [3, null], tokens: [100, 300] }),
      NOW,
    );

    expect(result.weightBasis).toBe("tokens");
    expect(result.members.map((member) => member.accountPercent)).toEqual([
      9.5,
      28.5,
    ]);
  });

  it("keeps account usage unassigned when local weight is zero", () => {
    const result = buildDashboard(
      fixture({ costs: [0, 0], tokens: [0, 0] }),
      NOW,
    );

    expect(result.unassignedPercent).toBe(38);
    expect(result.quality).toContain("unassigned");
    expect(result.members.map((member) => member.accountPercent)).toEqual([0, 0]);
  });

  it("retains the newest valid observation and exposes only the previous window", () => {
    const rows = fixture();
    rows.observations.push(
      {
        id: "newer-current-observation",
        window_resets_at: RESET,
        window_duration_mins: 10_080,
        observed_at: NOW - 5,
        shared_used_percent: 12,
      },
      {
        id: "previous-observation",
        window_resets_at: PREVIOUS_RESET,
        window_duration_mins: 10_080,
        observed_at: NOW - 100_000,
        shared_used_percent: 81,
      },
      {
        id: "older-previous-observation",
        window_resets_at: PREVIOUS_RESET - 10_080 * 60,
        window_duration_mins: 10_080,
        observed_at: NOW - 200_000,
        shared_used_percent: 65,
      },
    );

    const result = buildDashboard(rows, NOW);

    expect(result.window.resetsAt).toBe(new Date(RESET * 1000).toISOString());
    expect(result.sharedUsedPercent).toBe(12);
    expect(result.previousWindows).toEqual([
      {
        resetsAt: new Date(PREVIOUS_RESET * 1000).toISOString(),
        sharedUsedPercent: 81,
      },
    ]);
  });

  it.each([
    [23 * 60 * 60, "synced"],
    [24 * 60 * 60, "out-of-sync"],
  ] as const)("classifies a device aged %s seconds as %s", (age, status) => {
    const result = buildDashboard(fixture({ deviceAgeSeconds: age }), NOW);
    expect(result.devices[0].freshness).toBe(status);
  });

  it("marks missing, stale, and late-start reports as partial", () => {
    const missing = buildDashboard(fixture({ omitSecondReport: true }), NOW);
    const stale = buildDashboard(
      fixture({ deviceAgeSeconds: 24 * 60 * 60 }),
      NOW,
    );
    const late = buildDashboard(fixture({ trackingLate: true }), NOW);

    expect(missing.quality).toContain("partial");
    expect(stale.quality).toContain("partial");
    expect(late.quality).toContain("partial");
  });

  it("reports unavailable when there is no active weekly observation", () => {
    const rows = fixture();
    rows.observations = [];
    const result = buildDashboard(rows, NOW);

    expect(result.sharedUsedPercent).toBeNull();
    expect(result.window.resetsAt).toBeNull();
    expect(result.quality).toContain("rate-limit-unavailable");
  });
});
