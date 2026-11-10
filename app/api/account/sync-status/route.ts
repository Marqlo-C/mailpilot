import { NextResponse } from "next/server";

import { SYNC_HEARTBEAT_STALE_MS } from "@/lib/core/constants";
import { getActiveAccount } from "@/lib/data";
import { syncLockLog } from "@/lib/logging";
import { parseSyncKind } from "@/lib/opportunities/sync/kinds";
import { prisma } from "@/lib/core/prisma";
import { parseAccountRules } from "@/lib/validations/rules.schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
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
          syncKind: null,
          syncPendingTotal: null,
          lastSyncPendingProcessed: null,
          opportunitiesAdded: null,
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
          syncTotal: true,
          syncKind: true,
          syncPendingTotal: true,
          lastSyncPendingProcessed: true,
          updatedAt: true,
          syncHeartbeatAt: true,
          settings: {
            select: {
              rules: true,
            },
          },
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
        syncTotal: null,
        syncError: null,
        wasStaleReset: false,
        pendingClassificationCount: 0,
        syncKind: null,
        syncPendingTotal: null,
        lastSyncPendingProcessed: null,
        opportunitiesAdded: null,
      });
    }

    if (account.isSyncing) {
      const heartbeatAgeMs =
        Date.now() -
        (account.syncHeartbeatAt?.getTime() ?? account.updatedAt.getTime());

      if (heartbeatAgeMs > SYNC_HEARTBEAT_STALE_MS) {
        const syncError =
          "Background sync interrupted. Auto-reset complete.";
        syncLockLog.warn(
          {
            accountId: account.id,
            heartbeatAgeSec: Math.round(heartbeatAgeMs / 1000),
          },
          "Clearing stale sync lock (heartbeat silent too long)"
        );
        await prisma.account.update({
          where: { id: account.id },
          data: {
            isSyncing: false,
            syncError,
            syncKind: null,
            syncTotal: null,
            syncPendingTotal: null,
            lastSyncPendingProcessed: null,
          },
        });
        return NextResponse.json({
          isSyncing: false,
          lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
          syncError,
          lastSyncProcessed: account.lastSyncProcessed,
          syncTotal: null,
          wasStaleReset: true,
          pendingClassificationCount,
          syncKind: null,
          syncPendingTotal: null,
          lastSyncPendingProcessed: null,
          opportunitiesAdded: null,
        });
      }
    }

    const rules = parseAccountRules(account.settings?.rules);
    const opportunitiesAdded =
      account.isSyncing
        ? null
        : typeof rules.lastSyncCreatedCount === "number"
          ? rules.lastSyncCreatedCount
          : typeof account.lastSyncProcessed === "number"
            ? account.lastSyncProcessed
            : 0;

    return NextResponse.json({
      isSyncing: account.isSyncing,
      lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
      syncError: account.syncError,
      lastSyncProcessed: account.lastSyncProcessed,
      syncTotal: account.syncTotal ?? null,
      wasStaleReset: false,
      pendingClassificationCount,
      syncKind: parseSyncKind(account.syncKind),
      syncPendingTotal: account.syncPendingTotal ?? null,
      lastSyncPendingProcessed: account.lastSyncPendingProcessed ?? null,
      opportunitiesAdded,
    });
  } catch (error) {
    console.error("GET /api/account/sync-status failed", error);
    return NextResponse.json({
      isSyncing: false,
      lastSyncProcessed: null,
      syncError: null,
      wasStaleReset: false,
      pendingClassificationCount: 0,
      syncKind: null,
      syncPendingTotal: null,
      lastSyncPendingProcessed: null,
      opportunitiesAdded: null,
    });
  }
}
