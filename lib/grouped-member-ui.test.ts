import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(path: string) {
  const url = new URL(path, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

const dashboard = source("../components/dashboard.tsx");
const deviceList = source("../components/device-list.tsx");
const memberCard = source("../components/member-card.tsx");
const usageDetails = source("../components/usage-details.tsx");
const globals = source("../app/globals.css");

describe("grouped member dashboard composition", () => {
  it("passes each member only their own computers", () => {
    expect(dashboard).toMatch(
      /data\.devices\.filter\(\(device\) => device\.memberId === member\.id\)/,
    );
    expect(dashboard).toMatch(
      /<MemberCard[^>]*devices=\{devices\}[^>]*onChanged=\{refresh\}/,
    );
    expect(dashboard).not.toMatch(/<DeviceList/);
  });

  it("keeps local totals and computers inside each member card", () => {
    expect(memberCard).toContain('className="member-local-totals"');
    expect(memberCard).toContain("formatEstimatedCost");
    expect(memberCard).toContain("formatCompactTokens");
    expect(memberCard).toMatch(
      /<DeviceList devices=\{devices\} onChanged=\{onChanged\}/,
    );
  });

  it("makes the computer list owner-scoped and keeps revoke behavior", () => {
    expect(deviceList).not.toContain("members:");
    expect(deviceList).not.toContain("owners.get");
    expect(deviceList).toContain("<UsageDetails usage={device.localUsage}");
    expect(deviceList).toContain("/api/devices/revoke");

    const cost = deviceList.indexOf(
      "formatEstimatedCost(device.localUsage?.estimatedCostUsd ?? null)",
    );
    const tokens = deviceList.indexOf(
      "formatCompactTokens(device.localUsage.totalTokens)",
    );
    expect(cost).toBeGreaterThan(-1);
    expect(tokens).toBeGreaterThan(cost);
  });
});

describe("usage detail disclosure contract", () => {
  it("uses a native disclosure and renders aggregate-only fields", () => {
    expect(usageDetails).toContain('<details className="usage-details">');
    expect(usageDetails).toContain("<summary>Usage details</summary>");
    expect(usageDetails).toContain("usage.modelBreakdown.map");
    expect(usageDetails).not.toMatch(
      /project(?:Name|Path)|session(?:Id|Name)|prompt|response/i,
    );
  });

  it("preserves a visible keyboard focus treatment", () => {
    expect(globals).toMatch(/\.usage-details summary:focus-visible\s*\{/);
  });
});
