import { NextResponse } from "next/server";

import { SYNC_HEARTBEAT_STALE_MS } from "@/lib/constants";
import { getActiveAccount } from "@/lib/data";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Lightweight poll endpoint for GlobalSyncTracker.
 * Auto-heals when the worker heartbeat goes silent for SYNC_HEARTBEAT_STALE_MS.
 */
export async function GET() {
  try {
    const active = await getActiveAccount();
    if (!active) {
      return NextResponse.json(
        {
          isSyncing: false,
          lastSyncProcessed: null,
          syncError: null,
          wasStaleReset: false,
          pendingClassificationCount: 0,
        },
        { status: 401 }
      );
    }

    const [account, pendingClassificationCount] = await Promise.all([
      prisma.account.findUnique({
        where: { id: active.id },
        select: {
          id: true,
          isSyncing: true,
          lastSyncedAt: true,
          syncError: true,
          lastSyncProcessed: true,
          updatedAt: true,
          syncHeartbeatAt: true,
        },
      }),
      prisma.emailMessage.count({
        where: {
          accountId: active.id,
          emailCategory: "PENDING_AI",
        },
      }),
    ]);

    if (!account) {
      return NextResponse.json({
        isSyncing: false,
        lastSyncProcessed: null,
        syncError: null,
        wasStaleReset: false,
        pendingClassificationCount: 0,
      });
    }

    if (account.isSyncing) {
      const heartbeatAgeMs =
        Date.now() -
        (account.syncHeartbeatAt?.getTime() ?? account.updatedAt.getTime());

      if (heartbeatAgeMs > SYNC_HEARTBEAT_STALE_MS) {
        const syncError =
          "Background sync interrupted. Auto-reset complete.";
        console.warn(
          `[SyncLock:AutoReset] Clearing stale sync lock for ${account.id} (heartbeatAge=${Math.round(heartbeatAgeMs / 1000)}s)`
        );
        await prisma.account.update({
          where: { id: account.id },
          data: {
            isSyncing: false,
            syncError,
          },
        });
        return NextResponse.json({
          isSyncing: false,
          lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
          syncError,
          lastSyncProcessed: account.lastSyncProcessed,
          wasStaleReset: true,
          pendingClassificationCount,
        });
      }
    }

    return NextResponse.json({
      isSyncing: account.isSyncing,
      lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
      syncError: account.syncError,
      lastSyncProcessed: account.lastSyncProcessed,
      wasStaleReset: false,
      pendingClassificationCount,
    });
  } catch (error) {
    console.error("GET /api/account/sync-status failed", error);
    return NextResponse.json({
      isSyncing: false,
      lastSyncProcessed: null,
      syncError: null,
      wasStaleReset: false,
      pendingClassificationCount: 0,
    });
  }
}
