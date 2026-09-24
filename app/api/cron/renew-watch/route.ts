import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { renewWatchForAccount } from "@/lib/google";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }

  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return false;
  }

  const provided = header.slice("Bearer ".length);
  const expected = Buffer.from(secret);
  const actual = Buffer.from(provided);

  if (expected.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(expected, actual);
}

/**
 * Vercel Cron handler — renews Gmail watch() on all active accounts.
 * Protect with Authorization: Bearer $CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accounts = await prisma.account.findMany({
    where: { isActive: true },
  });

  const results: Array<{
    accountId: string;
    email: string;
    ok: boolean;
    historyId?: string;
    error?: string;
  }> = [];

  for (const account of accounts) {
    try {
      const watch = await renewWatchForAccount(account);
      results.push({
        accountId: account.id,
        email: account.email,
        ok: true,
        historyId: watch.historyId,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown watch renewal error";
      console.error(`Watch renewal failed for ${account.email}`, error);
      results.push({
        accountId: account.id,
        email: account.email,
        ok: false,
        error: message,
      });
    }
  }

  const renewed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  return NextResponse.json({
    status: "ok",
    renewed,
    failed,
    results,
  });
}
