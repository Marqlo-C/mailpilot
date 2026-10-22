/**
 * Tiny relative-time formatter (no date-fns dependency).
 * Short units: s, m, h, d, mo, y.
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
    const label = `${value}${unit}`;
    if (!addSuffix) return label;
    return future ? `in ${label}` : `${label} ago`;
  };

  if (seconds < 45) return format(Math.max(1, seconds), "s");
  if (seconds < 90) return format(1, "m");
  const minutes = Math.round(seconds / 60);
  if (minutes < 45) return format(minutes, "m");
  if (minutes < 90) return format(1, "h");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return format(hours, "h");
  if (hours < 42) return format(1, "d");
  const days = Math.round(hours / 24);
  if (days < 30) return format(days, "d");
  const months = Math.round(days / 30);
  if (months < 12) return format(Math.max(1, months), "mo");
  const years = Math.round(days / 365);
  return format(Math.max(1, years), "y");
}
