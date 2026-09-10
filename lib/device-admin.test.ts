import { describe, expect, it } from "vitest";

import { createSessionCookie } from "./auth";
import { postRevokeDevice } from "./device-admin";
import { scriptedD1 } from "../test/fake-d1";

const secret = "session-secret-that-is-long-enough";
const deviceId = "018f4d0e-7b8d-7c3a-9af7-03c260b94f3b";

async function request(authenticated: boolean) {
  const cookie = await createSessionCookie(secret, 100);
  return new Request("https://aiquotasplit.example/api/devices/revoke", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authenticated ? { Cookie: cookie.split(";")[0] } : {}),
    },
    body: JSON.stringify({ deviceId }),
  });
}

describe("device administration", () => {
  it("requires a dashboard session", async () => {
    const response = await postRevokeDevice(
      await request(false),
      { db: scriptedD1([]).db, sessionSecret: secret },
      { now: () => 101 },
    );
    expect(response.status).toBe(401);
  });

  it("revokes a device without deleting its history", async () => {
    const calls: unknown[] = [];
    const response = await postRevokeDevice(
      await request(true),
      { db: scriptedD1([]).db, sessionSecret: secret },
      {
        now: () => 101,
        revoke: async (_db, id, now) => {
          calls.push({ id, now });
          return true;
        },
      },
    );

    expect(response.status).toBe(204);
    expect(calls).toEqual([{ id: deviceId, now: 101 }]);
  });
});
