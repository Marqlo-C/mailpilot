"use server";

import { revalidatePath } from "next/cache";

import { getGmailClientForAccount } from "@/lib/google";
import {
  REAUTH_REQUIRED_MESSAGE,
  isInsufficientScopeError,
} from "@/lib/google";
import { prisma } from "@/lib/prisma";
import { parseAccountRules } from "@/lib/validations/rules";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/**
 * Batch-trashes all Gmail messages tagged with the account's rejection label,
 * and marks matching JobApplication rows as trashed.
 */
export async function emptyRejections(
  accountId: string
): Promise<ActionResult<{ trashed: number }>> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { settings: true },
  });

  if (!account || !account.isActive) {
    return { ok: false, error: "Account not found or inactive" };
  }

  const rules = parseAccountRules(account.settings?.rules);
  const labelId = rules.rejectionLabelId;

  if (!labelId) {
    return {
      ok: false,
      error: "Rejection label is not configured for this account",
    };
  }

  try {
    const gmail = await getGmailClientForAccount(account);
    const messageIds: string[] = [];
    let pageToken: string | undefined;

    do {
      const listed = await gmail.users.messages.list({
        userId: "me",
        labelIds: [labelId],
        maxResults: 500,
        pageToken,
      });

      for (const message of listed.data.messages ?? []) {
        if (message.id) {
          messageIds.push(message.id);
        }
      }

      pageToken = listed.data.nextPageToken ?? undefined;
    } while (pageToken);

    // Also include DB-tracked rejections that may still be in Inbox (AUTO_TRASH off)
    const dbRejections = await prisma.jobApplication.findMany({
      where: {
        accountId,
        status: "REJECTION",
        isTrashed: false,
      },
      select: { messageId: true },
    });

    for (const row of dbRejections) {
      if (!messageIds.includes(row.messageId)) {
        messageIds.push(row.messageId);
      }
    }

    if (messageIds.length === 0) {
      return { ok: true, data: { trashed: 0 } };
    }

    const chunks = chunkArray(messageIds, 1000);
    for (const chunk of chunks) {
      await gmail.users.messages.batchModify({
        userId: "me",
        requestBody: {
          ids: chunk,
          addLabelIds: ["TRASH"],
          removeLabelIds: ["INBOX"],
        },
      });
    }

    await prisma.jobApplication.updateMany({
      where: {
        accountId,
        messageId: { in: messageIds },
      },
      data: {
        isTrashed: true,
        isArchived: true,
      },
    });

    revalidatePath("/jobs");
    revalidatePath("/");

    return { ok: true, data: { trashed: messageIds.length } };
  } catch (error) {
    console.error("emptyRejections failed", error);
    if (isInsufficientScopeError(error)) {
      return { ok: false, error: REAUTH_REQUIRED_MESSAGE };
    }
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to trash rejections",
    };
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
