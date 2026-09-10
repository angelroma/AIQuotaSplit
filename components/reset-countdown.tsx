"use client";

import { useEffect, useState } from "react";

import { formatExactReset, formatResetCountdown } from "@/lib/usage-format";

export function ResetCountdown({ resetsAt }: { resetsAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const seconds = resetsAt ? (Date.parse(resetsAt) - now) / 1000 : null;

  return (
    <div className="quota-reset">
      <span>Resets in</span>
      <strong>{seconds === null ? "Unavailable" : formatResetCountdown(seconds)}</strong>
      <small>{formatExactReset(resetsAt)}</small>
    </div>
  );
}
