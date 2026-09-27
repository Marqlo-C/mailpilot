/**
 * Tiny relative-time formatter (no date-fns dependency).
 */
export function formatDistanceToNow(
  date: Date,
  options?: { addSuffix?: boolean }
): string {
  const ms = Date.now() - date.getTime();
  const seconds = Math.round(Math.abs(ms) / 1000);
  const addSuffix = options?.addSuffix === true;
  const future = ms < 0;

  const format = (value: number, unit: string) => {
    const label = `${value} ${unit}${value === 1 ? "" : "s"}`;
    if (!addSuffix) return label;
    return future ? `in ${label}` : `${label} ago`;
  };

  if (seconds < 45) return addSuffix ? (future ? "in moments" : "just now") : "0 seconds";
  if (seconds < 90) return format(1, "minute");
  const minutes = Math.round(seconds / 60);
  if (minutes < 45) return format(minutes, "minute");
  if (minutes < 90) return format(1, "hour");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return format(hours, "hour");
  if (hours < 42) return format(1, "day");
  const days = Math.round(hours / 24);
  if (days < 30) return format(days, "day");
  const months = Math.round(days / 30);
  if (months < 12) return format(Math.max(1, months), "month");
  const years = Math.round(days / 365);
  return format(Math.max(1, years), "year");
}
