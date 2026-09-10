import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

export function configDirectory({ platform = process.platform, env = process.env, homedir = os.homedir() } = {}) {
  return platform === "win32"
    ? path.join(env.APPDATA || homedir, "AIQuotaSplit")
    : path.join(homedir, ".config", "ai-quota-split");
}

async function ensureDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
}

async function atomicJson(file, value, directory) {
  await ensureDirectory(directory);
  const temporary = path.join(directory, `.${path.basename(file)}.${randomUUID()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, file);
  await chmod(file, 0o600);
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function readConfig(directory = configDirectory()) {
  return readJson(path.join(directory, "config.json"));
}

export async function saveConfig(config, directory = configDirectory()) {
  await atomicJson(path.join(directory, "config.json"), config, directory);
}

export async function readPending(directory = configDirectory()) {
  return readJson(path.join(directory, "pending-report.json"));
}

export async function savePending(report, directory = configDirectory()) {
  const existing = await readPending(directory);
  const compatible = !existing ||
    report.windowResetsAt > existing.windowResetsAt ||
    (report.deviceId === existing.deviceId &&
      report.windowResetsAt === existing.windowResetsAt &&
      Date.parse(report.collectedAt) > Date.parse(existing.collectedAt));
  if (!compatible) return false;
  await atomicJson(path.join(directory, "pending-report.json"), report, directory);
  return true;
}

export async function clearPending(directory = configDirectory()) {
  await rm(path.join(directory, "pending-report.json"), { force: true });
}
