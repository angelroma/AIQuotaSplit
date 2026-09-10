import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const members = sqliteTable(
  "members",
  {
    id: text("id").primaryKey(),
    slot: integer("slot").notNull(),
    displayName: text("display_name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    quotaPercent: real("quota_percent").notNull().default(50),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_members_slot").on(table.slot),
    uniqueIndex("idx_members_normalized_name").on(table.normalizedName),
    check("members_slot_check", sql`${table.slot} in (1, 2)`),
    check("members_quota_check", sql`${table.quotaPercent} = 50`),
  ],
);

export const devices = sqliteTable(
  "devices",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id),
    displayName: text("display_name").notNull(),
    platform: text("platform").notNull(),
    tokenHash: text("token_hash").notNull(),
    registeredAt: integer("registered_at").notNull(),
    lastSyncAt: integer("last_sync_at"),
    revokedAt: integer("revoked_at"),
  },
  (table) => [
    index("idx_devices_member_id").on(table.memberId),
    uniqueIndex("idx_devices_token_hash").on(table.tokenHash),
  ],
);

export const syncReports = sqliteTable(
  "sync_reports",
  {
    id: text("id").primaryKey(),
    deviceId: text("device_id")
      .notNull()
      .references(() => devices.id),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id),
    windowResetsAt: integer("window_resets_at").notNull(),
    windowDurationMins: integer("window_duration_mins").notNull(),
    collectedAt: integer("collected_at").notNull(),
    trackingStartedAt: integer("tracking_started_at").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    cacheReadTokens: integer("cache_read_tokens").notNull(),
    cacheCreationTokens: integer("cache_creation_tokens").notNull(),
    totalTokens: integer("total_tokens").notNull(),
    estimatedCostUsd: real("estimated_cost_usd"),
    modelBreakdownJson: text("model_breakdown_json").notNull(),
    localUsageAvailable: integer("local_usage_available", {
      mode: "boolean",
    }).notNull(),
    collectorVersion: text("collector_version").notNull(),
  },
  (table) => [
    uniqueIndex("idx_sync_reports_device_window").on(
      table.deviceId,
      table.windowResetsAt,
    ),
    index("idx_sync_reports_window_collected").on(
      table.windowResetsAt,
      table.collectedAt,
    ),
    index("idx_sync_reports_member_window").on(
      table.memberId,
      table.windowResetsAt,
    ),
  ],
);

export const rateLimitObservations = sqliteTable(
  "rate_limit_observations",
  {
    id: text("id").primaryKey(),
    deviceId: text("device_id")
      .notNull()
      .references(() => devices.id),
    limitId: text("limit_id").notNull().default("codex"),
    windowResetsAt: integer("window_resets_at").notNull(),
    windowDurationMins: integer("window_duration_mins").notNull(),
    observedAt: integer("observed_at").notNull(),
    sharedUsedPercent: real("shared_used_percent").notNull(),
  },
  (table) => [
    uniqueIndex("idx_rate_limit_device_window_observed").on(
      table.deviceId,
      table.windowResetsAt,
      table.observedAt,
    ),
    index("idx_rate_limit_window_observed").on(
      table.windowResetsAt,
      table.observedAt,
    ),
  ],
);
