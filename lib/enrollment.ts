import { hashDeviceToken, verifySecret } from "./auth";
import {
  deviceRegistrationSchema,
  memberNameSchema,
} from "./contracts";
import { normalizeMemberName } from "./names";
import {
  createMember,
  listMembers,
  registerDevice,
} from "./repositories";

type EnrollmentBindings = {
  db: D1Database;
  enrollmentCodeHash: string;
};

type EnrollmentRuntime = {
  randomUUID?: () => string;
  randomToken?: () => string;
  now?: () => number;
};

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function defaultToken() {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

async function authorized(request: Request, bindings: EnrollmentBindings) {
  const header = request.headers.get("Authorization");
  const stored = bindings.enrollmentCodeHash;
  const fingerprint =
    typeof stored === "string"
      ? Array.from(
          new Uint8Array(
            await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stored)),
          ).slice(0, 6),
          (byte) => byte.toString(16).padStart(2, "0"),
        ).join("")
      : null;
  console.info("AIQuotaSplit enrollment binding", {
    storedType: typeof stored,
    storedLength: typeof stored === "string" ? stored.length : null,
    storedParts:
      typeof stored === "string" ? stored.split("$").map((part) => part.length) : null,
    fingerprint,
  });
  if (!header?.startsWith("Enrollment ")) return false;
  return verifySecret(header.slice("Enrollment ".length), stored);
}

function enrollmentError(error: unknown) {
  const code = error instanceof Error ? error.message : "ENROLLMENT_FAILED";
  const statuses: Record<string, number> = {
    MEMBER_NAME_EXISTS: 409,
    MEMBER_LIMIT_REACHED: 409,
    DEVICE_REASSIGN_CONFIRMATION_REQUIRED: 409,
    DEVICE_ACTIVE_WINDOW_REASSIGN_BLOCKED: 409,
    DEVICE_REVOKED: 403,
  };
  const safeCode = code in statuses ? code : "ENROLLMENT_FAILED";
  return Response.json(
    { error: safeCode },
    { status: statuses[safeCode] ?? 400 },
  );
}

function unauthorized() {
  return Response.json(
    { error: "ENROLLMENT_REQUIRED" },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

export async function getEnrollmentMembers(
  request: Request,
  bindings: EnrollmentBindings,
) {
  if (!(await authorized(request, bindings))) return unauthorized();
  const members = await listMembers(bindings.db);
  return Response.json(
    {
      members: members.map(({ id, displayName, deviceCount }) => ({
        id,
        displayName,
        deviceCount,
      })),
      canCreate: members.length < 2,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function postEnrollmentMember(
  request: Request,
  bindings: EnrollmentBindings,
  runtime: EnrollmentRuntime = {},
) {
  if (!(await authorized(request, bindings))) return unauthorized();
  try {
    const payload = (await request.json()) as { displayName?: unknown };
    const displayName = memberNameSchema.parse(payload.displayName);
    const member = await createMember(bindings.db, {
      id: (runtime.randomUUID ?? (() => crypto.randomUUID()))(),
      displayName,
      normalizedName: normalizeMemberName(displayName),
      now: (runtime.now ?? (() => Math.floor(Date.now() / 1000)))(),
    });
    return Response.json(
      {
        member: {
          id: member.id,
          displayName: member.displayName,
          deviceCount: 0,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return enrollmentError(error);
  }
}

export async function postEnrollmentDevice(
  request: Request,
  bindings: EnrollmentBindings,
  runtime: EnrollmentRuntime = {},
) {
  if (!(await authorized(request, bindings))) return unauthorized();
  try {
    const payload = deviceRegistrationSchema.parse(await request.json());
    const deviceToken = (runtime.randomToken ?? defaultToken)();
    const result = await registerDevice(bindings.db, {
      ...payload,
      tokenHash: await hashDeviceToken(deviceToken),
      now: (runtime.now ?? (() => Math.floor(Date.now() / 1000)))(),
    });
    return Response.json(
      {
        deviceId: result.device.id,
        memberId: result.device.memberId,
        deviceToken,
        created: result.created,
      },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    return enrollmentError(error);
  }
}
