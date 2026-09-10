import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Dashboard } from "@/components/dashboard";
import { buildDashboard } from "@/lib/allocation";
import { verifySessionCookie } from "@/lib/auth";
import { loadDashboardRows } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function Home() {
  const requestHeaders = await headers();
  const authenticated = await verifySessionCookie(
    requestHeaders.get("Cookie"),
    env.SESSION_SECRET,
  );
  if (!authenticated) redirect("/login");

  const rows = await loadDashboardRows(env.DB);
  return <Dashboard initialData={buildDashboard(rows)} />;
}
