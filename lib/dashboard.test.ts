import { describe, expect, it } from "vitest";

import { createSessionCookie } from "./auth";
import { getDashboard } from "./dashboard";
import { scriptedD1 } from "../test/fake-d1";

const sessionSecret = "session-secret-that-is-long-enough";

describe("dashboard endpoint", () => {
  it("rejects a request without a valid dashboard session", async () => {
    const response = await getDashboard(
      new Request("https://aiquotasplit.example/api/dashboard"),
      { db: scriptedD1([]).db, sessionSecret },
      { now: () => 100 },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "DASHBOARD_AUTH_REQUIRED" });
  });

  it("returns private, uncached dashboard data for a valid session", async () => {
    const cookie = await createSessionCookie(sessionSecret, 100);
    const response = await getDashboard(
      new Request("https://aiquotasplit.example/api/dashboard", {
        headers: { Cookie: cookie.split(";")[0] },
      }),
      { db: scriptedD1([]).db, sessionSecret },
      {
        now: () => 101,
        loadRows: async () => ({
          members: [],
          devices: [],
          reports: [],
          observations: [],
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      sharedUsedPercent: null,
      quality: expect.arrayContaining(["rate-limit-unavailable", "partial"]),
    });
  });

  it("returns a stable unavailable response when storage fails", async () => {
    const cookie = await createSessionCookie(sessionSecret, 100);
    const response = await getDashboard(
      new Request("https://aiquotasplit.example/api/dashboard", {
        headers: { Cookie: cookie.split(";")[0] },
      }),
      { db: scriptedD1([]).db, sessionSecret },
      {
        now: () => 101,
        loadRows: async () => {
          throw new Error("database details must stay private");
        },
      },
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "DASHBOARD_UNAVAILABLE" });
  });
});
