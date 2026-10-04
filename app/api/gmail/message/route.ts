import { NextResponse } from "next/server";
import { z } from "zod";

import { getActiveAccount } from "@/lib/data";
import {
  fetchGmailMessagePreview,
  findLatestMessageIdFromSender,
} from "@/lib/gmail/message";
import {
  getGmailClientForAccount,
  InsufficientScopeError,
  REAUTH_REQUIRED_MESSAGE,
} from "@/lib/google";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z
  .object({
    id: z.string().min(1).optional(),
    from: z.string().email().optional(),
  })
  .refine((v) => Boolean(v.id || v.from), {
    message: "Provide id or from",
  });

/**
 * GET /api/gmail/message?id=<messageId>
 * GET /api/gmail/message?from=<senderEmail>  (latest message from sender)
 */
export async function GET(req: Request) {
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

    const url = new URL(req.url);
    const parsed = querySchema.safeParse({
      id: url.searchParams.get("id") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Provide a valid id or from query param" },
        { status: 400 }
      );
    }

    const gmail = await getGmailClientForAccount(account);
    let messageId = parsed.data.id ?? null;
    if (!messageId && parsed.data.from) {
      messageId = await findLatestMessageIdFromSender(
        gmail,
        parsed.data.from
      );
    }
    if (!messageId) {
      return NextResponse.json(
        { success: false, error: "No message found for this sender" },
        { status: 404 }
      );
    }

    const preview = await fetchGmailMessagePreview(gmail, messageId);
    return NextResponse.json({ success: true, ...preview });
  } catch (error) {
    console.error("GET /api/gmail/message failed", error);
    if (error instanceof InsufficientScopeError) {
      return NextResponse.json(
        { success: false, error: REAUTH_REQUIRED_MESSAGE },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Failed to load message" },
      { status: 500 }
    );
  }
}
