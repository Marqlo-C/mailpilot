/** Client-safe briefing/digest constants (no Node / googleapis imports). */

export const MAX_BRIEFING_DAYS = 10;

export type DateRangeValue = {
  from: Date | undefined;
  to: Date | undefined;
};

/** Inclusive day span between two local calendar dates. */
export function inclusiveDaySpan(from: Date, to: Date): number {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
}

export function isValidBriefingRange(
  from: Date | undefined,
  to: Date | undefined
): boolean {
  if (!from || !to) return false;
  const span = inclusiveDaySpan(from, to);
  return span >= 1 && span <= MAX_BRIEFING_DAYS;
}
