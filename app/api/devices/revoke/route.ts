import { env } from "cloudflare:workers";

import { postRevokeDevice } from "@/lib/device-admin";

export async function POST(request: Request) {
  return postRevokeDevice(request, {
    db: env.DB,
    sessionSecret: env.SESSION_SECRET,
  });
}
