import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const skill = readFileSync(fileURLToPath(new URL("../../SKILL.md", import.meta.url)), "utf8");

test("the skill defines friendly and consistent response guidance", () => {
  assert.match(skill, /Lead with \*\*Setup complete\*\*/);
  assert.match(skill, /Lead with \*\*Sync complete\*\*/);
  assert.match(skill, /Lead with \*\*Status\*\*/);
  assert.match(skill, /Needs attention/);
  assert.match(skill, /compact token/i);
  assert.match(skill, /exact reset/i);
  assert.match(skill, /Never expose raw JSON/);
});
