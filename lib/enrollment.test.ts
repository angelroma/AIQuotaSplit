import { describe, expect, it } from "vitest";

import { hashSecret } from "./auth";
import {
  getEnrollmentMembers,
  postEnrollmentDevice,
  postEnrollmentMember,
} from "./enrollment";
import { scriptedD1 } from "../test/fake-d1";

const enrollmentCode = "enrollment-code-long-enough";

async function bindings(responses: unknown[]) {
  return {
    db: scriptedD1(responses).db,
    enrollmentCodeHash: await hashSecret(
      enrollmentCode,
      new Uint8Array(16).fill(4),
    ),
  };
}

function request(path: string, init?: RequestInit) {
  return new Request(`https://aiquotasplit.example${path}`, init);
}

describe("enrollment authorization", () => {
  it("rejects missing credentials without returning member data", async () => {
    const response = await getEnrollmentMembers(
      request("/api/enrollment/members"),
      await bindings([]),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "ENROLLMENT_REQUIRED" });
  });

  it("lists only member identity and device counts", async () => {
    const response = await getEnrollmentMembers(
      request("/api/enrollment/members", {
        headers: { Authorization: `Enrollment ${enrollmentCode}` },
      }),
      await bindings([
        [
          {
            id: "member-id",
            slot: 1,
            display_name: "Miguel",
            normalized_name: "miguel",
            quota_percent: 50,
            created_at: 1,
            updated_at: 1,
            device_count: 2,
          },
        ],
      ]),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      members: [
        { id: "member-id", displayName: "Miguel", deviceCount: 2 },
      ],
      canCreate: true,
    });
  });
});

describe("member and device enrollment", () => {
  it("normalizes a confirmed member name on the server", async () => {
    const response = await postEnrollmentMember(
      request("/api/enrollment/members", {
        method: "POST",
        headers: {
          Authorization: `Enrollment ${enrollmentCode}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ displayName: "  MÍGUEL " }),
      }),
      await bindings([
        {
          id: "member-id",
          slot: 1,
          display_name: "MÍGUEL",
          normalized_name: "miguel",
          quota_percent: 50,
          created_at: 1,
          updated_at: 1,
        },
      ]),
      { randomUUID: () => "member-id", now: () => 1 },
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      member: { id: "member-id", displayName: "MÍGUEL" },
    });
  });

  it("returns a device token only when a device is first registered", async () => {
    const response = await postEnrollmentDevice(
      request("/api/enrollment/devices", {
        method: "POST",
        headers: {
          Authorization: `Enrollment ${enrollmentCode}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deviceId: "018f4d0e-7b8d-7c3a-9af7-03c260b94f3b",
          memberId: "018f4d0e-7b8d-7c3a-9af7-03c260b94f3c",
          displayName: "Miguel's MacBook",
          platform: "macos",
          reassign: false,
        }),
      }),
      await bindings([
        null,
        {
          id: "018f4d0e-7b8d-7c3a-9af7-03c260b94f3b",
          member_id: "018f4d0e-7b8d-7c3a-9af7-03c260b94f3c",
          display_name: "Miguel's MacBook",
          platform: "macos",
          token_hash: "hash",
          registered_at: 1,
          last_sync_at: null,
          revoked_at: null,
        },
      ]),
      {
        randomToken: () => "generated-device-token",
        now: () => 1,
      },
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      deviceToken: "generated-device-token",
      created: true,
    });
  });
});
