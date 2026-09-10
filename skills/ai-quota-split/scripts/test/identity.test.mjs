import assert from "node:assert/strict";
import test from "node:test";

import { rankMemberChoices } from "../identity.mjs";

test("exact matching ignores case accents and whitespace", () => {
  assert.equal(rankMemberChoices(" MÍGUEL ", [{ id: "1", displayName: "Miguel" }])[0].kind, "exact");
});

test("Migul suggests Miguel but never selects automatically", () => {
  assert.deepEqual(rankMemberChoices("Migul", [{ id: "1", displayName: "Miguel" }])[0], {
    kind: "similar",
    member: { id: "1", displayName: "Miguel" },
  });
});

test("an unrelated name remains a confirmable new member", () => {
  assert.equal(rankMemberChoices("Mauro", [{ id: "1", displayName: "Miguel" }])[0].kind, "new");
});
