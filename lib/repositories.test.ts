import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { scriptedD1 } from "../test/fake-d1";
import {
  createMember,
  registerDevice,
  upsertSyncReport,
} from "./repositories";

function migratedDatabase() {
  const directory = mkdtempSync(join(tmpdir(), "aiqs-sqlite-"));
  const database = join(directory, "test.db");
  const migrations = readdirSync("drizzle")
    .filter((file) => file.endsWith(".sql"))
    .sort();

  if (migrations.length === 0) {
    throw new Error("No AIQuotaSplit migration exists");
  }

  for (const migration of migrations) {
    execFileSync("sqlite3", [database], {
      input: readFileSync(join("drizzle", migration), "utf8"),
    });
  }

  return database;
}

function run(database: string, sql: string) {
  return execFileSync("sqlite3", [database], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

describe("D1 schema", () => {
  it("enforces two member slots and normalized-name uniqueness", () => {
    const database = migratedDatabase();
    run(
      database,
      `INSERT INTO members (id, slot, display_name, normalized_name, quota_percent, created_at, updated_at)
       VALUES ('one', 1, 'Miguel', 'miguel', 50, 1, 1),
              ('two', 2, 'Mauro', 'mauro', 50, 1, 1);`,
    );

    const duplicateName = spawnSync("sqlite3", [database], {
      input: `INSERT INTO members (id, slot, display_name, normalized_name, quota_percent, created_at, updated_at)
              VALUES ('three', 2, 'Míguel', 'miguel', 50, 1, 1);`,
    });
    const thirdSlot = spawnSync("sqlite3", [database], {
      input: `INSERT INTO members (id, slot, display_name, normalized_name, quota_percent, created_at, updated_at)
              VALUES ('three', 3, 'Angel', 'angel', 50, 1, 1);`,
    });

    expect(duplicateName.status).not.toBe(0);
    expect(thirdSlot.status).not.toBe(0);
  });

  it("keeps one cumulative report per device and window", () => {
    const database = migratedDatabase();
    run(
      database,
      `INSERT INTO members (id, slot, display_name, normalized_name, quota_percent, created_at, updated_at)
       VALUES ('member', 1, 'Miguel', 'miguel', 50, 1, 1);
       INSERT INTO devices (id, member_id, display_name, platform, token_hash, registered_at)
       VALUES ('device', 'member', 'MacBook', 'macos', 'hash', 1);
       INSERT INTO sync_reports (
         id, device_id, member_id, window_resets_at, window_duration_mins,
         collected_at, tracking_started_at, input_tokens, output_tokens,
         cache_read_tokens, cache_creation_tokens, total_tokens,
         estimated_cost_usd, model_breakdown_json, local_usage_available,
         collector_version
       ) VALUES (
         'report-one', 'device', 'member', 200, 10080, 10, 1,
         5, 3, 1, 1, 10, 0.1, '{}', 1, '0.1.0'
       ) ON CONFLICT(device_id, window_resets_at) DO UPDATE SET
         collected_at = excluded.collected_at,
         total_tokens = excluded.total_tokens
       WHERE excluded.collected_at >= sync_reports.collected_at;
       INSERT INTO sync_reports (
         id, device_id, member_id, window_resets_at, window_duration_mins,
         collected_at, tracking_started_at, input_tokens, output_tokens,
         cache_read_tokens, cache_creation_tokens, total_tokens,
         estimated_cost_usd, model_breakdown_json, local_usage_available,
         collector_version
       ) VALUES (
         'report-two', 'device', 'member', 200, 10080, 20, 1,
         10, 6, 2, 2, 20, 0.2, '{}', 1, '0.1.0'
       ) ON CONFLICT(device_id, window_resets_at) DO UPDATE SET
         collected_at = excluded.collected_at,
         total_tokens = excluded.total_tokens
       WHERE excluded.collected_at >= sync_reports.collected_at;`,
    );

    expect(
      run(
        database,
        "SELECT COUNT(*) || ':' || total_tokens FROM sync_reports;",
      ),
    ).toBe("1:20");
  });

  it("stores rate-limit observations separately from local reports", () => {
    const database = migratedDatabase();
    const tables = run(
      database,
      "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name;",
    ).split("\n");

    expect(tables).toContain("rate_limit_observations");
    expect(tables).toContain("sync_reports");
  });
});

describe("D1 repositories", () => {
  it("creates a member through one atomic slot-selecting statement", async () => {
    const inserted = {
      id: "member-id",
      slot: 1,
      display_name: "Miguel",
      normalized_name: "miguel",
      quota_percent: 50,
      created_at: 100,
      updated_at: 100,
    };
    const fake = scriptedD1([inserted]);

    await expect(
      createMember(fake.db, {
        id: "member-id",
        displayName: "Miguel",
        normalizedName: "miguel",
        now: 100,
      }),
    ).resolves.toMatchObject({ id: "member-id", slot: 1 });
    expect(fake.statements).toHaveLength(1);
    expect(fake.statements[0].sql).toContain("WITH available_slots");
  });

  it("distinguishes an existing normalized name from a full member list", async () => {
    const existing = { id: "member-id" };
    const duplicate = scriptedD1([null, existing]);
    const full = scriptedD1([null, null]);
    const input = {
      id: "new-id",
      displayName: "Míguel",
      normalizedName: "miguel",
      now: 100,
    };

    await expect(createMember(duplicate.db, input)).rejects.toThrow(
      "MEMBER_NAME_EXISTS",
    );
    await expect(createMember(full.db, input)).rejects.toThrow(
      "MEMBER_LIMIT_REACHED",
    );
  });

  it("blocks reassignment while a device has an active cumulative window", async () => {
    const fake = scriptedD1([
      {
        id: "device-id",
        member_id: "old-member",
        display_name: "MacBook",
        platform: "macos",
        token_hash: "hash",
        registered_at: 1,
        last_sync_at: 50,
        revoked_at: null,
      },
      { active: 1 },
    ]);

    await expect(
      registerDevice(fake.db, {
        deviceId: "device-id",
        memberId: "new-member",
        displayName: "MacBook",
        platform: "macos",
        tokenHash: "new-hash",
        reassign: true,
        now: 100,
      }),
    ).rejects.toThrow("DEVICE_ACTIVE_WINDOW_REASSIGN_BLOCKED");
  });

  it("stores a valid rate-limit observation without erasing local usage", async () => {
    const fake = scriptedD1([{ id: "device-id", member_id: "member-id" }]);

    await upsertSyncReport(fake.db, {
      id: "report-id",
      deviceId: "device-id",
      windowResetsAt: 200,
      windowDurationMins: 10_080,
      collectedAt: 100,
      trackingStartedAt: 1,
      inputTokens: 5,
      outputTokens: 3,
      cacheReadTokens: 1,
      cacheCreationTokens: 1,
      totalTokens: 10,
      estimatedCostUsd: 0.1,
      modelBreakdownJson: "{}",
      collectorVersion: "0.1.0",
      sharedUsedPercent: 38,
      limitId: "codex",
    });

    expect(fake.batches[0]).toHaveLength(3);
    expect(fake.batches[0][1].sql).toContain("rate_limit_observations");
  });
});
