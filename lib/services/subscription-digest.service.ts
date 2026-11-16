import { prisma } from "@/lib/core/prisma";
import { ensurePersistentProfileForAccount } from "@/lib/profile/persistent-profile";

/**
 * Service encapsulating subscription lookups, status transitions, and archive deletion.
 * Isolates Prisma persistence from Server Actions.
 */

/**
 * Retrieves a single Subscription record by ID including its parent Account relation.
 *
 * @param subscriptionId - Target subscription database ID
 * @returns Subscription with included account relation, or null if not found
 */
export async function findSubscriptionWithAccount(subscriptionId: string) {
  return prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { account: true },
  });
}

/**
 * Updates the status and optional error trace of an active newsletter/marketing subscription.
 *
 * @param subscriptionId - Target subscription database ID
 * @param status - Updated subscription status string (e.g. UNSUBSCRIBED, ACTIVE, FAILED)
 * @param lastError - Optional diagnostic error message from the unsubscribe attempt
 * @returns Resolves when database update completes
 */
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

/**
 * Loads composite subscription context for a given sender, looking up both the active account subscription
 * and the durable permanent profile SubscriptionHistory record.
 *
 * @param accountId - User account ID
 * @param normalizedSender - Cleaned, lowercase sender email address
 * @returns Context object containing account, subscription, permanent profile, and history records, or null
 */
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

/**
 * Permanently deletes an unsubscribed sender record from both the account subscription table
 * and the durable cross-account subscription history table in an atomic transaction.
 * Rejects deletion if records are not in UNSUBSCRIBED status.
 *
 * @param accountId - User account ID
 * @param normalizedSender - Normalized sender email address to delete
 * @returns Result object with ok boolean and optional error message
 */
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
