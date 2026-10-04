/**
 * Client-side archive of displaced briefings (DB keeps only the newest).
 * Keyed per account → subscriptionId.
 */

export type LocalBriefingRecord = {
  id: string;
  htmlPreview: string;
  generatedAt: string;
  senderEmails: string[];
  subscriptionIds: string[];
};

function storageKey(accountId: string): string {
  return `mailpilot_briefings_${accountId}`;
}

function readMap(accountId: string): Record<string, LocalBriefingRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(storageKey(accountId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, LocalBriefingRecord>;
  } catch {
    return {};
  }
}

function writeMap(
  accountId: string,
  map: Record<string, LocalBriefingRecord>
): void {
  if (typeof window === "undefined") return;
  try {
    if (Object.keys(map).length === 0) {
      localStorage.removeItem(storageKey(accountId));
      return;
    }
    localStorage.setItem(storageKey(accountId), JSON.stringify(map));
  } catch {
    // Quota / private mode — ignore.
  }
}

export function listLocalBriefings(
  accountId: string
): Record<string, LocalBriefingRecord> {
  return readMap(accountId);
}

export function getLocalBriefing(
  accountId: string,
  subscriptionId: string
): LocalBriefingRecord | null {
  return readMap(accountId)[subscriptionId] ?? null;
}

/** Persist a displaced DB briefing onto each included subscription id. */
export function migrateDisplacedBriefingToLocal(
  accountId: string,
  briefing: LocalBriefingRecord,
  /** Subscription ids that should NOT keep a local copy (covered by the new DB row). */
  skipSubscriptionIds: string[] = []
): number {
  const skip = new Set(skipSubscriptionIds);
  const map = readMap(accountId);
  let written = 0;
  for (const subId of briefing.subscriptionIds) {
    if (skip.has(subId)) continue;
    map[subId] = {
      id: briefing.id,
      htmlPreview: briefing.htmlPreview,
      generatedAt: briefing.generatedAt,
      senderEmails: briefing.senderEmails,
      subscriptionIds: briefing.subscriptionIds,
    };
    written += 1;
  }
  writeMap(accountId, map);
  return written;
}

/** Drop local copies for subscriptions now covered by the DB briefing. */
export function clearLocalBriefingsForSubscriptions(
  accountId: string,
  subscriptionIds: string[]
): number {
  const map = readMap(accountId);
  let removed = 0;
  for (const id of subscriptionIds) {
    if (map[id]) {
      delete map[id];
      removed += 1;
    }
  }
  writeMap(accountId, map);
  return removed;
}

export function deleteLocalBriefings(
  accountId: string,
  subscriptionIds: string[]
): number {
  return clearLocalBriefingsForSubscriptions(accountId, subscriptionIds);
}
