import { NextResponse } from "next/server";

import { getActiveAccount } from "@/lib/data";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const STALE_THRESHOLD_MS = 90 * 1000;

/**
 * Lightweight poll endpoint for GlobalSyncTracker.
 * Auto-heals stale isSyncing locks older than 90 seconds.
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
        },
        { status: 401 }
      );
    }

    const account = await prisma.account.findUnique({
      where: { id: active.id },
      select: {
        id: true,
        isSyncing: true,
        lastSyncedAt: true,
        syncError: true,
        lastSyncProcessed: true,
        updatedAt: true,
      },
    });

    if (!account) {
      return NextResponse.json({
        isSyncing: false,
        lastSyncProcessed: null,
        syncError: null,
        wasStaleReset: false,
      });
    }

    if (account.isSyncing) {
      const lockAgeMs = Date.now() - account.updatedAt.getTime();
      if (lockAgeMs > STALE_THRESHOLD_MS) {
        console.warn(
          `Detected stale sync lock for ${account.id} (age=${Math.round(lockAgeMs / 1000)}s). Auto-resetting.`
        );
        await prisma.account.update({
          where: { id: account.id },
          data: {
            isSyncing: false,
            syncError: "Previous sync timed out",
            lastSyncedAt: new Date(),
          },
        });
        return NextResponse.json({
          isSyncing: false,
          lastSyncedAt: new Date().toISOString(),
          syncError: "Previous sync timed out",
          lastSyncProcessed: null,
          wasStaleReset: true,
        });
      }
    }

    return NextResponse.json({
      isSyncing: account.isSyncing,
      lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
      syncError: account.syncError,
      lastSyncProcessed: account.lastSyncProcessed,
      wasStaleReset: false,
    });
  } catch (error) {
    console.error("GET /api/account/sync-status failed", error);
    return NextResponse.json({
      isSyncing: false,
      lastSyncProcessed: null,
      syncError: null,
      wasStaleReset: false,
    });
  }
}
