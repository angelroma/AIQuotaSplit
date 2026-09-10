import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

function runNode(args) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });

  if (result.error) throw result.error;
  if (result.signal) {
    console.error(`Test process terminated by ${result.signal}`);
    return 1;
  }

  return result.status ?? 1;
}

const vitestEntry = fileURLToPath(new URL("../vitest.mjs", import.meta.resolve("vitest")));
const vitestStatus = runNode([
  vitestEntry,
  "run",
  "--passWithNoTests",
  ...process.argv.slice(2),
]);

if (vitestStatus !== 0) process.exit(vitestStatus);

const skillTestDirectory = new URL("../skills/ai-quota-split/scripts/test/", import.meta.url);
const skillTestFiles = readdirSync(skillTestDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"))
  .map((entry) => fileURLToPath(new URL(entry.name, skillTestDirectory)))
  .sort();

process.exit(runNode(["--test", ...skillTestFiles]));
