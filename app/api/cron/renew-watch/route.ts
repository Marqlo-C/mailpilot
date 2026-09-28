import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import { renewWatchForAccount } from "@/lib/google";
import { prisma } from "@/lib/prisma";

/** Daily watch renewal — keep well under Hobby limits. */
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
 * Vercel Cron — renews Gmail users.watch() for every account with
 * active Google credentials. Protect with Authorization: Bearer $CRON_SECRET.
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
    });

    if (accounts.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No active accounts to renew",
        renewed: 0,
        failed: 0,
        results: [],
      });
    }

    const results: Array<{
      email: string;
      status: "renewed" | "failed";
      historyId?: string;
      expiration?: string | null;
      error?: string;
    }> = [];

    for (const account of accounts) {
      try {
        const watch = await renewWatchForAccount(account);
        results.push({
          email: account.email,
          status: "renewed",
          historyId: watch.historyId,
          expiration: watch.expiration ?? null,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown watch renewal error";
        console.error(`Failed to renew watch for ${account.email}:`, err);
        results.push({
          email: account.email,
          status: "failed",
          error: message,
        });
      }
    }

    const renewed = results.filter((r) => r.status === "renewed").length;
    const failed = results.filter((r) => r.status === "failed").length;

    return NextResponse.json({
      success: true,
      count: results.length,
      renewed,
      failed,
      results,
    });
  } catch (error) {
    console.error("[CRON_RENEW_WATCH_ERROR]", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Internal renew-watch error",
      },
      { status: 500 }
    );
  }
}
