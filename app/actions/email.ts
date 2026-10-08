"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  InsufficientScopeError,
  REAUTH_REQUIRED_MESSAGE,
  isInsufficientScopeError,
} from "@/lib/google";
import { SYNC_LOCK_STALE_MS } from "@/lib/constants";
import { getAuthenticatedAccountId } from "@/lib/auth";
import { getActiveAccount } from "@/lib/data";
import { logStory, syncLockLog, syncLog } from "@/lib/logging";
import { purgeExpiredDismissed } from "@/lib/opportunities/cleanup";
import { runOpportunitySync } from "@/lib/opportunity-sync";
import { prisma } from "@/lib/prisma";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const syncInputSchema = z.object({
  forceRescan: z.boolean().default(false),
  lookbackDays: z.number().int().min(1).max(30).default(14),
  accountId: z.string().min(1).optional(),
});

/**
 * Immediately clears a stuck isSyncing lock for the active account.
 */
export async function forceResetSyncStatus(): Promise<ActionResult> {
  const active = await getActiveAccount();
  if (!active) {
    return { ok: false, error: "Unauthorized" };
  }

  await prisma.account.update({
    where: { id: active.id },
    data: {
      isSyncing: false,
      syncError: null,
      lastSyncedAt: new Date(),
    },
  });

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
 * Settings → Sync (`triggerManualSync`) remains available for isolated delta tests.
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

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { id: true, isActive: true, isSyncing: true, updatedAt: true },
  });

  if (!account || !account.isActive) {
    return { ok: false, error: "Account not found or inactive" };
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

  await prisma.account.update({
    where: { id: account.id },
    data: {
      isSyncing: true,
      syncError: null,
      lastSyncProcessed: null,
      syncHeartbeatAt: new Date(),
    },
  });

  const syncAccountId = account.id;
  const mode = forceRescan ? ("rescan" as const) : ("incremental" as const);

  after(async () => {
    // Snapshot before any digestion so mid-run arrivals stay inside the next
    // incremental window (plus INCREMENTAL_OVERLAP_SECONDS in opportunity-sync).
    const runStartedAt = new Date();
    let errorMessage: string | null = null;
    let processed = 0;

    logStory(syncLog, "Step 0 — Snapshot run start time (not written yet)", {
      runStartedAt: runStartedAt.toISOString(),
      mode,
      note: "This becomes lastSyncedAt only if the whole pass succeeds.",
    });

    try {
      const result = await runOpportunitySync(syncAccountId, {
        forceRescan,
        lookbackDays,
        maxMessages: 25,
      });
      processed = result.opportunitiesUpserted;

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
      // ALWAYS clear lock — even on crash / timeout paths we control.
      // Advance lastSyncedAt only on success, using the pre-run snapshot.
      const stampedLastSyncedAt = !errorMessage;
      try {
        await prisma.account.update({
          where: { id: syncAccountId },
          data: {
            isSyncing: false,
            ...(stampedLastSyncedAt ? { lastSyncedAt: runStartedAt } : {}),
            syncError: errorMessage,
            lastSyncProcessed: errorMessage ? null : processed,
          },
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

      } catch (finalizeError) {
        syncLog.error(
          { err: finalizeError },
          "Failed to clear isSyncing after inbox sync"
        );
        // Last-resort retry without optional fields.
        try {
          await prisma.account.update({
            where: { id: syncAccountId },
            data: { isSyncing: false },
          });
        } catch (retryError) {
          syncLog.error({ err: retryError }, "Retry clear isSyncing also failed");
        }
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

const flushAccountSchema = z.string().min(1);

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

  const [account, sessionAccount] = await Promise.all([
    prisma.account.findUnique({
      where: { id: parsed.data },
      select: { id: true, isActive: true, persistentProfileId: true },
    }),
    prisma.account.findUnique({
      where: { id: sessionAccountId },
      select: { persistentProfileId: true },
    }),
  ]);

  if (!account || !account.isActive) {
    return { ok: false, error: "Account not found or inactive" };
  }

  const sameProfile =
    account.persistentProfileId != null &&
    account.persistentProfileId === sessionAccount?.persistentProfileId;
  if (account.id !== sessionAccountId && !sameProfile) {
    return { ok: false, error: "Unauthorized" };
  }

  const flushed = await prisma.emailMessage.updateMany({
    where: {
      accountId: account.id,
      emailCategory: "PENDING_AI",
      opportunities: { none: {} },
    },
    data: {
      emailCategory: "IRRELEVANT",
      rawBody: null,
    },
  });

  revalidatePath("/");
  revalidatePath("/jobs");

  return { ok: true, data: { flushed: flushed.count } };
}
