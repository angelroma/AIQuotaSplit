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

export type DashboardView = {
  generatedAt: string;
  sharedUsedPercent: number | null;
  unassignedPercent: number;
  weightBasis: "estimated-cost" | "tokens" | null;
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
  }>;
  devices: Array<{
    id: string;
    memberId: string;
    displayName: string;
    platform: string;
    lastSyncAt: string | null;
    freshness: "synced" | "out-of-sync" | "never-synced";
    hasCurrentReport: boolean;
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

  const members = memberRows.map((member, index) => {
    const quotaPercent = numberValue(member.quota_percent) ?? 50;
    const accountPercent = roundedAllocations[index] ?? 0;
    const consumed = quotaPercent > 0 ? round((accountPercent / quotaPercent) * 100) : 0;
    return {
      id: stringValue(member.id),
      displayName: stringValue(member.display_name),
      quotaPercent,
      accountPercent,
      personalQuotaConsumedPercent: consumed,
      personalQuotaRemainingPercent: round(Math.max(0, 100 - consumed)),
    };
  });

  const devices = rows.devices.map((device) => {
    const lastSyncAt = numberValue(device.last_sync_at);
    const freshness =
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
