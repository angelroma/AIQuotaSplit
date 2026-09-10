import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const globals = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

describe("entrance motion", () => {
  it("keeps critical content visible when animations are delayed or paused", () => {
    const entranceRule = globals.match(/\.entrance\s*\{([^}]*)\}/)?.[1];

    expect(entranceRule).toBeDefined();
    expect(entranceRule).not.toMatch(/opacity\s*:\s*0/);
  });
});
