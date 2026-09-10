import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import type { DashboardView } from "@/lib/allocation";
import { formatCompactTokens, formatEstimatedCost } from "@/lib/usage-format";
import { DeviceList } from "./device-list";

type Member = DashboardView["members"][number];
const display = (value: number) => `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
const freshnessCopy = {
  synced: "Synced",
  "out-of-sync": "Out of sync",
  "never-synced": "Never synced",
} as const;

export function MemberCard({ member, index, devices, onChanged }: {
  member: Member;
  index: number;
  devices: DashboardView["devices"];
  onChanged: () => void;
}) {
  const over = member.personalQuotaConsumedPercent > 100;
  const computerLabel = `${member.deviceCount} ${member.deviceCount === 1 ? "computer" : "computers"}`;
  return (
    <article className={`member-card member-${index + 1}`}>
      <div className="member-card-head">
        <span className="member-avatar" aria-hidden="true">{member.displayName.slice(0, 1).toUpperCase()}</span>
        <div>
          <h2>{member.displayName}</h2>
          <p className="member-meta">
            <span>{member.quotaPercent}% personal share</span>
            <span>{computerLabel}</span>
            <span>{member.freshness ? freshnessCopy[member.freshness] : "No sync status"}</span>
          </p>
        </div>
        <span className={`trend-pill ${over ? "over" : ""}`}>{over ? <ArrowUpRight /> : <ArrowDownRight />}{over ? "Over half" : "Within half"}</span>
      </div>
      <div className="member-summary-grid">
        <div className="member-allocation">
          <div className="member-figures">
            <div><span>Of the full account</span><strong>{display(member.accountPercent)}</strong></div>
            <div><span>Of their half used</span><strong>{display(member.personalQuotaConsumedPercent)}</strong></div>
          </div>
          <div className="personal-meter" aria-hidden="true"><span style={{ width: `${Math.min(100, member.personalQuotaConsumedPercent)}%` }} /></div>
          <p className="remaining-copy"><strong>{display(member.personalQuotaRemainingPercent)}</strong> of this person&apos;s half remains</p>
        </div>
        <div className="member-local-totals">
          <div><span>Estimated local cost</span><strong>{formatEstimatedCost(member.localUsage?.estimatedCostUsd ?? null)}</strong></div>
          <div><span>Local tokens</span><strong>{member.localUsage ? formatCompactTokens(member.localUsage.totalTokens) : "Unavailable"}</strong></div>
        </div>
      </div>
      <DeviceList devices={devices} onChanged={onChanged} />
    </article>
  );
}
