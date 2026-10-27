import type { gmail_v1 } from "googleapis";

import { prisma } from "@/lib/core/prisma";
import { getGmailClientForAccount } from "@/lib/gmail/google";

/** Gmail `internalDate` is epoch milliseconds. */
export function dateFromGmailInternalDate(
  internalDate: string | null | undefined
): Date | null {
  if (!internalDate) return null;
  const ms = Number(internalDate);
  // Reject second-precision values so a bad parse cannot land in 1970.
  if (!Number.isFinite(ms) || ms < 1_000_000_000_000) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Move last-received forward only. Older messages processed later must not
 * rewind a newer sighting.
 */
export async function advanceSubscriptionLastReceived(
  accountId: string,
  senderEmail: string,
  receivedAt: Date
): Promise<void> {
  if (Number.isNaN(receivedAt.getTime())) return;

  await prisma.subscription.updateMany({
    where: {
      accountId,
      senderEmail,
      OR: [{ lastReceivedAt: null }, { lastReceivedAt: { lt: receivedAt } }],
    },
    data: { lastReceivedAt: receivedAt },
  });
}

const REFRESH_COOLDOWN_MS = 10 * 60 * 1000;
const REFRESH_LIMIT = 80;
const REFRESH_CONCURRENCY = 6;
const refreshedAtByAccount = new Map<string, number>();

/**
 * Newest unsubscribe mail in the mailbox, not only INBOX history.
 * A daily sender can otherwise keep the stamp of whichever older message
 * was written last.
 */
export async function refreshStaleSubscriptionDates(
  accountId: string
): Promise<void> {
  const last = refreshedAtByAccount.get(accountId);
  if (last !== undefined && Date.now() - last < REFRESH_COOLDOWN_MS) return;

  const known = await prisma.subscription.findMany({
    where: { accountId },
    select: { senderEmail: true },
  });
  if (known.length === 0) return;

  const knownEmails = new Map(
    known.map((row) => [
      row.senderEmail.trim().toLowerCase(),
      row.senderEmail,
    ])
  );

  refreshedAtByAccount.set(accountId, Date.now());

  try {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });
    if (!account?.isActive || !account.encryptedAccess) return;

    const gmail = await getGmailClientForAccount(account);
    const listed = await gmail.users.messages.list({
      userId: "me",
      q: "newer_than:45d unsubscribe",
      maxResults: REFRESH_LIMIT,
    });
    const ids = (listed.data.messages ?? [])
      .map((message) => message.id)
      .filter((id): id is string => Boolean(id));

    const newestBySender = new Map<string, Date>();
    await mapPool(ids, REFRESH_CONCURRENCY, async (messageId) => {
      const message = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "metadata",
        metadataHeaders: ["From"],
      });
      const from = message.data.payload?.headers?.find(
        (header) => header.name?.toLowerCase() === "from"
      )?.value;
      const email = from ? senderEmailFromHeader(from) : null;
      const storedEmail = email ? knownEmails.get(email) : undefined;
      const receivedAt = dateFromGmailInternalDate(message.data.internalDate);
      if (!storedEmail || !receivedAt) return;
      const prev = newestBySender.get(storedEmail);
      if (!prev || receivedAt > prev) {
        newestBySender.set(storedEmail, receivedAt);
      }
    });

    await Promise.all(
      [...newestBySender].map(([email, receivedAt]) =>
        advanceSubscriptionLastReceived(accountId, email, receivedAt)
      )
    );
  } catch (error) {
    refreshedAtByAccount.delete(accountId);
    throw error;
  }
}

function senderEmailFromHeader(from: string): string | null {
  const angle = from.match(/<([^>]+)>/);
  const email = (angle?.[1] ?? from).trim().toLowerCase();
  return email.includes("@") ? email : null;
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  let index = 0;

  async function run(): Promise<void> {
    while (index < items.length) {
      const current = index;
      index += 1;
      const item = items[current];
      if (item === undefined) return;
      try {
        await worker(item);
      } catch (error) {
        console.error("Subscription last-received refresh failed", error);
      }
    }
  }

  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => run()
  );
  await Promise.all(runners);
}
