import { NextResponse } from "next/server";
import { z } from "zod";

import { getActiveAccount } from "@/lib/data";
import {
  getGmailClientForAccount,
  InsufficientScopeError,
  REAUTH_REQUIRED_MESSAGE,
} from "@/lib/gmail/google";
import { prisma } from "@/lib/core/prisma";
import { MAX_BRIEFING_DAYS } from "@/lib/subscriptions/digest-constants";
import { createSubscriptionBriefing } from "@/lib/subscriptions/digest";
import { subscriptionDigestCreateSchema } from "@/lib/validations/subscriptions.schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseYmd(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
}

/**
 * POST /api/subscriptions/digest
 * Builds a branded briefing for a date range, sends it, trashes originals, updates Neon stats.
 */
export async function POST(req: Request) {
  try {
    const active = await getActiveAccount();
    if (!active) {
      return NextResponse.json(
        { success: false, error: "Sign in with a linked Gmail account" },
        { status: 401 }
      );
    }

    const account = await prisma.account.findUnique({
      where: { id: active.id },
    });
    if (!account?.isActive || !account.encryptedAccess) {
      return NextResponse.json(
        { success: false, error: "Account credentials are not linked" },
        { status: 401 }
      );
    }

    const json: unknown = await req.json();
    const parsed = subscriptionDigestCreateSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid payload (max ${MAX_BRIEFING_DAYS} days)`,
        },
        { status: 400 }
      );
    }

    const rangeStart = parseYmd(parsed.data.startDate);
    const rangeEnd = parseYmd(parsed.data.endDate);

    const gmail = await getGmailClientForAccount(account);
    const result = await createSubscriptionBriefing({
      gmail,
      accountId: account.id,
      senderEmails: parsed.data.senderEmails,
      rangeStart,
      rangeEnd,
      recipientEmail: account.email,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/subscriptions/digest failed", error);
    if (error instanceof InsufficientScopeError) {
      return NextResponse.json(
        { success: false, error: REAUTH_REQUIRED_MESSAGE },
        { status: 403 }
      );
    }
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create snapshot";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
