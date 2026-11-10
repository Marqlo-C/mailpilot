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
