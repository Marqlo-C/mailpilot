"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getGmailClientForAccount } from "@/lib/google";
import {
  InsufficientScopeError,
  REAUTH_REQUIRED_MESSAGE,
  isInsufficientScopeError,
} from "@/lib/google";
import {
  ensurePersistentProfileForAccount,
  recordSubscriptionHistory,
} from "@/lib/persistent-profile";
import { prisma } from "@/lib/prisma";
import {
  cleanupSenderMessages,
  executeUnsubscribe,
  type CleanupAction,
} from "@/lib/unsubscribe";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const cleanupActionSchema = z.enum(["NONE", "TRASH", "ARCHIVE"]);

/**
 * Runs the unsubscribe chain for a stored subscription and optional cleanup.
 */
export async function unsubscribeSender(
  subscriptionId: string,
  cleanupAction: CleanupAction
): Promise<ActionResult<{ method: string; cleaned?: number }>> {
  const parsedCleanup = cleanupActionSchema.safeParse(cleanupAction);
  if (!parsedCleanup.success) {
    return { ok: false, error: "Invalid cleanup action" };
  }

  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { account: true },
  });

  if (!subscription) {
    return { ok: false, error: "Subscription not found" };
  }

  if (!subscription.account.isActive || !subscription.account.encryptedAccess) {
    return { ok: false, error: "Account credentials are not linked" };
  }

  try {
    const gmail = await getGmailClientForAccount(subscription.account);
    const result = await executeUnsubscribe(
      gmail,
      subscription,
      parsedCleanup.data
    );

    const unsubOk = result.unsub.ok;
    const cleanupRequested = parsedCleanup.data !== "NONE";
    const cleanupOk = !cleanupRequested || result.cleanupOk;

    // Decoupled status: FAILED only when both sides fail (or unsub fails with no cleanup).
    const bothFailed = !unsubOk && !cleanupOk;
    const status = bothFailed ? "FAILED" : "UNSUBSCRIBED";
    const lastError = bothFailed
      ? [result.unsub.detail, result.cleanupError].filter(Boolean).join(" | ") ||
        "Unsubscribe failed"
      : !unsubOk
        ? result.unsub.detail ?? "Unsubscribe link rejected (messages still cleaned)"
        : !cleanupOk
          ? result.cleanupError
          : null;

    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status,
        lastError,
      },
    });

    if (status === "UNSUBSCRIBED") {
      const profile = await ensurePersistentProfileForAccount(
        subscription.account
      );
      await recordSubscriptionHistory({
        userProfileId: profile.id,
        senderEmail: subscription.senderEmail,
        senderName: subscription.senderName,
        status: "UNSUBSCRIBED",
      });
    }

    revalidatePath("/subscriptions");
    revalidatePath("/");

    if (bothFailed) {
      return {
        ok: false,
        error: lastError ?? "Unsubscribe request failed",
      };
    }

    return {
      ok: true,
      data: {
        method: result.unsub.usedGetFallback
          ? `${result.unsub.method}_FALLBACK`
          : result.unsub.method,
        cleaned: result.cleanedCount,
      },
    };
  } catch (error) {
    console.error("unsubscribeSender failed", error);

    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: "FAILED",
        lastError:
          error instanceof Error ? error.message : "Unsubscribe failed",
      },
    });

    if (
      error instanceof InsufficientScopeError ||
      isInsufficientScopeError(error)
    ) {
      return { ok: false, error: REAUTH_REQUIRED_MESSAGE };
    }

    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unsubscribe failed",
    };
  }
}

/**
 * Second-chance cleanup: trash past emails from an already-unsubscribed sender.
 * Uses gmail.modify-compatible trash (batchModify TRASH label), not permanent batchDelete.
 */
