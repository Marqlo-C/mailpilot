/**
 * SSOT for opportunity-sync batch ceilings.
 * Historical scan caps (job 30 / subscription 150) live elsewhere and stay fixed.
 */

/** Default Gmail job-query cap for manual Sync Inbox. */
export const DEFAULT_SYNC_MAX_MESSAGES = 50;

/** Default PENDING_AI rows drained per sync. */
export const DEFAULT_PENDING_AI_DRAIN = 10;

/** Cron / Hobby safety ceiling for Gmail job-query hits. */
export const CRON_SYNC_MAX_MESSAGES = 10;

export const MIN_SYNC_MAX_MESSAGES = 1;
export const MAX_SYNC_MAX_MESSAGES = 100;

export const MIN_PENDING_AI_DRAIN = 0;
export const MAX_PENDING_AI_DRAIN = 50;

export function clampSyncMaxMessages(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SYNC_MAX_MESSAGES;
  return Math.min(
    MAX_SYNC_MAX_MESSAGES,
    Math.max(MIN_SYNC_MAX_MESSAGES, Math.round(value))
  );
}

export function clampPendingAiDrain(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PENDING_AI_DRAIN;
  return Math.min(
    MAX_PENDING_AI_DRAIN,
    Math.max(MIN_PENDING_AI_DRAIN, Math.round(value))
  );
}
