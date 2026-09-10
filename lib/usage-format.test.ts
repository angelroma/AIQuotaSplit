import { afterEach, describe, expect, it, vi } from "vitest";

import {
  formatCompactTokens,
  formatEstimatedCost,
  formatExactReset,
  formatResetCountdown,
} from "./usage-format";

describe("usage formatters", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("formats token totals compactly", () => {
    expect(formatCompactTokens(189_854_215)).toBe("189.9M tokens");
  });

  it("formats estimated costs as USD or unavailable", () => {
    expect(formatEstimatedCost(134.29087)).toBe("$134.29");
    expect(formatEstimatedCost(null)).toBe("Unavailable");
  });

  it("uses an explicit deterministic locale for token and cost numbers", () => {
    const numberFormat = vi.spyOn(Intl, "NumberFormat");

    formatCompactTokens(189_854_215);
    formatEstimatedCost(134.29087);

    expect(numberFormat.mock.calls.map(([locale]) => locale)).toEqual([
      "en-US",
      "en-US",
    ]);
  });

  it("formats reset countdowns at day, hour, and minute boundaries", () => {
    expect(formatResetCountdown(6 * 86_400 + 18 * 3_600)).toBe("6d 18h");
    expect(formatResetCountdown(3 * 3_600 + 24 * 60)).toBe("3h 24m");
    expect(formatResetCountdown(45 * 60)).toBe("45m");
    expect(formatResetCountdown(-1)).toBe("Waiting for a weekly meter");
  });

  it("formats the exact reset in the local locale and time zone", () => {
    const iso = "2026-09-17T00:24:00.000Z";
    const expected = new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));

    expect(formatExactReset(iso)).toBe(expected);
    expect(formatExactReset(null)).toBe("Waiting for a weekly meter");
  });
});
