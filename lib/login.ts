import {
  clearSessionCookie,
  createSessionCookie,
  verifySecret,
} from "./auth";

export type LoginBindings = {
  dashboardPasswordHash: string;
  sessionSecret: string;
};

function redirect(request: Request, path: string, cookie?: string) {
  const headers = new Headers({
    Location: new URL(path, request.url).toString(),
    "Cache-Control": "private, no-store",
  });
  if (cookie) headers.set("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
}

export async function postLogin(request: Request, bindings: LoginBindings) {
  try {
    const form = await request.formData();
    const password = form.get("password");
    const valid =
      typeof password === "string" &&
      (await verifySecret(password, bindings.dashboardPasswordHash));

    if (!valid) return redirect(request, "/login?error=1");
    return redirect(
      request,
      "/",
      await createSessionCookie(bindings.sessionSecret),
    );
  } catch {
    return redirect(request, "/login?error=1");
  }
}

export async function postLogout(request: Request) {
  return redirect(request, "/login", clearSessionCookie());
}
