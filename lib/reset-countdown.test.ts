import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/usage-format", () => import("./usage-format"));

import { ResetCountdown } from "../components/reset-countdown";
import { formatExactReset } from "./usage-format";

describe("ResetCountdown server rendering", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps initial markup deterministic until local time is available", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2030-01-01T12:00:00.000Z"));
    const element = createElement(ResetCountdown, { resetsAt: "2030-01-08T12:00:00.000Z" });

    const firstRender = renderToStaticMarkup(element);
    now.mockReturnValue(Date.parse("2030-01-02T12:00:00.000Z"));
    const secondRender = renderToStaticMarkup(element);

    expect(firstRender).toBe(secondRender);
    expect(firstRender).toContain("<strong>Calculating…</strong>");
    expect(firstRender).not.toContain("2030");
  });

  it("does not server-render a past exact reset timestamp", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2030-01-02T12:00:00.000Z"));
    const resetsAt = "2029-12-31T12:00:00.000Z";

    const markup = renderToStaticMarkup(
      createElement(ResetCountdown, { resetsAt }),
    );

    expect(markup).not.toContain(formatExactReset(resetsAt));
  });
});
