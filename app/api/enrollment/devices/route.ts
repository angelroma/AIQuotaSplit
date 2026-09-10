import { env } from "cloudflare:workers";

import { postEnrollmentDevice } from "@/lib/enrollment";

export async function POST(request: Request) {
  return postEnrollmentDevice(request, {
    db: env.DB,
    enrollmentCodeHash: env.ENROLLMENT_CODE_HASH,
  });
}
