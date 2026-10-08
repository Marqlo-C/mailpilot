import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import { logStory, syncLog } from "@/lib/logging";
import { purgeExpiredDismissed } from "@/lib/opportunities/cleanup";
import { runOpportunitySync } from "@/lib/opportunity-sync";
import { prisma } from "@/lib/prisma";

/** Hobby-friendly ceiling so multi-account runs stay under the platform limit. */
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return false;
  }

  const header = request.headers.get("authorization");
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
 * GitHub Actions (or other) cron ping — sequential inbox sync for all
 * accounts with active Google refresh tokens. Caps each cycle at 10 emails
 * to stay under the 60s Hobby timeout.
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const accounts = await prisma.account.findMany({
      where: {
        isActive: true,
        encryptedRefresh: { not: null },
      },
      select: {
        id: true,
        email: true,
      },
    });

    if (accounts.length === 0) {
      return NextResponse.json({
        message: "No active accounts to sync",
        processed: 0,
      });
    }

    const results: Array<{
      account: string;
      status: "ok" | "failed";
      syncResult?: {
        processed: number;
        opportunitiesUpserted: number;
        skipped: number;
        historyExpired: boolean;
      };
      error?: string;
    }> = [];

    // Sequential to stay under memory / duration limits on Hobby.
    // Same delta-first pipeline as Sync Inbox; stamp lastSyncedAt with runStartedAt.
    for (const account of accounts) {
      const runStartedAt = new Date();
      try {
        await prisma.account.update({
          where: { id: account.id },
          data: {
            isSyncing: true,
            syncError: null,
            syncHeartbeatAt: runStartedAt,
          },
        });

        const syncResult = await runOpportunitySync(account.id, {
          forceRescan: false,
          maxMessages: 10,
        });

        try {
          const purge = await purgeExpiredDismissed(account.id);
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
          console.error(
            `Cron sync purge failed for ${account.email}:`,
            purgeError
          );
        }

        await prisma.account.update({
          where: { id: account.id },
          data: {
            lastSyncedAt: runStartedAt,
            isSyncing: false,
            syncError: null,
            lastSyncProcessed: syncResult.opportunitiesUpserted,
          },
        });

        results.push({
          account: account.email,
          status: "ok",
          syncResult,
        });
      } catch (err) {
        console.error(`Cron sync failed for account ${account.email}:`, err);
        try {
          await prisma.account.update({
            where: { id: account.id },
            data: {
              isSyncing: false,
              syncError:
                err instanceof Error ? err.message : "Unknown error",
            },
          });
        } catch {
          /* ignore finalize failure */
        }
        results.push({
          account: account.email,
          status: "failed",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (error) {
    console.error("Cron handler encountered fatal error:", error);
    return NextResponse.json(
      { error: "Internal server error during multi-account sync" },
      { status: 500 }
    );
  }
}
