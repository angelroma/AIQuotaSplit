import { env } from "cloudflare:workers";

import { postSyncReport } from "@/lib/sync";

export async function POST(request: Request) {
  return postSyncReport(request, { db: env.DB });
}
