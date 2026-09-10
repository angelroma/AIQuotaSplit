import { z } from "zod";

import { verifySessionCookie } from "./auth";
import { revokeDevice } from "./repositories";

type DeviceAdminBindings = {
  db: D1Database;
  sessionSecret: string;
};

type DeviceAdminRuntime = {
  now?: () => number;
  revoke?: typeof revokeDevice;
};

const revokeSchema = z.object({ deviceId: z.string().uuid() }).strict();

export async function postRevokeDevice(
  request: Request,
  bindings: DeviceAdminBindings,
  runtime: DeviceAdminRuntime = {},
) {
  const now = (runtime.now ?? (() => Math.floor(Date.now() / 1000)))();
  const authenticated = await verifySessionCookie(
    request.headers.get("Cookie"),
    bindings.sessionSecret,
    now,
  );
  if (!authenticated) {
    return Response.json(
      { error: "DASHBOARD_AUTH_REQUIRED" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  try {
    const { deviceId } = revokeSchema.parse(await request.json());
    const revoked = await (runtime.revoke ?? revokeDevice)(
      bindings.db,
      deviceId,
      now,
    );
    if (!revoked) {
      return Response.json(
        { error: "DEVICE_NOT_FOUND" },
        { status: 404, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json(
      { error: "INVALID_DEVICE" },
      { status: 422, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
