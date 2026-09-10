import { env } from "cloudflare:workers";

import { getDashboard } from "@/lib/dashboard";

export async function GET(request: Request) {
  return getDashboard(request, {
    db: env.DB,
    sessionSecret: env.SESSION_SECRET,
  });
}
