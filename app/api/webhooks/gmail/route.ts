import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";

import { processInboxDelta } from "@/lib/sync";

export const runtime = "nodejs";

const pubSubBodySchema = z.object({
  message: z
    .object({
      data: z.string().optional(),
      messageId: z.string().optional(),
      publishTime: z.string().optional(),
    })
    .optional(),
  subscription: z.string().optional(),
});

const gmailNotificationSchema = z.object({
  emailAddress: z.string().email(),
  historyId: z.union([z.string(), z.number()]).transform(String),
});

function isValidWebhookToken(provided: string | null): boolean {
  const expected = process.env.GMAIL_WEBHOOK_SECRET;
  if (!expected || !provided) {
    return false;
  }

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);

  if (expectedBuf.length !== providedBuf.length) {
    return false;
  }

  return timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * Google Pub/Sub push endpoint for Gmail watch notifications.
 * Authenticates via ?token=, acknowledges immediately with 200,
 * and processes the inbox delta in after().
 *
 * Advances `historyId` only — `lastSyncedAt` is owned by Sync Inbox
 * (see README "Inbox sync pipeline").
 */
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!isValidWebhookToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    // Acknowledge malformed bodies so Pub/Sub does not retry forever
    return NextResponse.json({ status: "ignored" }, { status: 200 });
  }

  const parsedBody = pubSubBodySchema.safeParse(json);
  const rawData = parsedBody.success
    ? parsedBody.data.message?.data
    : undefined;

  if (!rawData) {
    return NextResponse.json({ status: "ignored" }, { status: 200 });
  }

  let notification: z.infer<typeof gmailNotificationSchema>;
  try {
    const decoded = JSON.parse(
      Buffer.from(rawData, "base64").toString("utf-8")
    ) as unknown;
    notification = gmailNotificationSchema.parse(decoded);
  } catch (error) {
    console.error("Invalid Gmail Pub/Sub notification payload", error);
    return NextResponse.json({ status: "ignored" }, { status: 200 });
  }

  const { emailAddress, historyId } = notification;

  after(async () => {
    try {
      await processInboxDelta(emailAddress, historyId);
    } catch (error) {
      console.error(
        `processInboxDelta failed for ${emailAddress} (historyId=${historyId})`,
        error
      );
    }
  });

  return NextResponse.json({ status: "ok" }, { status: 200 });
}
