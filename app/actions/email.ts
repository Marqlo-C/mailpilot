"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";

import {
  InsufficientScopeError,
  REAUTH_REQUIRED_MESSAGE,
  isInsufficientScopeError,
} from "@/lib/gmail/google";
import { SYNC_LOCK_STALE_MS } from "@/lib/core/constants";
import { getAuthenticatedAccountId } from "@/lib/core/auth";
import { getActiveAccount } from "@/lib/data";
import {
  initSyncBatchTelemetry,
  logStory,
  syncLockLog,
  syncLog,
} from "@/lib/logging";
import { purgeExpiredDismissed } from "@/lib/opportunities/cleanup";
import {
  runOpportunitySync,
  runPendingAiQueueDrain,
} from "@/lib/opportunities/sync";
import { checkRateLimit } from "@/lib/core/ratelimit";
import {
  syncInputSchema,
  drainQueuedSchema,
  flushAccountSchema,
  type SyncInput,
  type DrainQueuedInput,
} from "@/lib/validations/sync.schema";
import {
  completeDrainSession,
  completeSyncSession,
  findAccountForSync,
  findAccountsForProfileCheck,
  flushPendingAiMessagesForAccount,
  resetSyncLock,
  startSyncSession,
} from "@/lib/services/email-ingestion.service";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export type { SyncInput, DrainQueuedInput };

/**
 * Immediately clears a stuck isSyncing lock for the active account.
 */
export async function forceResetSyncStatus(): Promise<ActionResult> {
  const active = await getActiveAccount();
  if (!active) {
    return { ok: false, error: "Unauthorized" };
  }

  await resetSyncLock(active.id);

  revalidatePath("/");
  revalidatePath("/jobs");
  return { ok: true };
}

/**
 * Dual-mode inbox opportunity sync (delta-first pipeline).
 *
 * - forceRescan=false → history delta, then incremental job query (after:lastSyncedAt)
 * - forceRescan=true  → history delta, then lookback window rescan/backfill
 *
 * Returns immediately; work runs in `after()`:
 * 1. Snapshot `runStartedAt` (do not write it yet)
 * 2. `runOpportunitySync` → delta → job query → PENDING_AI classify
 * 3. On success only, commit `lastSyncedAt = runStartedAt` so mail arriving during
 *    the run is still covered by the next incremental `after:` window (+ overlap)
 *
 * Heartbeat / stale-lock constants are owned by sync-status polling — untouched here.
 * `triggerManualSync` remains available for isolated delta tests.
 */
export async function syncInboxOpportunities(
  input: {
    forceRescan?: boolean;
    lookbackDays?: number;
    accountId?: string;
  } = {}
): Promise<ActionResult<{ message: string; mode: "incremental" | "rescan" }>> {
  const parsed = syncInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid sync input" };
  }

  const forceRescan = parsed.data.forceRescan;
  const lookbackDays = parsed.data.lookbackDays;

  let accountId = parsed.data.accountId;
  if (!accountId) {
    const active = await getActiveAccount();
    if (!active) {
      return { ok: false, error: "Unauthorized — connect a Gmail account first" };
    }
    accountId = active.id;
  }

  const account = await findAccountForSync(accountId);
  if (!account || !account.isActive) {
    return { ok: false, error: "Account not found or inactive" };
  }

  const rateLimit = await checkRateLimit(`sync:${accountId}`, "strict");
  if (!rateLimit.success) {
    return {
      ok: false,
      error: "Sync rate limit reached. Please wait a few seconds before syncing again.",
    };
  }

  if (account.isSyncing) {
    const lockAgeMs = Date.now() - account.updatedAt.getTime();
    if (lockAgeMs <= SYNC_LOCK_STALE_MS) {
      return {
        ok: true,
        data: {
          message: "Sync already running in background",
          mode: forceRescan ? "rescan" : "incremental",
        },
      };
    }
    syncLockLog.warn(
      { ageSec: Math.round(lockAgeMs / 1000) },
      "Clearing stale sync lock before new sync"
    );
  }

  const runStartedAt = new Date();
  initSyncBatchTelemetry({ startTime: runStartedAt.getTime() });

  await startSyncSession(account.id, runStartedAt, "inbox");

  const syncAccountId = account.id;
  const mode = forceRescan ? ("rescan" as const) : ("incremental" as const);

  after(async () => {
    let errorMessage: string | null = null;
    let processed = 0;
    let createdCount = 0;

    logStory(syncLog, "Step 0 — Snapshot run start time (not written yet)", {
      runStartedAt: runStartedAt.toISOString(),
      mode,
      note: "This becomes lastSyncedAt only if the whole pass succeeds.",
    });

    try {
      const result = await runOpportunitySync(syncAccountId, {
        forceRescan,
        lookbackDays,
        syncStartedAt: runStartedAt.getTime(),
      });
      processed = result.processed;
      createdCount = result.createdCount ?? 0;

      try {
        const purge = await purgeExpiredDismissed(syncAccountId);
        if (purge.purgedCount > 0 || purge.purgedEmailCount > 0) {
          logStory(
            syncLog,
            "Housekeeping — purged expired dismissed opportunities and stale emails",
            {
              "purged opportunities": purge.purgedCount,
              "purged emails": purge.purgedEmailCount,
              "retention days": purge.retentionDays,
            }
          );
        }
      } catch (purgeError) {
        syncLog.error({ err: purgeError }, "purgeExpiredDismissed failed");
      }

      revalidatePath("/");
      revalidatePath("/jobs");
      revalidatePath("/subscriptions");
    } catch (error) {
      syncLog.error({ err: error }, "syncInboxOpportunities background failed");
      if (
        error instanceof InsufficientScopeError ||
        isInsufficientScopeError(error)
      ) {
        errorMessage = REAUTH_REQUIRED_MESSAGE;
      } else {
        errorMessage =
          error instanceof Error ? error.message : "Inbox sync failed";
      }
    } finally {
      const stampedLastSyncedAt = !errorMessage;
      await completeSyncSession(syncAccountId, {
        errorMessage,
        runStartedAt,
        createdCount,
        advanceLastSyncedAt: stampedLastSyncedAt,
      });

      if (stampedLastSyncedAt) {
        logStory(syncLog, "Step 4/4 — Finish SUCCESS", {
          lastSyncedAt: runStartedAt.toISOString(),
          "opportunities touched": processed,
          isSyncing: false,
        });
      } else {
        logStory(
          syncLog,
          "Step 4/4 — Finish FAILED — lastSyncedAt NOT advanced",
          {
            error: errorMessage,
            isSyncing: false,
          },
          "warn"
        );
      }
    }
  });

  return {
    ok: true,
    data: {
      message: forceRescan
        ? "Force rescan started in background"
        : "Sync started in background",
      mode,
    },
  };
}

