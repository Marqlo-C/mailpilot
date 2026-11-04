/** Active Account.syncKind values for live telemetry. */
export const SYNC_KIND_INBOX = "inbox" as const;
export const SYNC_KIND_QUEUED = "queued" as const;

export type SyncKind = typeof SYNC_KIND_INBOX | typeof SYNC_KIND_QUEUED;

export function parseSyncKind(value: string | null | undefined): SyncKind | null {
  if (value === SYNC_KIND_INBOX || value === SYNC_KIND_QUEUED) return value;
  return null;
}
