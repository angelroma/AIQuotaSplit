import { verifySessionCookie } from "./auth";
import { buildDashboard } from "./allocation";
import { loadDashboardRows } from "./repositories";

type DashboardBindings = {
  db: D1Database;
  sessionSecret: string;
};

type DashboardRuntime = {
  now?: () => number;
  loadRows?: typeof loadDashboardRows;
};

export async function getDashboard(
  request: Request,
  bindings: DashboardBindings,
  runtime: DashboardRuntime = {},
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
    const rows = await (runtime.loadRows ?? loadDashboardRows)(bindings.db);
    return Response.json(buildDashboard(rows, now), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json(
      { error: "DASHBOARD_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
