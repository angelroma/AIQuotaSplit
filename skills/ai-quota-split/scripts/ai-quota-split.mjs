#!/usr/bin/env node
import os from "node:os";
import process from "node:process";
import { randomUUID } from "node:crypto";

import { prepareCcusage } from "./ccusage.mjs";
import { readConfig, readPending, saveConfig } from "./config.mjs";
import { synchronize, redactSecrets } from "./sync.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function has(name) {
  return process.argv.includes(name);
}

function normalizeUrl(value) {
  const url = new URL(value);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new Error("HTTPS_DASHBOARD_REQUIRED");
  url.pathname = url.pathname.replace(/\/$/u, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/u, "");
}

async function stdinSecret() {
  if (!has("--enrollment-code-stdin")) throw new Error("ENROLLMENT_CODE_STDIN_REQUIRED");
  let value = "";
  for await (const chunk of process.stdin) value += chunk;
  value = value.trim();
  if (value.length < 8) throw new Error("INVALID_ENROLLMENT_CODE");
  return value;
}

async function enrollmentRequest(url, code, pathname, init = {}) {
  const response = await fetch(new URL(pathname, `${url}/`), {
    ...init,
    headers: {
      Authorization: `Enrollment ${code}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `ENROLLMENT_HTTP_${response.status}`);
  return body;
}

function platform() {
  return ({ darwin: "macos", win32: "windows", linux: "linux" })[process.platform] ?? "other";
}

async function setupList() {
  const url = normalizeUrl(argument("--url"));
  const code = await stdinSecret();
  return enrollmentRequest(url, code, "/api/enrollment/members");
}

async function createMember() {
  const url = normalizeUrl(argument("--url"));
  const name = argument("--name")?.trim();
  if (!name) throw new Error("MEMBER_NAME_REQUIRED");
  const code = await stdinSecret();
  return enrollmentRequest(url, code, "/api/enrollment/members", {
    method: "POST",
    body: JSON.stringify({ displayName: name }),
  });
}

async function registerDevice(reassign = false) {
  const existing = await readConfig();
  const url = normalizeUrl(argument("--url") ?? existing?.dashboardUrl);
  const memberId = argument("--member-id");
  if (!memberId) throw new Error("MEMBER_ID_REQUIRED");
  const code = await stdinSecret();
  await prepareCcusage();
  const deviceId = existing?.deviceId ?? randomUUID();
  const deviceDisplayName = existing?.deviceDisplayName ?? os.hostname();
  const result = await enrollmentRequest(url, code, "/api/enrollment/devices", {
    method: "POST",
    body: JSON.stringify({
      deviceId,
      memberId,
      displayName: deviceDisplayName,
      platform: platform(),
      reassign,
    }),
  });
  const members = await enrollmentRequest(url, code, "/api/enrollment/members");
  const member = members.members.find((candidate) => candidate.id === memberId);
  if (!member) throw new Error("MEMBER_NOT_FOUND");
  const deviceToken = result.deviceToken ?? existing?.deviceToken;
  if (!deviceToken) throw new Error("DEVICE_TOKEN_UNAVAILABLE");
  await saveConfig({
    schemaVersion: 1,
    dashboardUrl: url,
    memberId,
    memberDisplayName: member.displayName,
    deviceId,
    deviceDisplayName,
    deviceToken,
    trackingStartedAt: existing?.trackingStartedAt ?? new Date().toISOString(),
    lastKnownWindow: existing?.lastKnownWindow ?? null,
    lastSuccessfulSyncAt: existing?.lastSuccessfulSyncAt ?? null,
  });
  return { configured: true, member: member.displayName, computer: deviceDisplayName, dashboardUrl: url };
}

async function status() {
  const config = await readConfig();
  if (!config) return { configured: false };
  const pending = await readPending();
  const age = config.lastSuccessfulSyncAt ? Date.now() - Date.parse(config.lastSuccessfulSyncAt) : null;
  return {
    configured: true,
    member: config.memberDisplayName,
    computer: config.deviceDisplayName,
    dashboardUrl: config.dashboardUrl,
    lastSuccessfulSyncAt: config.lastSuccessfulSyncAt ?? null,
    queued: Boolean(pending),
    freshness: age === null ? "never-synced" : age < 24 * 60 * 60 * 1000 ? "synced" : "out-of-sync",
  };
}

async function main() {
  const [command, subcommand] = process.argv.slice(2);
  if (command === "setup" && subcommand === "list") return setupList();
  if (command === "setup" && subcommand === "create-member") return createMember();
  if (command === "setup" && subcommand === "register") return registerDevice(false);
  if (command === "setup" && subcommand === "reassign") return registerDevice(true);
  if (command === "sync") return synchronize();
  if (command === "status") return status();
  throw new Error("USAGE: setup list|create-member|register|reassign, sync, or status");
}

try {
  const result = await main();
  process.stdout.write(`${redactSecrets(JSON.stringify(result, null, 2), [])}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "AIQUOTASPLIT_FAILED"}\n`);
  process.exitCode = 1;
}
