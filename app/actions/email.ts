"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  InsufficientScopeError,
  REAUTH_REQUIRED_MESSAGE,
  isInsufficientScopeError,
} from "@/lib/google";
import { getActiveAccount } from "@/lib/data";
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

const STALE_LOCK_MS = 180 * 1000;

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
 * Dual-mode inbox opportunity sync.
 * - forceRescan=false → incremental (after:lastSyncedAt), skip known EmailMessages
 * - forceRescan=true  → lookback window, re-extract & backfill salary/scores/links/logos
 *
 * Returns immediately; work runs in after(). finally always clears isSyncing.
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
    if (lockAgeMs <= STALE_LOCK_MS) {
      return {
        ok: true,
        data: {
          message: "Sync already running in background",
          mode: forceRescan ? "rescan" : "incremental",
        },
      };
    }
    console.warn(
      `Clearing stale sync lock before new sync (age=${Math.round(lockAgeMs / 1000)}s)`
    );
  }

  await prisma.account.update({
    where: { id: account.id },
    data: {
      isSyncing: true,
      syncError: null,
      lastSyncProcessed: null,
    },
  });

  const syncAccountId = account.id;
  const mode = forceRescan ? ("rescan" as const) : ("incremental" as const);

  after(async () => {
    let errorMessage: string | null = null;
    let processed = 0;

    try {
      const result = await runOpportunitySync(syncAccountId, {
        forceRescan,
        lookbackDays,
        maxMessages: 25,
      });
      processed = result.opportunitiesUpserted;

      try {
        const purge = await purgeExpiredDismissed(syncAccountId);
        if (purge.purgedCount > 0) {
          console.info(
            `Purged ${purge.purgedCount} dismissed opportunities (retention=${purge.retentionDays}d)`
          );
        }
      } catch (purgeError) {
        console.error("purgeExpiredDismissed failed", purgeError);
      }

      revalidatePath("/");
      revalidatePath("/jobs");
      revalidatePath("/subscriptions");
    } catch (error) {
      console.error("syncInboxOpportunities background failed", error);
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
      try {
        await prisma.account.update({
          where: { id: syncAccountId },
          data: {
            isSyncing: false,
            lastSyncedAt: new Date(),
            syncError: errorMessage,
            lastSyncProcessed: errorMessage ? null : processed,
          },
        });
      } catch (finalizeError) {
        console.error(
          "Failed to clear isSyncing after inbox sync",
          finalizeError
        );
        // Last-resort retry without optional fields.
        try {
          await prisma.account.update({
            where: { id: syncAccountId },
            data: { isSyncing: false },
          });
        } catch (retryError) {
          console.error("Retry clear isSyncing also failed", retryError);
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
