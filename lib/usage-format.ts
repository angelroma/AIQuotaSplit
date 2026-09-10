const NUMBER_LOCALE = "en-US";

export function formatCompactTokens(value: number) {
  const formatted = new Intl.NumberFormat(NUMBER_LOCALE, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
  return `${formatted} tokens`;
}

export function formatEstimatedCost(value: number | null) {
  return value === null
    ? "Unavailable"
    : new Intl.NumberFormat(NUMBER_LOCALE, {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
}

export function formatResetCountdown(secondsRemaining: number) {
  if (secondsRemaining <= 0) return "Waiting for a weekly meter";
  const days = Math.floor(secondsRemaining / 86_400);
  const hours = Math.floor((secondsRemaining % 86_400) / 3_600);
  const minutes = Math.floor((secondsRemaining % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

export function formatExactReset(iso: string | null) {
  if (iso === null) return "Waiting for a weekly meter";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}
