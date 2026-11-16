import {
  type Subscription,
  type SubscriptionHistory,
} from "@prisma/client";
import { prisma } from "@/lib/core/prisma";

export type LatestBriefingPreview = {
  id: string;
  subject: string | null;
  htmlPreview: string;
  generatedAt: Date;
  senderEmails: string[];
  subscriptionIds: string[];
};

/**
 * Queries all newsletter and email subscriptions tracked for an account.
 * Sorted primarily by subscription status ascending and secondarily by last email reception date descending.
 *
 * @param accountId - Target user account ID
 * @returns Array of Subscription database rows
 */
export async function getSubscriptionsForAccount(
  accountId: string
): Promise<Subscription[]> {
  try {
    return await prisma.subscription.findMany({
      where: { accountId },
      orderBy: [{ status: "asc" }, { lastReceivedAt: "desc" }],
    });
  } catch (error) {
    console.error("getSubscriptionsForAccount failed", error);
    return [];
  }
}

/**
 * Retrieves the most recent AI-generated newsletter briefing preview for an account.
 *
 * @param accountId - Target user account ID
 * @returns Latest briefing record with HTML summary preview or null if none exists
 */
export async function getLatestBriefingForAccount(
  accountId: string
): Promise<LatestBriefingPreview | null> {
  try {
    const row = await prisma.subscriptionBriefing.findUnique({
      where: { accountId },
      select: {
        id: true,
        subject: true,
        htmlPreview: true,
        generatedAt: true,
        senderEmails: true,
        subscriptionIds: true,
      },
    });
    return row;
  } catch (error) {
    console.error("getLatestBriefingForAccount failed", error);
    return null;
  }
}

/**
 * Queries cross-account subscription unsubscribe history preserved on the user's permanent profile.
 * Ordered by update timestamp descending.
 *
 * @param userProfileId - Durable persistent profile ID
 * @returns Array of SubscriptionHistory records
 */
export async function getSubscriptionHistoryForProfile(
  userProfileId: string
): Promise<SubscriptionHistory[]> {
  try {
    return await prisma.subscriptionHistory.findMany({
      where: { userProfileId },
      orderBy: { updatedAt: "desc" },
    });
  } catch (error) {
    console.error("getSubscriptionHistoryForProfile failed", error);
    return [];
  }
}
