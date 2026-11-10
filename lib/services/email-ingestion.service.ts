import { prisma } from "@/lib/core/prisma";
import { syncLog } from "@/lib/logging";

/**
 * Service encapsulating account sync locking, status lifecycle, and email queue operations.
 * Shielding Server Actions from raw Prisma calls.
 */

export async function resetSyncLock(accountId: string): Promise<void> {
  await prisma.account.update({
    where: { id: accountId },
    data: {
      isSyncing: false,
      syncError: null,
      syncKind: null,
      syncTotal: null,
      lastSyncProcessed: 0,
      syncPendingTotal: null,
      lastSyncPendingProcessed: null,
      lastSyncedAt: new Date(),
    },
  });
}

export async function findAccountForSync(accountId: string) {
  return prisma.account.findUnique({
    where: { id: accountId },
    select: { id: true, isActive: true, isSyncing: true, updatedAt: true, persistentProfileId: true },
  });
}

export async function findAccountsForProfileCheck(
  targetAccountId: string,
  sessionAccountId: string
) {
  return Promise.all([
    prisma.account.findUnique({
      where: { id: targetAccountId },
      select: {
        id: true,
        isActive: true,
        isSyncing: true,
        updatedAt: true,
        persistentProfileId: true,
      },
    }),
    prisma.account.findUnique({
      where: { id: sessionAccountId },
      select: { persistentProfileId: true },
    }),
  ]);
}

export async function startSyncSession(
  accountId: string,
  runStartedAt: Date,
  syncKind: "inbox" | "queued"
): Promise<void> {
  await prisma.account.update({
    where: { id: accountId },
    data: {
      isSyncing: true,
      syncError: null,
      syncKind,
      lastSyncProcessed: 0,
      syncTotal: null,
      syncPendingTotal: null,
      lastSyncPendingProcessed: null,
      syncHeartbeatAt: runStartedAt,
    },
  });
}

export async function completeSyncSession(
  accountId: string,
  options: {
    errorMessage: string | null;
    runStartedAt: Date;
    createdCount: number;
    advanceLastSyncedAt: boolean;
  }
): Promise<void> {
  try {
    await prisma.account.update({
      where: { id: accountId },
      data: {
        isSyncing: false,
        ...(options.advanceLastSyncedAt ? { lastSyncedAt: options.runStartedAt } : {}),
        syncError: options.errorMessage,
        syncKind: null,
        lastSyncProcessed: options.errorMessage ? null : options.createdCount,
        syncTotal: null,
        syncPendingTotal: null,
        lastSyncPendingProcessed: null,
      },
    });
  } catch (finalizeError) {
    syncLog.error(
      { err: finalizeError },
      "Failed to clear isSyncing after inbox sync"
    );
    try {
      await prisma.account.update({
        where: { id: accountId },
        data: { isSyncing: false },
      });
    } catch (retryError) {
      syncLog.error({ err: retryError }, "Retry clear isSyncing also failed");
    }
  }
}

export async function completeDrainSession(
  accountId: string,
  options: {
    errorMessage: string | null;
    createdCount: number;
  }
): Promise<void> {
  try {
    await prisma.account.update({
      where: { id: accountId },
      data: {
        isSyncing: false,
        syncError: options.errorMessage,
        syncKind: null,
        lastSyncProcessed: options.errorMessage ? null : options.createdCount,
        syncTotal: null,
        syncPendingTotal: null,
        lastSyncPendingProcessed: null,
      },
    });
  } catch (finalizeError) {
    syncLog.error(
      { err: finalizeError },
      "Failed to clear isSyncing after Ace queue drain"
    );
    try {
      await prisma.account.update({
        where: { id: accountId },
        data: { isSyncing: false },
      });
    } catch (retryError) {
      syncLog.error({ err: retryError }, "Retry clear isSyncing also failed");
    }
  }
}

export async function flushPendingAiMessagesForAccount(
  accountId: string
): Promise<number> {
  const flushed = await prisma.emailMessage.updateMany({
    where: {
      accountId,
      emailCategory: "PENDING_AI",
      opportunities: { none: {} },
    },
    data: {
      emailCategory: "IRRELEVANT",
      rawBody: null,
    },
  });

  return flushed.count;
}
