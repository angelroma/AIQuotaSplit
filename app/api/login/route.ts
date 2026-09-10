import { env } from "cloudflare:workers";

import { postLogin } from "@/lib/login";

export async function POST(request: Request) {
  return postLogin(request, {
    dashboardPasswordHash: env.DASHBOARD_PASSWORD_HASH,
    sessionSecret: env.SESSION_SECRET,
  });
}
