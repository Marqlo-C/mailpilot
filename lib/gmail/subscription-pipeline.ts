import { prisma } from "@/lib/core/prisma";
import {
  advanceSubscriptionLastReceived,
  dateFromGmailInternalDate,
} from "@/lib/subscriptions/last-received";
import { parseListUnsubscribeHeaders } from "@/lib/gmail/unsubscribe";

export type SenderInfo = {
  name: string | null;
  email: string;
};

/**
 * Parses `Name <email@domain>` / bare email From headers.
 */
export function parseFromHeader(from: string): SenderInfo | null {
  const angle = from.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (angle) {
    const rawName = angle[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
    const email = angle[2]?.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return null;
    }
    return { name: rawName.length > 0 ? rawName : null, email };
  }

  const bare = from.trim().toLowerCase();
  if (!bare.includes("@")) {
    return null;
  }

  return { name: null, email: bare };
}

export async function maybeUpsertSubscription(input: {
  accountId: string;
  from: string;
  listUnsubscribe: string | undefined;
  listUnsubscribePost: string | undefined;
  internalDate: string | null | undefined;
}): Promise<void> {
  if (!input.listUnsubscribe) {
    return;
  }

  const sender = parseFromHeader(input.from);
  if (!sender) {
    return;
  }

  const targets = parseListUnsubscribeHeaders(
    input.listUnsubscribe,
    input.listUnsubscribePost
  );

  if (!targets.unsubHttpUrl && !targets.unsubPostUrl && !targets.unsubMailto) {
    return;
  }

  const receivedAt =
    dateFromGmailInternalDate(input.internalDate) ?? new Date();

  await prisma.subscription.upsert({
    where: {
      accountId_senderEmail: {
        accountId: input.accountId,
        senderEmail: sender.email,
      },
    },
    create: {
      accountId: input.accountId,
      senderName: sender.name,
      senderEmail: sender.email,
      unsubHttpUrl: targets.unsubHttpUrl,
      unsubPostUrl: targets.unsubPostUrl,
      unsubPostBody: targets.unsubPostBody,
      unsubMailto: targets.unsubMailto,
      status: "ACTIVE",
      emailCount: 1,
      lastReceivedAt: receivedAt,
    },
    update: {
      senderName: sender.name ?? undefined,
      unsubHttpUrl: targets.unsubHttpUrl ?? undefined,
      unsubPostUrl: targets.unsubPostUrl ?? undefined,
      unsubPostBody: targets.unsubPostBody ?? undefined,
      unsubMailto: targets.unsubMailto ?? undefined,
      emailCount: { increment: 1 },
    },
  });

  await advanceSubscriptionLastReceived(
    input.accountId,
    sender.email,
    receivedAt
  );
}
