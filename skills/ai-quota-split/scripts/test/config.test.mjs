import assert from "node:assert/strict";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readPending, saveConfig, savePending } from "../config.mjs";

test("local config is written with owner-only permissions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aiqs-config-"));
  await saveConfig({ schemaVersion: 1, deviceToken: "secret" }, directory);
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  assert.equal((await stat(join(directory, "config.json"))).mode & 0o777, 0o600);
});

test("a newer cumulative pending report replaces the old one", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aiqs-pending-"));
  const first = { deviceId: "device", windowResetsAt: 200, collectedAt: "2026-01-01T00:00:00.000Z" };
  const newer = { ...first, collectedAt: "2026-01-01T01:00:00.000Z", totals: { totalTokens: 2 } };
  await savePending(first, directory);
  await savePending(newer, directory);
  assert.deepEqual(await readPending(directory), newer);
});
