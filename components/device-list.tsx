"use client";

import { useState } from "react";
import { Laptop, MoreHorizontal, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { DashboardView } from "@/lib/allocation";

const statusCopy = { synced: "Synced", "out-of-sync": "Out of sync", "never-synced": "Never synced" } as const;

export function DeviceList({ devices, members, onChanged }: {
  devices: DashboardView["devices"];
  members: DashboardView["members"];
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);

  async function revoke(deviceId: string, displayName: string) {
    if (!window.confirm(`Revoke ${displayName}? Its history will be kept.`)) return;
    setBusyId(deviceId);
    try {
      const response = await fetch("/api/devices/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });
      if (response.ok) onChanged();
    } finally {
      setBusyId(null);
      setMenuId(null);
    }
  }

  const owners = new Map(members.map((member) => [member.id, member.displayName]));
  return (
    <section className="devices-section entrance entrance-4" aria-labelledby="devices-title">
      <div className="section-heading">
        <div><p className="eyebrow">Collector status</p><h2 id="devices-title">Registered computers</h2></div>
        <span>{devices.length} active</span>
      </div>
      {devices.length ? (
        <div className="device-list">
          {devices.map((device) => (
            <article className="device-row" key={device.id}>
              <span className="device-icon"><Laptop aria-hidden="true" /></span>
              <div className="device-main"><strong>{device.displayName}</strong><span>{owners.get(device.memberId) ?? "Unknown member"} · {device.platform}</span></div>
              <div className="device-sync">
                <span className={`status-dot ${device.freshness}`}><i aria-hidden="true" />{statusCopy[device.freshness]}</span>
                <small>{device.lastSyncAt ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(device.lastSyncAt)) : "Run setup, then sync"}</small>
              </div>
              <div className="device-menu">
                <Button variant="ghost" size="icon-sm" aria-label={`Manage ${device.displayName}`} onClick={() => setMenuId(menuId === device.id ? null : device.id)}><MoreHorizontal aria-hidden="true" /></Button>
                {menuId === device.id ? (
                  <button type="button" className="revoke-button" onClick={() => revoke(device.id, device.displayName)} disabled={busyId === device.id}>
                    {busyId === device.id ? <RefreshCw className="animate-spin" /> : <Trash2 />}Revoke device
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="device-empty"><Laptop aria-hidden="true" /><div><strong>No computers registered</strong><p>Run <code>$ai-quota-split setup</code> on the first computer.</p></div></div>
      )}
    </section>
  );
}