export async function batchCleanupSender(
  accountId: string,
  senderEmail: string
): Promise<ActionResult<{ cleaned: number }>> {
  const parsed = z
    .object({
      accountId: z.string().min(1),
      senderEmail: z.string().email().or(z.string().min(3)),
    })
    .safeParse({ accountId, senderEmail });

  if (!parsed.success) {
    return { ok: false, error: "Invalid account or sender email" };
  }

  const account = await prisma.account.findUnique({
    where: { id: parsed.data.accountId },
  });

  if (!account || !account.isActive || !account.encryptedAccess) {
    return { ok: false, error: "Account credentials are not linked" };
  }

  const normalizedSender = parsed.data.senderEmail.toLowerCase();

  const subscription = await prisma.subscription.findUnique({
    where: {
      accountId_senderEmail: {
        accountId: account.id,
        senderEmail: normalizedSender,
      },
    },
  });

  const profile = await ensurePersistentProfileForAccount(account);
  const history = await prisma.subscriptionHistory.findUnique({
    where: {
      userProfileId_senderEmail: {
        userProfileId: profile.id,
        senderEmail: normalizedSender,
      },
    },
  });

  const isArchived =
    subscription?.status === "UNSUBSCRIBED" ||
    history?.status === "UNSUBSCRIBED";

  if (!isArchived) {
    return {
      ok: false,
      error:
        "Sender is not in the Unsubscribed Archive. Unsubscribe first, then use second-chance cleanup.",
    };
  }

  try {
    const gmail = await getGmailClientForAccount(account);
    const cleaned = await cleanupSenderMessages(
      gmail,
      normalizedSender,
      "TRASH"
    );

    await recordSubscriptionHistory({
      userProfileId: profile.id,
      senderEmail: normalizedSender,
      senderName: subscription?.senderName ?? history?.senderName,
      status: "UNSUBSCRIBED",
    });

    revalidatePath("/subscriptions");
    return { ok: true, data: { cleaned } };
  } catch (error) {
    console.error("batchCleanupSender failed", error);
    if (
      error instanceof InsufficientScopeError ||
      isInsufficientScopeError(error)
    ) {
      return { ok: false, error: REAUTH_REQUIRED_MESSAGE };
    }
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Batch cleanup failed",
    };
  }
}

/**
 * Permanently removes an unsubscribed sender from Subscription + SubscriptionHistory
 * so it no longer appears on the Unsubscribed tab. Does not touch Gmail mail.
 */
export async function deleteUnsubscribedRecord(
  accountId: string,
  senderEmail: string
): Promise<ActionResult> {
  const parsed = z
    .object({
      accountId: z.string().min(1),
      senderEmail: z.string().email().or(z.string().min(3)),
    })
    .safeParse({ accountId, senderEmail });

  if (!parsed.success) {
    return { ok: false, error: "Invalid account or sender email" };
  }

  const account = await prisma.account.findUnique({
    where: { id: parsed.data.accountId },
  });

  if (!account) {
    return { ok: false, error: "Account not found" };
  }

  const normalizedSender = parsed.data.senderEmail.toLowerCase();

  const subscription = await prisma.subscription.findUnique({
    where: {
      accountId_senderEmail: {
        accountId: account.id,
        senderEmail: normalizedSender,
      },
    },
  });

  if (subscription && subscription.status !== "UNSUBSCRIBED") {
    return {
      ok: false,
      error: "Only unsubscribed records can be deleted from the archive.",
    };
  }

  const profile = await ensurePersistentProfileForAccount(account);
  const history = await prisma.subscriptionHistory.findUnique({
    where: {
      userProfileId_senderEmail: {
        userProfileId: profile.id,
        senderEmail: normalizedSender,
      },
    },
  });

  if (!subscription && !history) {
    return { ok: false, error: "Record not found" };
  }

  if (history && history.status !== "UNSUBSCRIBED") {
    return {
      ok: false,
      error: "Only unsubscribed records can be deleted from the archive.",
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (subscription?.status === "UNSUBSCRIBED") {
        await tx.subscription.delete({ where: { id: subscription.id } });
      }
      if (history?.status === "UNSUBSCRIBED") {
        await tx.subscriptionHistory.delete({ where: { id: history.id } });
      }
    });

    revalidatePath("/subscriptions");
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    console.error("deleteUnsubscribedRecord failed", error);
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to delete record",
    };
  }
}
