import { pbkdf2Sync } from "node:crypto";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const PBKDF2_ITERATIONS = 210_000;
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

export const SESSION_COOKIE = "__Host-aiqs_session";

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function fromBase64Url(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function pbkdf2(secret: string, salt: Uint8Array) {
  return new Uint8Array(
    pbkdf2Sync(
      encoder.encode(secret),
      salt,
      PBKDF2_ITERATIONS,
      32,
      "sha256",
    ),
  );
}

export async function hashSecret(
  secret: string,
  salt = crypto.getRandomValues(new Uint8Array(16)),
) {
  if (secret.length < 8) throw new Error("SECRET_TOO_SHORT");
  const digest = await pbkdf2(secret, salt);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(digest)}`;
}

export async function verifySecret(candidate: string, stored: string) {
  try {
    const [algorithm, iterations, saltValue, digestValue] = stored.split("$");
    if (algorithm === "sha256" && iterations && !saltValue && !digestValue) {
      const actual = await crypto.subtle.digest("SHA-256", encoder.encode(candidate));
      return constantTimeEqual(new Uint8Array(actual), fromBase64Url(iterations));
    }
    if (
      algorithm !== "pbkdf2-sha256" ||
      Number(iterations) !== PBKDF2_ITERATIONS ||
      !saltValue ||
      !digestValue
    ) {
      return false;
    }
    const actual = await pbkdf2(candidate, fromBase64Url(saltValue));
    return constantTimeEqual(actual, fromBase64Url(digestValue));
  } catch (error) {
    console.warn("AIQuotaSplit secret verification failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown failure",
    });
    return false;
  }
}

export async function hashDeviceToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return `sha256$${toBase64Url(new Uint8Array(digest))}`;
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return new Uint8Array(signature);
}

export async function createSessionCookie(
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const payload = toBase64Url(
    encoder.encode(
      JSON.stringify({ v: 1, exp: nowSeconds + SESSION_MAX_AGE_SECONDS }),
    ),
  );
  const signature = toBase64Url(await hmac(payload, secret));
  return `${SESSION_COOKIE}=${payload}.${signature}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

export async function verifySessionCookie(
  cookieHeader: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  if (!cookieHeader || secret.length < 16) return false;
  const value = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (!value) return false;

  try {
    const [payload, signature] = value.split(".");
    if (!payload || !signature) return false;
    const expected = await hmac(payload, secret);
    if (!constantTimeEqual(expected, fromBase64Url(signature))) return false;
    const parsed = JSON.parse(decoder.decode(fromBase64Url(payload))) as {
      v?: unknown;
      exp?: unknown;
    };
    return (
      parsed.v === 1 &&
      typeof parsed.exp === "number" &&
      Number.isInteger(parsed.exp) &&
      parsed.exp >= nowSeconds
    );
  } catch {
    return false;
  }
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}
