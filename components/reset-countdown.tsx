"use client";

import { useEffect, useState } from "react";

import { formatExactReset, formatResetCountdown } from "@/lib/usage-format";

export function ResetCountdown({ resetsAt }: { resetsAt: string | null }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, []);

  const seconds = resetsAt && now !== null ? (Date.parse(resetsAt) - now) / 1000 : null;
  const countdown = now === null
    ? "Calculating…"
    : seconds === null
      ? "Unavailable"
      : formatResetCountdown(seconds);
  const exactReset = now === null || (seconds !== null && seconds <= 0)
    ? null
    : formatExactReset(resetsAt);

  return (
    <div className="quota-reset">
      <span>Resets in</span>
      <strong>{countdown}</strong>
      <small>{exactReset}</small>
    </div>
  );
}
