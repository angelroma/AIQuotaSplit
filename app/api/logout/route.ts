import { postLogout } from "@/lib/login";

export async function POST(request: Request) {
  return postLogout(request);
}
