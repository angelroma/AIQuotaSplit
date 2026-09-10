import { env } from "cloudflare:workers";

import {
  getEnrollmentMembers,
  postEnrollmentMember,
} from "@/lib/enrollment";

function bindings() {
  return { db: env.DB, enrollmentCodeHash: env.ENROLLMENT_CODE_HASH };
}

export async function GET(request: Request) {
  return getEnrollmentMembers(request, bindings());
}

export async function POST(request: Request) {
  return postEnrollmentMember(request, bindings());
}
