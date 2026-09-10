"use client";

import { useState, useTransition } from "react";
import { ArrowUpRight, LogOut, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { DashboardView } from "@/lib/allocation";
import { MemberCard } from "./member-card";
import { QuotaCard } from "./quota-card";

function QualityNotice({ data }: { data: DashboardView }) {
  if (data.quality.length === 0) return null;
  const messages = {
    partial: "At least one computer is missing a fresh, full-window report.",
    "rate-limit-unavailable": "The exact weekly Codex meter is unavailable; local totals will wait for the next valid read.",
    unassigned: "Account usage exists, but no local aggregate is available to assign it yet.",
  } as const;
  return (
    <aside className="quality-note" aria-label="Estimate quality">
      <Sparkles aria-hidden="true" className="size-4 shrink-0" />
      <div><strong>Estimate needs context.</strong> {data.quality.map((quality) => messages[quality]).join(" ")}</div>
    </aside>
  );
}

export function Dashboard({ initialData }: { initialData: DashboardView }) {
  const [data, setData] = useState(initialData);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      setError(null);
      try {
        const response = await fetch("/api/dashboard", { cache: "no-store" });
        if (response.status === 401) {
          window.location.assign("/login");
          return;
        }
        if (!response.ok) throw new Error("refresh failed");
        setData((await response.json()) as DashboardView);
      } catch {
        setError("Couldn’t refresh. Your last loaded estimate is still shown.");
      }
    });
  }

  return (
    <main className="dashboard-shell">
      <div className="ambient-orbit" aria-hidden="true" />
      <header className="topbar entrance entrance-1">
        <Link href="/" className="brand" aria-label="AIQuotaSplit dashboard">
          <span className="split-mark" aria-hidden="true"><i /><i /></span>
          <span>AIQuotaSplit</span>
        </Link>
        <div className="topbar-actions">
          <span className="private-label"><ShieldCheck aria-hidden="true" className="size-3.5" />Private dashboard</span>
          <Button variant="outline" size="sm" onClick={refresh} disabled={pending} className="action-button">
            <RefreshCw aria-hidden="true" className={`size-3.5 ${pending ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <form action="/api/logout" method="post">
            <Button variant="ghost" size="icon-sm" aria-label="Sign out" className="text-[var(--ink-muted)]"><LogOut aria-hidden="true" /></Button>
          </form>
        </div>
      </header>

      <section className="hero entrance entrance-2">
        <div>
          <p className="eyebrow">Current 7-day Codex window</p>
          <h1>One quota. Two fair halves.</h1>
          <p className="hero-copy">A private estimate built from aggregate usage on every registered computer—never prompts, files, or source code.</p>
        </div>
      </section>

      {error ? <p role="alert" className="error-toast">{error}</p> : null}
      <QualityNotice data={data} />

      <section className="dashboard-grid entrance entrance-3">
        <QuotaCard data={data} />
        <div className="member-stack" aria-label="Member allocation">
          {data.members.length ? data.members.map((member, index) => {
            const devices = data.devices.filter((device) => device.memberId === member.id);
            return (
              <MemberCard key={member.id} member={member} index={index} devices={devices} onChanged={refresh} />
            );
          }) : (
            <div className="empty-members">
              <p className="eyebrow">No members yet</p>
              <h2>Start on the first computer.</h2>
              <code>$ai-quota-split setup</code>
              <p>Then run <code>$ai-quota-split sync</code> to send the first aggregate report.</p>
            </div>
          )}
        </div>
      </section>

      <footer className="dashboard-footer entrance entrance-5">
        <div><span>Last calculated</span><strong>{new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(data.generatedAt))}</strong></div>
        <a href="https://github.com/angelroma/AIQuotaSplit" target="_blank" rel="noreferrer">View the public collector source<ArrowUpRight aria-hidden="true" className="size-3.5" /></a>
      </footer>
    </main>
  );
}
