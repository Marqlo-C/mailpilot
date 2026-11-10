import { prisma } from "@/lib/core/prisma";
import { SYNC_HEARTBEAT_STALE_MS } from "@/lib/core/constants";
import { syncLockLog } from "@/lib/logging";

export interface AccountSyncStatusData {
  isSyncing: boolean;
  lastSyncedAt: string | null;
  syncError: string | null;
  lastSyncProcessed: number | null;
  syncTotal: number | null;
  pendingClassificationCount: number;
}

export interface AccountScanTarget {
  id: string;
  isActive: boolean;
  isSyncing: boolean;
}

/**
 * Reads account data needed to evaluate whether a historical inbox scan can proceed.
 */
export async function getAccountScanTarget(
  accountId: string
): Promise<AccountScanTarget | null> {
  return prisma.account.findUnique({
    where: { id: accountId },
    select: { id: true, isActive: true, isSyncing: true },
  });
}

/**
 * Sets the account's sync lock and initializes syncHeartbeatAt.
 */
export async function markAccountSyncStarted(accountId: string): Promise<void> {
  await prisma.account.update({
    where: { id: accountId },
    data: {
      isSyncing: true,
      syncError: null,
      syncHeartbeatAt: new Date(),
    },
  });
}

/**
 * Clears the account's sync lock and updates completion telemetry.
 */
export async function finalizeAccountSync(
  accountId: string,
  options: { errorMessage: string | null; jobsFound: number }
): Promise<void> {
  await prisma.account.update({
    where: { id: accountId },
    data: {
      isSyncing: false,
      lastSyncedAt: new Date(),
      syncError: options.errorMessage,
      lastSyncProcessed: options.errorMessage ? null : options.jobsFound,
      syncTotal: null,
    },
  });
}

/**
 * Reads account sync telemetry and heals stale background sync locks if the heartbeat timed out.
 */
export async function readAccountSyncStatus(
  accountId: string
): Promise<{ ok: true; data: AccountSyncStatusData } | { ok: false; error: string }> {
  try {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        isSyncing: true,
        lastSyncedAt: true,
        syncError: true,
        lastSyncProcessed: true,
        syncTotal: true,
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
            syncTotal: null,
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
        syncTotal: account.syncTotal ?? null,
        pendingClassificationCount,
      },
    };
  } catch (error) {
    console.error("readAccountSyncStatus failed", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to read sync status",
    };
  }
}
