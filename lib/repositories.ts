export type MemberRecord = {
  id: string;
  slot: number;
  displayName: string;
  normalizedName: string;
  quotaPercent: number;
  createdAt: number;
  updatedAt: number;
};

export type DeviceRecord = {
  id: string;
  memberId: string;
  displayName: string;
  platform: string;
  tokenHash: string;
  registeredAt: number;
  lastSyncAt: number | null;
  revokedAt: number | null;
};

type MemberRow = {
  id: string;
  slot: number;
  display_name: string;
  normalized_name: string;
  quota_percent: number;
  created_at: number;
  updated_at: number;
};

type DeviceRow = {
  id: string;
  member_id: string;
  display_name: string;
  platform: string;
  token_hash: string;
  registered_at: number;
  last_sync_at: number | null;
  revoked_at: number | null;
};

function memberFromRow(row: MemberRow): MemberRecord {
  return {
    id: row.id,
    slot: row.slot,
    displayName: row.display_name,
    normalizedName: row.normalized_name,
    quotaPercent: row.quota_percent,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function deviceFromRow(row: DeviceRow): DeviceRecord {
  return {
    id: row.id,
    memberId: row.member_id,
    displayName: row.display_name,
    platform: row.platform,
    tokenHash: row.token_hash,
    registeredAt: row.registered_at,
    lastSyncAt: row.last_sync_at,
    revokedAt: row.revoked_at,
  };
}

export async function listMembers(db: D1Database) {
  const result = await db
    .prepare(
      `SELECT m.id, m.slot, m.display_name, m.normalized_name,
              m.quota_percent, m.created_at, m.updated_at,
              COUNT(d.id) AS device_count
       FROM members m
       LEFT JOIN devices d ON d.member_id = m.id AND d.revoked_at IS NULL
       GROUP BY m.id
       ORDER BY m.slot`,
    )
    .all<MemberRow & { device_count: number }>();

  return result.results.map((row) => ({
    ...memberFromRow(row),
    deviceCount: Number(row.device_count),
  }));
}

export async function createMember(
  db: D1Database,
  input: {
    id: string;
    displayName: string;
    normalizedName: string;
    now: number;
  },
) {
  const inserted = await db
    .prepare(
      `WITH available_slots(slot) AS (VALUES (1), (2)),
            next_slot AS (
              SELECT slot FROM available_slots
              WHERE NOT EXISTS (SELECT 1 FROM members WHERE members.slot = available_slots.slot)
              ORDER BY slot
              LIMIT 1
            )
       INSERT INTO members (
         id, slot, display_name, normalized_name, quota_percent, created_at, updated_at
       )
       SELECT ?, next_slot.slot, ?, ?, 50, ?, ?
       FROM next_slot
       WHERE NOT EXISTS (
         SELECT 1 FROM members WHERE normalized_name = ?
       )
       RETURNING id, slot, display_name, normalized_name, quota_percent, created_at, updated_at`,
    )
    .bind(
      input.id,
      input.displayName,
      input.normalizedName,
      input.now,
      input.now,
      input.normalizedName,
    )
    .first<MemberRow>();

  if (inserted) {
    return memberFromRow(inserted);
  }

  const duplicate = await db
    .prepare("SELECT id FROM members WHERE normalized_name = ? LIMIT 1")
    .bind(input.normalizedName)
    .first<{ id: string }>();

  throw new Error(duplicate ? "MEMBER_NAME_EXISTS" : "MEMBER_LIMIT_REACHED");
}

export async function findDeviceByTokenHash(
  db: D1Database,
  tokenHash: string,
) {
  const row = await db
    .prepare(
      `SELECT id, member_id, display_name, platform, token_hash,
              registered_at, last_sync_at, revoked_at
       FROM devices WHERE token_hash = ? LIMIT 1`,
    )
    .bind(tokenHash)
    .first<DeviceRow>();

  return row ? deviceFromRow(row) : null;
}

export async function registerDevice(
  db: D1Database,
  input: {
    deviceId: string;
    memberId: string;
    displayName: string;
    platform: string;
    tokenHash: string;
    reassign: boolean;
    now: number;
  },
) {
  const existing = await db
    .prepare(
      `SELECT id, member_id, display_name, platform, token_hash,
              registered_at, last_sync_at, revoked_at
       FROM devices WHERE id = ? LIMIT 1`,
    )
    .bind(input.deviceId)
    .first<DeviceRow>();

  if (!existing) {
    const created = await db
      .prepare(
        `INSERT INTO devices (
           id, member_id, display_name, platform, token_hash, registered_at
         ) VALUES (?, ?, ?, ?, ?, ?)
         RETURNING id, member_id, display_name, platform, token_hash,
                   registered_at, last_sync_at, revoked_at`,
      )
      .bind(
        input.deviceId,
        input.memberId,
        input.displayName,
        input.platform,
        input.tokenHash,
        input.now,
      )
      .first<DeviceRow>();

    if (!created) {
      throw new Error("DEVICE_REGISTRATION_FAILED");
    }
    return { device: deviceFromRow(created), created: true };
  }

  if (existing.revoked_at !== null) {
    throw new Error("DEVICE_REVOKED");
  }

  if (existing.member_id !== input.memberId && !input.reassign) {
    throw new Error("DEVICE_REASSIGN_CONFIRMATION_REQUIRED");
  }

  if (existing.member_id !== input.memberId) {
    const active = await db
      .prepare(
        `SELECT 1 AS active FROM sync_reports
         WHERE device_id = ? AND window_resets_at > ?
         LIMIT 1`,
      )
      .bind(input.deviceId, input.now)
      .first<{ active: number }>();
    if (active) {
      throw new Error("DEVICE_ACTIVE_WINDOW_REASSIGN_BLOCKED");
    }
  }

  const updated = await db
    .prepare(
      `UPDATE devices
       SET member_id = ?, display_name = ?, platform = ?
       WHERE id = ?
       RETURNING id, member_id, display_name, platform, token_hash,
                 registered_at, last_sync_at, revoked_at`,
    )
    .bind(
      input.memberId,
      input.displayName,
      input.platform,
      input.deviceId,
    )
    .first<DeviceRow>();

  if (!updated) {
    throw new Error("DEVICE_REGISTRATION_FAILED");
  }
  return { device: deviceFromRow(updated), created: false };
}

export type SyncReportRecordInput = {
  id: string;
  deviceId: string;
  windowResetsAt: number;
  windowDurationMins: number;
  collectedAt: number;
  trackingStartedAt: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
  estimatedCostUsd: number | null;
  modelBreakdownJson: string;
  collectorVersion: string;
  sharedUsedPercent: number | null;
  limitId: string;
};

export async function upsertSyncReport(
  db: D1Database,
  input: SyncReportRecordInput,
) {
  const device = await db
    .prepare(
      "SELECT id, member_id, revoked_at FROM devices WHERE id = ? LIMIT 1",
    )
    .bind(input.deviceId)
    .first<{ id: string; member_id: string; revoked_at?: number | null }>();

  if (!device || device.revoked_at != null) {
    throw new Error("DEVICE_AUTH_REQUIRED");
  }

  const report = db
    .prepare(
      `INSERT INTO sync_reports (
         id, device_id, member_id, window_resets_at, window_duration_mins,
         collected_at, tracking_started_at, input_tokens, output_tokens,
         cache_read_tokens, cache_creation_tokens, total_tokens,
         estimated_cost_usd, model_breakdown_json, local_usage_available,
         collector_version
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(device_id, window_resets_at) DO UPDATE SET
         member_id = excluded.member_id,
         window_duration_mins = excluded.window_duration_mins,
         collected_at = excluded.collected_at,
         tracking_started_at = excluded.tracking_started_at,
         input_tokens = excluded.input_tokens,
         output_tokens = excluded.output_tokens,
         cache_read_tokens = excluded.cache_read_tokens,
         cache_creation_tokens = excluded.cache_creation_tokens,
         total_tokens = excluded.total_tokens,
         estimated_cost_usd = excluded.estimated_cost_usd,
         model_breakdown_json = excluded.model_breakdown_json,
         local_usage_available = excluded.local_usage_available,
         collector_version = excluded.collector_version
       WHERE excluded.collected_at >= sync_reports.collected_at`,
    )
    .bind(
      input.id,
      input.deviceId,
      device.member_id,
      input.windowResetsAt,
      input.windowDurationMins,
      input.collectedAt,
      input.trackingStartedAt,
      input.inputTokens,
      input.outputTokens,
      input.cacheReadTokens,
      input.cacheCreationTokens,
      input.totalTokens,
      input.estimatedCostUsd,
      input.modelBreakdownJson,
      input.collectorVersion,
    );

  const statements = [report];
  if (input.sharedUsedPercent !== null) {
    statements.push(
      db
        .prepare(
          `INSERT INTO rate_limit_observations (
             id, device_id, limit_id, window_resets_at,
             window_duration_mins, observed_at, shared_used_percent
           ) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(device_id, window_resets_at, observed_at) DO UPDATE SET
             limit_id = excluded.limit_id,
             window_duration_mins = excluded.window_duration_mins,
             shared_used_percent = excluded.shared_used_percent`,
        )
        .bind(
          crypto.randomUUID(),
          input.deviceId,
          input.limitId,
          input.windowResetsAt,
          input.windowDurationMins,
          input.collectedAt,
          input.sharedUsedPercent,
        ),
    );
  }

  statements.push(
    db
      .prepare(
        `UPDATE devices SET last_sync_at = MAX(COALESCE(last_sync_at, 0), ?)
         WHERE id = ?`,
      )
      .bind(input.collectedAt, input.deviceId),
  );

  await db.batch(statements);
}

export async function revokeDevice(
  db: D1Database,
  deviceId: string,
  now: number,
) {
  const result = await db
    .prepare(
      "UPDATE devices SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
    )
    .bind(now, deviceId)
    .run();
  return result.meta.changes > 0;
}

export async function loadDashboardRows(db: D1Database) {
  const [memberRows, deviceRows, reportRows, observationRows] =
    await Promise.all([
      db.prepare("SELECT * FROM members ORDER BY slot").all<Record<string, unknown>>(),
      db
        .prepare("SELECT * FROM devices WHERE revoked_at IS NULL ORDER BY registered_at")
        .all<Record<string, unknown>>(),
      db
        .prepare(
          `SELECT * FROM sync_reports
           ORDER BY window_resets_at DESC, collected_at DESC`,
        )
        .all<Record<string, unknown>>(),
      db
        .prepare(
          `SELECT * FROM rate_limit_observations
           ORDER BY observed_at DESC`,
        )
        .all<Record<string, unknown>>(),
    ]);

  return {
    members: memberRows.results,
    devices: deviceRows.results,
    reports: reportRows.results,
    observations: observationRows.results,
  };
}
