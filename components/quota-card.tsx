import { Clock3 } from "lucide-react";

import type { DashboardView } from "@/lib/allocation";

function formatPercent(value: number | null) {
  return value === null ? "—" : `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

export function QuotaCard({ data }: { data: DashboardView }) {
  const used = Math.min(100, Math.max(0, data.sharedUsedPercent ?? 0));
  const localBasis = data.weightBasis === "estimated-cost" ? "Model-aware cost weighting" : data.weightBasis === "tokens" ? "Token weighting" : "No local weighting yet";
  return (
    <article className="quota-card">
      <div className="quota-card-head">
        <div><p className="eyebrow light">Shared account usage</p><div className="quota-number">{formatPercent(data.sharedUsedPercent)}</div></div>
        <span className="live-pill"><i aria-hidden="true" />Weekly meter</span>
      </div>
      <div className="meter-wrap">
        <div className="meter" role="progressbar" aria-label="Shared weekly account usage" aria-valuemin={0} aria-valuemax={100} aria-valuenow={data.sharedUsedPercent ?? undefined}>
          <span style={{ width: `${used}%` }} /><i className="half-marker" aria-hidden="true" />
        </div>
        <div className="meter-labels" aria-hidden="true"><span>0</span><span>Your two 50% halves meet here</span><span>100</span></div>
      </div>
      <div className="quota-meta">
        <div><Clock3 aria-hidden="true" className="size-4" /><span>Tracking since<strong>{data.trackingStartedAt ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(data.trackingStartedAt)) : " first sync"}</strong></span></div>
        <div><span>Allocation basis</span><strong>{localBasis}</strong></div>
      </div>
    </article>
  );
}
