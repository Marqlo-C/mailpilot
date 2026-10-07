/**
 * Per-account Subscriptions UI preferences (localStorage only).
 */

const LEGACY_CLUTTER_KEY = "mailpilot_subscriptions_min_clutter";

function clutterKey(accountId: string): string {
  return `mailpilot_subscriptions_min_clutter:${accountId}`;
}

function customOrderKey(accountId: string): string {
  return `mailpilot_subscriptions_custom_order:${accountId}`;
}

function clampClutter(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Read clutter threshold; migrates legacy global key → per-account once. */
export function readClutterThreshold(accountId: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const scoped = localStorage.getItem(clutterKey(accountId));
    if (scoped != null) {
      const parsed = Number.parseInt(scoped, 10);
      if (!Number.isFinite(parsed)) return null;
      return clampClutter(parsed);
    }

    const legacy = localStorage.getItem(LEGACY_CLUTTER_KEY);
    if (legacy == null) return null;
    const parsed = Number.parseInt(legacy, 10);
    if (!Number.isFinite(parsed)) return null;
    const value = clampClutter(parsed);
    localStorage.setItem(clutterKey(accountId), String(value));
    localStorage.removeItem(LEGACY_CLUTTER_KEY);
    return value;
  } catch {
    return null;
  }
}

export function persistClutterThreshold(
  accountId: string,
  value: number
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(clutterKey(accountId), String(clampClutter(value)));
  } catch {
    // Quota / private mode — ignore.
  }
}

export function readCustomOrder(accountId: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(customOrderKey(accountId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export function persistCustomOrder(
  accountId: string,
  order: string[]
): void {
  if (typeof window === "undefined") return;
  try {
    if (order.length === 0) {
      localStorage.removeItem(customOrderKey(accountId));
      return;
    }
    localStorage.setItem(customOrderKey(accountId), JSON.stringify(order));
  } catch {
    // Quota / private mode — ignore.
  }
}

/** Apply a saved id order; unknown ids keep relative filtered order at the end. */
export function applyCustomOrder<T extends { id: string }>(
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
