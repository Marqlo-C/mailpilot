"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { SYNC_HEARTBEAT_STALE_MS } from "@/lib/constants";
import {
  InsufficientScopeError,
  REAUTH_REQUIRED_MESSAGE,
  isInsufficientScopeError,
} from "@/lib/google";
import { scanHistoricalEmails } from "@/lib/historical-scan";
import { syncLockLog } from "@/lib/logging";
import { prisma } from "@/lib/prisma";
import {
  SCAN_DAY_OPTIONS,
  type ScanDays,
} from "@/lib/scan-types";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const scanInputSchema = z.object({
  accountId: z.string().min(1),
  days: z.union([
    z.literal(5),
    z.literal(10),
    z.literal(15),
    z.literal(30),
  ]),
});

/**
 * Starts a historical inbox scan in the background and returns immediately.
 * UI stays navigable; GlobalSyncTracker polls isSyncing for progress.
 */
export async function triggerHistoricalScan(
  accountId: string,
  days: number
): Promise<ActionResult<{ message: string }>> {
  const parsed = scanInputSchema.safeParse({ accountId, days });
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid scan input. days must be one of ${SCAN_DAY_OPTIONS.join(", ")}`,
    };
  }

  const account = await prisma.account.findUnique({
    where: { id: parsed.data.accountId },
    select: { id: true, isActive: true, isSyncing: true },
  });

  if (!account || !account.isActive) {
    return { ok: false, error: "Account not found or inactive" };
  }

  if (account.isSyncing) {
    return {
      ok: true,
      data: { message: "Sync already running in background" },
    };
  }

  await prisma.account.update({
    where: { id: account.id },
    data: {
      isSyncing: true,
      syncError: null,
      syncHeartbeatAt: new Date(),
    },
  });

  const scanAccountId = account.id;
  const scanDays = parsed.data.days as ScanDays;

  after(async () => {
    let errorMessage: string | null = null;
    let jobsFound = 0;
    try {
      const summary = await scanHistoricalEmails(scanAccountId, scanDays);
      jobsFound = summary.jobsFound;
      revalidatePath("/");
      revalidatePath("/subscriptions");
      revalidatePath("/jobs");
    } catch (error) {
      console.error("Background historical scan failed", error);
      if (
        error instanceof InsufficientScopeError ||
        isInsufficientScopeError(error)
      ) {
        errorMessage = REAUTH_REQUIRED_MESSAGE;
      } else {
        errorMessage =
          error instanceof Error ? error.message : "Historical scan failed";
      }
    } finally {
      try {
        await prisma.account.update({
          where: { id: scanAccountId },
          data: {
            isSyncing: false,
            lastSyncedAt: new Date(),
            syncError: errorMessage,
            lastSyncProcessed: errorMessage ? null : jobsFound,
          },
        });
      } catch (finalizeError) {
        console.error(
          "Failed to clear isSyncing after background scan",
          finalizeError
        );
      }
    }
  });

  return {
    ok: true,
    data: { message: "Sync started in background" },
  };
}

export type AccountSyncStatus = {
  isSyncing: boolean;
  lastSyncedAt: string | null;
  syncError: string | null;
  lastSyncProcessed: number | null;
  pendingClassificationCount: number;
};

/** Lightweight poll target for GlobalSyncTracker. */
export async function getAccountSyncStatus(
  accountId: string
): Promise<ActionResult<AccountSyncStatus>> {
  if (!accountId) {
    return { ok: false, error: "accountId is required" };
  }

  try {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        isSyncing: true,
        lastSyncedAt: true,
        syncError: true,
        lastSyncProcessed: true,
        updatedAt: true,
        syncHeartbeatAt: true,
      },
    });

    if (!account) {
      return { ok: false, error: "Account not found" };
    }

    let isCurrentlySyncing = account.isSyncing;
    let syncErrorMessage = account.syncError;

    if (isCurrentlySyncing) {
      const heartbeatAgeMs =
        Date.now() -
        (account.syncHeartbeatAt?.getTime() ?? account.updatedAt.getTime());

      if (heartbeatAgeMs > SYNC_HEARTBEAT_STALE_MS) {
        syncLockLog.warn(
          { heartbeatAgeSec: Math.round(heartbeatAgeMs / 1000) },
          "Clearing stale sync lock (heartbeat silent too long)"
        );

        syncErrorMessage =
          "Background sync interrupted. Auto-reset complete.";

        await prisma.account.update({
          where: { id: account.id },
          data: {
            isSyncing: false,
            syncError: syncErrorMessage,
          },
        });

        isCurrentlySyncing = false;
      }
    }

    const pendingClassificationCount = await prisma.emailMessage.count({
      where: {
        accountId: account.id,
        emailCategory: "PENDING_AI",
      },
    });

    return {
      ok: true,
      data: {
        isSyncing: isCurrentlySyncing,
        lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
        syncError: syncErrorMessage,
        lastSyncProcessed: account.lastSyncProcessed,
        pendingClassificationCount,
      },
    };
  } catch (error) {
    console.error("getAccountSyncStatus failed", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to read sync status",
    };
  }
}
