import { describe, expect, it } from "vitest";

import { normalizeMemberName } from "./names";

describe("normalizeMemberName", () => {
  it.each([
    [" Miguel ", "miguel"],
    ["MÍGUEL", "miguel"],
    ["Miguel   Martinez", "miguel martinez"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeMemberName(input)).toBe(expected);
  });
});