/**
 * Ace queue only — classify PENDING_AI up to the account drain cap.
 * Same sync lock / cancel flyout as Sync Inbox; does not run delta/search
 * and does not advance `lastSyncedAt`.
 */
export async function drainPendingAiQueue(
  input: { accountId?: string } = {}
): Promise<ActionResult<{ message: string }>> {
  const parsed = drainQueuedSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid input" };
  }

  let accountId = parsed.data.accountId;
  if (!accountId) {
    const active = await getActiveAccount();
    if (!active) {
      return { ok: false, error: "Unauthorized — connect a Gmail account first" };
    }
    accountId = active.id;
  }

  const sessionAccountId = await getAuthenticatedAccountId();
  if (!sessionAccountId) {
    return { ok: false, error: "Unauthorized" };
  }

  const [account, sessionAccount] = await findAccountsForProfileCheck(
    accountId,
    sessionAccountId
  );

  if (!account || !account.isActive) {
    return { ok: false, error: "Account not found or inactive" };
  }

  const sameProfile =
    account.persistentProfileId != null &&
    account.persistentProfileId === sessionAccount?.persistentProfileId;
  if (account.id !== sessionAccountId && !sameProfile) {
    return { ok: false, error: "Unauthorized" };
  }

  const rateLimit = await checkRateLimit(`sync:${account.id}`, "strict");
  if (!rateLimit.success) {
    return {
      ok: false,
      error: "Sync rate limit reached. Please wait a few seconds before trying again.",
    };
  }

  if (account.isSyncing) {
    const lockAgeMs = Date.now() - account.updatedAt.getTime();
    if (lockAgeMs <= SYNC_LOCK_STALE_MS) {
      return {
        ok: true,
        data: { message: "Sync already running in background" },
      };
    }
    syncLockLog.warn(
      { ageSec: Math.round(lockAgeMs / 1000) },
      "Clearing stale sync lock before Ace queue drain"
    );
  }

  const runStartedAt = new Date();
  initSyncBatchTelemetry({ startTime: runStartedAt.getTime() });

  await startSyncSession(account.id, runStartedAt, "queued");

  const drainAccountId = account.id;

  after(async () => {
    let errorMessage: string | null = null;
    let createdCount = 0;

    try {
      const result = await runPendingAiQueueDrain(drainAccountId, {
        syncStartedAt: runStartedAt.getTime(),
      });
      createdCount = result.createdCount ?? 0;
      revalidatePath("/");
      revalidatePath("/jobs");
      revalidatePath("/subscriptions");
    } catch (error) {
      syncLog.error({ err: error }, "drainPendingAiQueue background failed");
      if (
        error instanceof InsufficientScopeError ||
        isInsufficientScopeError(error)
      ) {
        errorMessage = REAUTH_REQUIRED_MESSAGE;
      } else {
        errorMessage =
          error instanceof Error ? error.message : "Ace queue review failed";
      }
    } finally {
      await completeDrainSession(drainAccountId, {
        errorMessage,
        createdCount,
      });
    }
  });

  return {
    ok: true,
    data: { message: "Ace is reviewing queued emails" },
  };
}

/**
 * Defuses the unclassified queue without deleting rows or moving sync watermarks.
 * `messageId` stays so the next incremental sync does not treat the mail as new.
 */
export async function flushPendingAiMessages(
  accountId: string
): Promise<ActionResult<{ flushed: number }>> {
  const parsed = flushAccountSchema.safeParse(accountId);
  if (!parsed.success) {
    return { ok: false, error: "Invalid account" };
  }

  const sessionAccountId = await getAuthenticatedAccountId();
  if (!sessionAccountId) {
    return { ok: false, error: "Unauthorized" };
  }

  const [account, sessionAccount] = await findAccountsForProfileCheck(
    parsed.data,
    sessionAccountId
  );

  if (!account || !account.isActive) {
    return { ok: false, error: "Account not found or inactive" };
  }

  const sameProfile =
    account.persistentProfileId != null &&
    account.persistentProfileId === sessionAccount?.persistentProfileId;
  if (account.id !== sessionAccountId && !sameProfile) {
    return { ok: false, error: "Unauthorized" };
  }

  const rateLimit = await checkRateLimit(`flush:${account.id}`, "strict");
  if (!rateLimit.success) {
    return {
      ok: false,
      error: "Flush rate limit reached. Please wait a few seconds before trying again.",
    };
  }

  const flushedCount = await flushPendingAiMessagesForAccount(account.id);

  revalidatePath("/");
  revalidatePath("/jobs");

  return { ok: true, data: { flushed: flushedCount } };
}
