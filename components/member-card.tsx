import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import type { DashboardView } from "@/lib/allocation";

type Member = DashboardView["members"][number];
const display = (value: number) => `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;

export function MemberCard({ member, index }: { member: Member; index: number }) {
  const over = member.personalQuotaConsumedPercent > 100;
  return (
    <article className={`member-card member-${index + 1}`}>
      <div className="member-card-head">
        <span className="member-avatar" aria-hidden="true">{member.displayName.slice(0, 1).toUpperCase()}</span>
        <div><h2>{member.displayName}</h2><p>{member.quotaPercent}% personal share</p></div>
        <span className={`trend-pill ${over ? "over" : ""}`}>{over ? <ArrowUpRight /> : <ArrowDownRight />}{over ? "Over half" : "Within half"}</span>
      </div>
      <div className="member-figures">
        <div><span>Of the full account</span><strong>{display(member.accountPercent)}</strong></div>
        <div><span>Of their half used</span><strong>{display(member.personalQuotaConsumedPercent)}</strong></div>
      </div>
      <div className="personal-meter" aria-hidden="true"><span style={{ width: `${Math.min(100, member.personalQuotaConsumedPercent)}%` }} /></div>
      <p className="remaining-copy"><strong>{display(member.personalQuotaRemainingPercent)}</strong> of this person&apos;s half remains</p>
    </article>
  );
}
