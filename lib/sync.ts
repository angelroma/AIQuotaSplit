import { hashDeviceToken } from "./auth";
import { syncReportSchema } from "./contracts";
import {
  findDeviceByTokenHash,
  type SyncReportRecordInput,
  upsertSyncReport,
} from "./repositories";

const MAX_REPORT_BYTES = 128 * 1024;
const WEEKLY_WINDOW_MINUTES = 7 * 24 * 60;
const CLOCK_SKEW_SECONDS = 5 * 60;

type SyncBindings = {
  db: D1Database;
};

type SyncRuntime = {
  now?: () => number;
  randomUUID?: () => string;
  findDevice?: typeof findDeviceByTokenHash;
  upsertReport?: typeof upsertSyncReport;
};

function jsonError(error: string, status: number) {
  return Response.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function bearerToken(request: Request) {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length >= 16 ? token : null;
}

function contentLengthTooLarge(request: Request) {
  const value = request.headers.get("Content-Length");
  if (!value) return false;
  const length = Number(value);
  return Number.isFinite(length) && length > MAX_REPORT_BYTES;
}

export async function postSyncReport(
  request: Request,
  bindings: SyncBindings,
  runtime: SyncRuntime = {},
) {
  const token = bearerToken(request);
  if (!token) return jsonError("DEVICE_AUTH_REQUIRED", 401);

  const tokenHash = await hashDeviceToken(token);
  const device = await (runtime.findDevice ?? findDeviceByTokenHash)(
    bindings.db,
    tokenHash,
  );
  if (!device || device.revokedAt !== null) {
    return jsonError("DEVICE_AUTH_REQUIRED", 401);
  }

  if (contentLengthTooLarge(request)) {
    return jsonError("REPORT_TOO_LARGE", 413);
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_REPORT_BYTES) {
    return jsonError("REPORT_TOO_LARGE", 413);
  }

  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    return jsonError("INVALID_REPORT", 422);
  }

  const parsed = syncReportSchema.safeParse(input);
  if (!parsed.success) return jsonError("INVALID_REPORT", 422);
  const report = parsed.data;

  if (report.windowDurationMins !== WEEKLY_WINDOW_MINUTES) {
    return jsonError("WEEKLY_WINDOW_REQUIRED", 422);
  }
  if (report.deviceId !== device.id) {
    return jsonError("DEVICE_MISMATCH", 403);
  }

  const collectedAt = Math.floor(Date.parse(report.collectedAt) / 1000);
  const trackingStartedAt = Math.floor(
    Date.parse(report.trackingStartedAt) / 1000,
  );
  const windowStartedAt =
    report.windowResetsAt - report.windowDurationMins * 60;
  const now = (runtime.now ?? (() => Math.floor(Date.now() / 1000)))();

  if (
    collectedAt < windowStartedAt ||
    collectedAt >= report.windowResetsAt ||
    trackingStartedAt < windowStartedAt ||
    trackingStartedAt > collectedAt ||
    collectedAt > now + CLOCK_SKEW_SECONDS ||
    now > report.windowResetsAt + CLOCK_SKEW_SECONDS
  ) {
    return jsonError("INVALID_WINDOW_TIME", 422);
  }

  const stored: SyncReportRecordInput = {
    id: (runtime.randomUUID ?? crypto.randomUUID)(),
    deviceId: report.deviceId,
    windowResetsAt: report.windowResetsAt,
    windowDurationMins: report.windowDurationMins,
    collectedAt,
    trackingStartedAt,
    inputTokens: report.totals.inputTokens,
    outputTokens: report.totals.outputTokens,
    cacheReadTokens: report.totals.cacheReadTokens,
    cacheCreationTokens: report.totals.cacheCreationTokens,
    totalTokens: report.totals.totalTokens,
    estimatedCostUsd: report.totals.estimatedCostUsd,
    modelBreakdownJson: JSON.stringify(report.totals.modelBreakdown),
    collectorVersion: report.collectorVersion,
    sharedUsedPercent: report.sharedUsedPercent,
    limitId: "codex",
  };

  await (runtime.upsertReport ?? upsertSyncReport)(bindings.db, stored);
  return Response.json(
    { accepted: true, windowResetsAt: report.windowResetsAt },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}
