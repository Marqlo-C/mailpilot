/**
 * Per-account Job Radar UI preferences (localStorage only).
 * Custom order is scoped by account + tab (leads / applied / action_required).
 */

import type { JobsTabKey } from "@/lib/opportunities/sorting";

function customOrderKey(accountId: string, tab: JobsTabKey): string {
  return `mailpilot_jobs_custom_order:${accountId}:${tab}`;
}

export function readJobCustomOrder(
  accountId: string,
  tab: JobsTabKey
): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(customOrderKey(accountId, tab));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export function persistJobCustomOrder(
  accountId: string,
  tab: JobsTabKey,
  order: string[]
): void {
  if (typeof window === "undefined") return;
  try {
    if (order.length === 0) {
      localStorage.removeItem(customOrderKey(accountId, tab));
      return;
    }
    localStorage.setItem(
      customOrderKey(accountId, tab),
      JSON.stringify(order)
    );
  } catch {
    // Quota / private mode — ignore.
  }
}

/** Apply a saved id order; unknown ids keep relative filtered order at the end. */
export function applyJobCustomOrder<T extends { id: string }>(
  items: T[],
  order: string[]
): T[] {
  if (order.length === 0 || items.length <= 1) return items;
  const map = new Map(items.map((item) => [item.id, item]));
  const result: T[] = [];
  for (const id of order) {
    const item = map.get(id);
    if (!item) continue;
    result.push(item);
    map.delete(id);
  }
  for (const item of items) {
    if (map.has(item.id)) result.push(item);
  }
  return result;
}
