import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { normalizeUrl } from "../ai-quota-split.mjs";

test("dashboard URLs cannot embed credentials", () => {
  assert.throws(() => normalizeUrl("https://user:password@quota.example"), /DASHBOARD_URL_CREDENTIALS_FORBIDDEN/);
});

test("the CLI exposes deterministic fuzzy member ranking", () => {
  const script = fileURLToPath(new URL("../ai-quota-split.mjs", import.meta.url));
  const output = execFileSync(process.execPath, [script, "identity", "rank", "--name", "Migul"], {
    input: JSON.stringify({ members: [{ id: "1", displayName: "Miguel" }] }),
    encoding: "utf8",
  });
  assert.deepEqual(JSON.parse(output).choices[0], {
    kind: "similar",
    member: { id: "1", displayName: "Miguel" },
  });
});
