import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { purgeExpiredDismissed } from "@/lib/opportunities/cleanup";
import { runOpportunitySync } from "@/lib/opportunity-sync";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return false;
  }

  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return false;
  }

  const provided = header.slice("Bearer ".length).trim();
  const expected = Buffer.from(secret);
  const actual = Buffer.from(provided);

  if (expected.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(expected, actual);
}

/**
 * Vercel Cron — incremental inbox opportunity sync for all active accounts.
 * Protect with Authorization: Bearer $CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const authorized = isAuthorized(req);

  if (!authorized) {
    console.warn("[Cron Sync] Unauthorized invocation attempt", {
      authHeader: authHeader ? "present" : "missing",
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[Cron Sync] Starting automated sync run…");

  try {
    const accounts = await prisma.account.findMany({
      where: {
        isActive: true,
        encryptedRefresh: { not: null },
      },
      select: {
        id: true,
        email: true,
        lastSyncedAt: true,
      },
    });

    if (accounts.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No accounts to sync",
        timestamp: new Date().toISOString(),
        report: [],
      });
    }

    const report: Array<{
      email: string;
      success: boolean;
      processed?: number;
      opportunitiesUpserted?: number;
      skipped?: number;
      error?: string;
    }> = [];

    for (const account of accounts) {
      try {
        console.log(`[Cron Sync] Syncing ${account.email}`);
        const result = await runOpportunitySync(account.id, {
          forceRescan: false,
          maxMessages: 25,
        });

        try {
          await purgeExpiredDismissed(account.id);
        } catch (purgeError) {
          console.error(
            `[Cron Sync] purge failed for ${account.email}`,
            purgeError
          );
        }

        await prisma.account.update({
          where: { id: account.id },
          data: {
            lastSyncedAt: new Date(),
            isSyncing: false,
            syncError: null,
            lastSyncProcessed: result.opportunitiesUpserted,
          },
        });

        report.push({
          email: account.email,
          success: true,
          processed: result.processed,
          opportunitiesUpserted: result.opportunitiesUpserted,
          skipped: result.skipped,
        });
      } catch (accErr) {
        const message =
          accErr instanceof Error ? accErr.message : "Unknown sync error";
        console.error(`[Cron Sync] Error syncing ${account.email}:`, message);
        report.push({
          email: account.email,
          success: false,
          error: message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      report,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Cron sync fatal error";
    console.error("[Cron Sync Fatal]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
