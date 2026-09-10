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

describe("quota summary contrast", () => {
  it("keeps local-total supporting text legible on the dark card", () => {
    const helperRules = [...globals.matchAll(/\.local-account-totals small\s*\{([^}]*)\}/g)];
    const helperRule = helperRules.find((match) => match[1].includes("color:"))?.[1];
    const alpha = Number(helperRule?.match(/color:\s*rgba\([^,]+,[^,]+,[^,]+,\s*(\.?\d+)\)/)?.[1]);

    expect(helperRule).toBeDefined();
    expect(alpha).toBeGreaterThanOrEqual(0.58);
  });
});
