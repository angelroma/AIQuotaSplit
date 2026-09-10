import { describe, expect, it } from "vitest";

import {
  createSessionCookie,
  hashDeviceToken,
  hashSecret,
  SESSION_COOKIE,
  verifySecret,
  verifySessionCookie,
} from "./auth";
import { postLogin, postLogout } from "./login";

describe("secret verification", () => {
  it("uses a salted PBKDF2 verifier without storing plaintext", async () => {
    const stored = await hashSecret(
      "correct horse",
      new Uint8Array(16).fill(7),
    );

    expect(stored).toMatch(/^pbkdf2-sha256\$210000\$/);
    expect(stored).not.toContain("correct horse");
    await expect(verifySecret("correct horse", stored)).resolves.toBe(true);
    await expect(verifySecret("wrong", stored)).resolves.toBe(false);
  });

  it("hashes high-entropy device tokens deterministically with SHA-256", async () => {
    const first = await hashDeviceToken("token-value");
    const second = await hashDeviceToken("token-value");
    expect(first).toBe(second);
    expect(first).toMatch(/^sha256\$[A-Za-z0-9_-]{43}$/);
    expect(first).not.toContain("token-value");
  });

  it("accepts deterministic SHA-256 verifiers for high-entropy access secrets", async () => {
    const stored = await hashDeviceToken(
      "enroll-1234567890abcdefghijklmn",
    );

    await expect(
      verifySecret("enroll-1234567890abcdefghijklmn", stored),
    ).resolves.toBe(true);
    await expect(verifySecret("wrong", stored)).resolves.toBe(false);
  });
});

describe("dashboard sessions", () => {
  it("signs a strict host-only 12-hour cookie", async () => {
    const now = 1_789_000_000;
    const cookie = await createSessionCookie("session-secret-at-least-16", now);

    expect(SESSION_COOKIE).toBe("__Host-aiqs_session");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Max-Age=43200");
    await expect(
      verifySessionCookie(cookie, "session-secret-at-least-16", now + 43_199),
    ).resolves.toBe(true);
  });

  it("rejects expired and tampered sessions", async () => {
    const now = 1_789_000_000;
    const cookie = await createSessionCookie("session-secret-at-least-16", now);

    await expect(
      verifySessionCookie(cookie, "session-secret-at-least-16", now + 43_201),
    ).resolves.toBe(false);
    await expect(
      verifySessionCookie(
        cookie.replace(
          /(__Host-aiqs_session=)([^;])/,
          (_, prefix: string, first: string) =>
            `${prefix}${first === "A" ? "B" : "A"}`,
        ),
        "session-secret-at-least-16",
        now,
      ),
    ).resolves.toBe(false);
  });
});

describe("login routes", () => {
  it("sets a secure session after a valid shared password", async () => {
    const passwordHash = await hashSecret(
      "correct horse battery staple",
      new Uint8Array(16).fill(9),
    );
    const body = new URLSearchParams({
      password: "correct horse battery staple",
    });
    const response = await postLogin(
      new Request("https://aiquotasplit.example/api/login", {
        method: "POST",
        body,
      }),
      {
        dashboardPasswordHash: passwordHash,
        sessionSecret: "a-session-secret-that-is-long-enough",
      },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://aiquotasplit.example/");
    expect(response.headers.get("set-cookie")).toContain(SESSION_COOKIE);
  });

  it("returns one generic failure for invalid credentials", async () => {
    const passwordHash = await hashSecret(
      "correct horse battery staple",
      new Uint8Array(16).fill(9),
    );
    const response = await postLogin(
      new Request("https://aiquotasplit.example/api/login", {
        method: "POST",
        body: new URLSearchParams({ password: "incorrect password" }),
      }),
      {
        dashboardPasswordHash: passwordHash,
        sessionSecret: "a-session-secret-that-is-long-enough",
      },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://aiquotasplit.example/login?error=1",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("clears the dashboard session on logout", async () => {
    const response = await postLogout(
      new Request("https://aiquotasplit.example/api/logout", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://aiquotasplit.example/login",
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
