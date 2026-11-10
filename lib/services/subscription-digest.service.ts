import { prisma } from "@/lib/core/prisma";
import { ensurePersistentProfileForAccount } from "@/lib/profile/persistent-profile";

/**
 * Service encapsulating subscription lookups, status transitions, and archive deletion.
 * Isolates Prisma persistence from Server Actions.
 */

export async function findSubscriptionWithAccount(subscriptionId: string) {
  return prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { account: true },
  });
}

export async function updateSubscriptionStatus(
  subscriptionId: string,
  status: string,
  lastError: string | null
): Promise<void> {
  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      status,
      lastError,
    },
  });
}

export async function getSubscriptionSenderContext(
  accountId: string,
  normalizedSender: string
) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
  });
  if (!account) return null;

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

  return { account, subscription, profile, history };
}

export async function deleteArchivedSubscription(
  accountId: string,
  normalizedSender: string
): Promise<{ ok: boolean; error?: string }> {
  const context = await getSubscriptionSenderContext(accountId, normalizedSender);
  if (!context) {
    return { ok: false, error: "Account not found" };
  }

  const { subscription, history } = context;

  if (subscription && subscription.status !== "UNSUBSCRIBED") {
    return {
      ok: false,
      error: "Only unsubscribed records can be deleted from the archive.",
    };
  }

  if (!subscription && !history) {
    return { ok: false, error: "Record not found" };
  }

  if (history && history.status !== "UNSUBSCRIBED") {
    return {
      ok: false,
      error: "Only unsubscribed records can be deleted from the archive.",
    };
  }

  await prisma.$transaction(async (tx) => {
    if (subscription?.status === "UNSUBSCRIBED") {
      await tx.subscription.delete({ where: { id: subscription.id } });
    }
    if (history?.status === "UNSUBSCRIBED") {
      await tx.subscriptionHistory.delete({ where: { id: history.id } });
    }
  });

  return { ok: true };
}
