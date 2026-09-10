const WEEKLY_WINDOW_MINUTES = 10_080;
const FRESH_SECONDS = 24 * 60 * 60;

type UnknownRow = Record<string, unknown>;

export type DashboardRows = {
  members: UnknownRow[];
  devices: UnknownRow[];
  reports: UnknownRow[];
  observations: UnknownRow[];
};

export type DashboardQuality =
  | "partial"
  | "rate-limit-unavailable"
  | "unassigned";

export type ModelUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
  estimatedCostUsd: number | null;
};

export type UsageTotals = Omit<ModelUsage, "model"> & {
  modelBreakdown: ModelUsage[];
};

export type DeviceFreshness = "synced" | "out-of-sync" | "never-synced";

export type DashboardView = {
  generatedAt: string;
  sharedUsedPercent: number | null;
  unassignedPercent: number;
  weightBasis: "estimated-cost" | "tokens" | null;
  localUsage: UsageTotals | null;
  window: {
    startsAt: string | null;
    resetsAt: string | null;
    durationMins: number | null;
  };
  trackingStartedAt: string | null;
  quality: DashboardQuality[];
  members: Array<{
    id: string;
    displayName: string;
    quotaPercent: number;
    accountPercent: number;
    personalQuotaConsumedPercent: number;
    personalQuotaRemainingPercent: number;
    localUsage: UsageTotals | null;
    deviceCount: number;
    freshness: DeviceFreshness | null;
  }>;
  devices: Array<{
    id: string;
    memberId: string;
    displayName: string;
    platform: string;
    lastSyncAt: string | null;
    freshness: DeviceFreshness;
    hasCurrentReport: boolean;
    localUsage: UsageTotals | null;
  }>;
  previousWindows: Array<{
    resetsAt: string;
    sharedUsedPercent: number | null;
  }>;
};

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function iso(seconds: number | null) {
  return seconds === null ? null : new Date(seconds * 1000).toISOString();
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function usageFromReport(report: UnknownRow): UsageTotals {
  let parsedBreakdown: unknown = null;
  try {
    parsedBreakdown = JSON.parse(stringValue(report.model_breakdown_json));
  } catch {
    // A malformed per-model breakdown must not make the dashboard unavailable.
  }

  const modelBreakdown =
    parsedBreakdown &&
    typeof parsedBreakdown === "object" &&
    !Array.isArray(parsedBreakdown)
      ? Object.entries(parsedBreakdown)
          .filter((entry): entry is [string, UnknownRow] => {
            const value = entry[1];
            return (
              value !== null &&
              typeof value === "object" &&
              !Array.isArray(value)
            );
          })
          .map(([model, usage]) => ({
            model,
            inputTokens: numberValue(usage.inputTokens) ?? 0,
            outputTokens: numberValue(usage.outputTokens) ?? 0,
            cacheReadTokens: numberValue(usage.cacheReadTokens) ?? 0,
            cacheCreationTokens: numberValue(usage.cacheCreationTokens) ?? 0,
            totalTokens: numberValue(usage.totalTokens) ?? 0,
            estimatedCostUsd: numberValue(usage.estimatedCostUsd),
          }))
          .sort((left, right) => left.model.localeCompare(right.model))
      : [];

  return {
    inputTokens: numberValue(report.input_tokens) ?? 0,
    outputTokens: numberValue(report.output_tokens) ?? 0,
    cacheReadTokens: numberValue(report.cache_read_tokens) ?? 0,
    cacheCreationTokens: numberValue(report.cache_creation_tokens) ?? 0,
    totalTokens: numberValue(report.total_tokens) ?? 0,
    estimatedCostUsd: numberValue(report.estimated_cost_usd),
    modelBreakdown,
  };
}

function sumUsage(items: UsageTotals[]): UsageTotals {
  const models = new Map<string, ModelUsage[]>();
  for (const item of items) {
    for (const model of item.modelBreakdown) {
      models.set(model.model, [...(models.get(model.model) ?? []), model]);
    }
  }

  const sum = (values: Array<Omit<ModelUsage, "model">>) => ({
    inputTokens: values.reduce((total, value) => total + value.inputTokens, 0),
    outputTokens: values.reduce((total, value) => total + value.outputTokens, 0),
    cacheReadTokens: values.reduce(
      (total, value) => total + value.cacheReadTokens,
      0,
    ),
    cacheCreationTokens: values.reduce(
      (total, value) => total + value.cacheCreationTokens,
      0,
    ),
    totalTokens: values.reduce((total, value) => total + value.totalTokens, 0),
    estimatedCostUsd: values.every(
      (value) => value.estimatedCostUsd !== null,
    )
      ? round(
          values.reduce(
            (total, value) => total + (value.estimatedCostUsd ?? 0),
            0,
          ),
        )
      : null,
  });

  return {
    ...sum(items),
    modelBreakdown: [...models.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([model, usage]) => ({ model, ...sum(usage) })),
  };
}

function latestReportsForWindow(
  reports: UnknownRow[],
  activeDeviceIds: Set<string>,
  windowResetsAt: number,
) {
  const latest = new Map<string, UnknownRow>();
  for (const report of reports) {
    const deviceId = stringValue(report.device_id);
    if (
      !activeDeviceIds.has(deviceId) ||
      numberValue(report.window_resets_at) !== windowResetsAt ||
      numberValue(report.window_duration_mins) !== WEEKLY_WINDOW_MINUTES
    ) {
      continue;
    }
    const current = latest.get(deviceId);
    if (
      !current ||
      (numberValue(report.collected_at) ?? 0) >=
        (numberValue(current.collected_at) ?? 0)
    ) {
      latest.set(deviceId, report);
    }
  }
  return latest;
}

function previousWindows(
  observations: UnknownRow[],
  activeReset: number | null,
) {
  const latestByReset = new Map<number, UnknownRow>();
  for (const observation of observations) {
    const reset = numberValue(observation.window_resets_at);
    if (
      reset === null ||
      reset === activeReset ||
      numberValue(observation.window_duration_mins) !== WEEKLY_WINDOW_MINUTES
    ) {
      continue;
    }
    const current = latestByReset.get(reset);
    if (
      !current ||
      (numberValue(observation.observed_at) ?? 0) >
        (numberValue(current.observed_at) ?? 0)
    ) {
      latestByReset.set(reset, observation);
    }
  }

  const newest = [...latestByReset.entries()].sort(
    ([left], [right]) => right - left,
  )[0];
  if (!newest) return [];
  return [
    {
      resetsAt: iso(newest[0]) as string,
      sharedUsedPercent: numberValue(newest[1].shared_used_percent),
    },
  ];
}

export function buildDashboard(
  rows: DashboardRows,
  nowSeconds = Math.floor(Date.now() / 1000),
): DashboardView {
  const activeObservation = rows.observations
    .filter(
      (row) =>
        numberValue(row.window_duration_mins) === WEEKLY_WINDOW_MINUTES &&
        (numberValue(row.window_resets_at) ?? 0) > nowSeconds,
    )
    .sort(
      (left, right) =>
        (numberValue(right.observed_at) ?? 0) -
        (numberValue(left.observed_at) ?? 0),
    )[0];

  const windowResetsAt = activeObservation
    ? numberValue(activeObservation.window_resets_at)
    : null;
  const windowStartsAt =
    windowResetsAt === null
      ? null
      : windowResetsAt - WEEKLY_WINDOW_MINUTES * 60;
  const sharedUsedPercent = activeObservation
    ? numberValue(activeObservation.shared_used_percent)
    : null;

  const activeDeviceIds = new Set(
    rows.devices.map((device) => stringValue(device.id)),
  );
  const currentReports =
    windowResetsAt === null
      ? new Map<string, UnknownRow>()
      : latestReportsForWindow(
          rows.reports,
          activeDeviceIds,
          windowResetsAt,
        );
  const reportList = [...currentReports.values()];
  const usageByDevice = new Map(
    [...currentReports].map(([deviceId, report]) => [
      deviceId,
      usageFromReport(report),
    ]),
  );
  const weightBasis =
    reportList.length === 0
      ? null
      : reportList.every(
            (report) => numberValue(report.estimated_cost_usd) !== null,
          )
        ? "estimated-cost"
        : "tokens";

  const weightsByMember = new Map<string, number>();
  for (const report of reportList) {
    const memberId = stringValue(report.member_id);
    const weight =
      weightBasis === "estimated-cost"
        ? numberValue(report.estimated_cost_usd) ?? 0
        : numberValue(report.total_tokens) ?? 0;
    weightsByMember.set(memberId, (weightsByMember.get(memberId) ?? 0) + weight);
  }

  const memberRows = [...rows.members].sort(
    (left, right) =>
      (numberValue(left.slot) ?? 0) - (numberValue(right.slot) ?? 0),
  );
  const totalWeight = memberRows.reduce(
    (sum, member) => sum + (weightsByMember.get(stringValue(member.id)) ?? 0),
    0,
  );

  const unroundedAllocations = memberRows.map((member) => {
    if (sharedUsedPercent === null || totalWeight <= 0) return 0;
    return (
      (sharedUsedPercent *
        (weightsByMember.get(stringValue(member.id)) ?? 0)) /
      totalWeight
    );
  });
  const roundedAllocations = unroundedAllocations.map(round);
  if (sharedUsedPercent !== null && totalWeight > 0 && roundedAllocations.length) {
    const previousTotal = roundedAllocations
      .slice(0, -1)
      .reduce((sum, value) => sum + value, 0);
    roundedAllocations[roundedAllocations.length - 1] = round(
      sharedUsedPercent - previousTotal,
    );
  }

  const devices = rows.devices.map((device) => {
    const lastSyncAt = numberValue(device.last_sync_at);
    const freshness: DeviceFreshness =
      lastSyncAt === null
        ? "never-synced"
        : nowSeconds - lastSyncAt < FRESH_SECONDS
          ? "synced"
          : "out-of-sync";
    return {
      id: stringValue(device.id),
      memberId: stringValue(device.member_id),
      displayName: stringValue(device.display_name),
      platform: stringValue(device.platform),
      lastSyncAt: iso(lastSyncAt),
      freshness,
      hasCurrentReport: currentReports.has(stringValue(device.id)),
      localUsage: usageByDevice.get(stringValue(device.id)) ?? null,
    };
  });

  const freshnessRank = {
    synced: 0,
    "out-of-sync": 1,
    "never-synced": 2,
  } as const;
  const members = memberRows.map((member, index) => {
    const memberId = stringValue(member.id);
    const memberDevices = devices.filter(
      (device) => device.memberId === memberId,
    );
    const deviceUsage = memberDevices.flatMap((device) =>
      device.localUsage ? [device.localUsage] : [],
    );
    const quotaPercent = numberValue(member.quota_percent) ?? 50;
    const accountPercent = roundedAllocations[index] ?? 0;
    const consumed =
      quotaPercent > 0 ? round((accountPercent / quotaPercent) * 100) : 0;
    return {
      id: memberId,
      displayName: stringValue(member.display_name),
      quotaPercent,
      accountPercent,
      personalQuotaConsumedPercent: consumed,
      personalQuotaRemainingPercent: round(Math.max(0, 100 - consumed)),
      localUsage: deviceUsage.length > 0 ? sumUsage(deviceUsage) : null,
      deviceCount: memberDevices.length,
      freshness:
        memberDevices.length === 0
          ? null
          : memberDevices.reduce<DeviceFreshness>(
              (current, device) =>
                freshnessRank[device.freshness] > freshnessRank[current]
                  ? device.freshness
                  : current,
              "synced",
            ),
    };
  });

  const quality: DashboardQuality[] = [];
  if (sharedUsedPercent === null) quality.push("rate-limit-unavailable");
  const hasLateTracking =
    windowStartsAt !== null &&
    reportList.some(
      (report) =>
        (numberValue(report.tracking_started_at) ?? Number.POSITIVE_INFINITY) >
        windowStartsAt,
    );
  if (
    memberRows.length !== 2 ||
    devices.length === 0 ||
    devices.some(
      (device) =>
        device.freshness !== "synced" || !device.hasCurrentReport,
    ) ||
    hasLateTracking
  ) {
    quality.push("partial");
  }

  const unassignedPercent =
    sharedUsedPercent !== null && totalWeight <= 0
      ? round(sharedUsedPercent)
      : 0;
  if (unassignedPercent > 0) quality.push("unassigned");

  const trackingStartedAt = reportList.length
    ? Math.min(
        ...reportList.map(
          (report) =>
            numberValue(report.tracking_started_at) ?? Number.POSITIVE_INFINITY,
        ),
      )
    : null;

  return {
    generatedAt: iso(nowSeconds) as string,
    sharedUsedPercent,
    unassignedPercent,
    weightBasis,
    localUsage:
      usageByDevice.size > 0 ? sumUsage([...usageByDevice.values()]) : null,
    window: {
      startsAt: iso(windowStartsAt),
      resetsAt: iso(windowResetsAt),
      durationMins: windowResetsAt === null ? null : WEEKLY_WINDOW_MINUTES,
    },
    trackingStartedAt:
      trackingStartedAt === Number.POSITIVE_INFINITY
        ? null
        : iso(trackingStartedAt),
    quality,
    members,
    devices,
    previousWindows: previousWindows(rows.observations, windowResetsAt),
  };
}
