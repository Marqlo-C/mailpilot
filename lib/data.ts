import { cookies } from "next/headers";
import type {
  Account,
  AccountSettings,
  JobApplication,
  JobOpportunity,
  Subscription,
  SubscriptionHistory,
} from "@prisma/client";

import { getAuthenticatedAccountId, getSessionToken } from "@/lib/auth";
import { ACTIVE_ACCOUNT_COOKIE } from "@/lib/constants";
import {
  ensurePersistentProfileForAccount,
  mergeRulesWithPermanentSettings,
} from "@/lib/persistent-profile";
import { prisma } from "@/lib/prisma";
import { resolveMatchThreshold } from "@/lib/validations/profile";
import { parseAccountRules, type AccountRules } from "@/lib/validations/rules";

export type AccountSummary = Pick<
  Account,
  | "id"
  | "email"
  | "isActive"
  | "historyId"
  | "updatedAt"
  | "createdAt"
  | "persistentProfileId"
  | "encryptedAccess"
  | "isSyncing"
  | "lastSyncedAt"
  | "syncError"
>;

export type AccountWithSettings = AccountSummary & {
  settings: AccountSettings | null;
  rules: AccountRules;
  /** Canonical match threshold (PermanentSettings → UserProfile). */
  matchThreshold: number;
  hasCredentials: boolean;
  pendingClassificationCount: number;
};

export async function listAccounts(): Promise<AccountSummary[]> {
  try {
    const sessionAccountId = await getAuthenticatedAccountId();
    if (!sessionAccountId) {
      return [];
    }

    const sessionAccount = await prisma.account.findUnique({
      where: { id: sessionAccountId },
      select: { persistentProfileId: true },
    });

    if (!sessionAccount?.persistentProfileId) {
      // Session inbox has no durable profile yet — only return itself.
      return prisma.account.findMany({
        where: { id: sessionAccountId, isActive: true },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          email: true,
          isActive: true,
          historyId: true,
          updatedAt: true,
          createdAt: true,
          persistentProfileId: true,
          encryptedAccess: true,
          isSyncing: true,
          lastSyncedAt: true,
          syncError: true,
        },
      });
    }

    return await prisma.account.findMany({
      where: {
        isActive: true,
        persistentProfileId: sessionAccount.persistentProfileId,
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        isActive: true,
        historyId: true,
        updatedAt: true,
        createdAt: true,
        persistentProfileId: true,
        encryptedAccess: true,
        isSyncing: true,
        lastSyncedAt: true,
        syncError: true,
      },
    });
  } catch (error) {
    console.error("listAccounts failed", error);
    return [];
  }
}

export async function getActiveAccount(): Promise<AccountWithSettings | null> {
  try {
    const sessionToken = await getSessionToken();
    if (!sessionToken) {
      return null;
    }

    const sessionAccountId = await getAuthenticatedAccountId();
    if (!sessionAccountId) {
      return null;
    }

    const cookieStore = await cookies();
    const sessionAccount = await prisma.account.findUnique({
      where: { id: sessionAccountId },
      select: { persistentProfileId: true },
    });

    const accounts = await prisma.account.findMany({
      where: sessionAccount?.persistentProfileId
        ? {
            isActive: true,
            persistentProfileId: sessionAccount.persistentProfileId,
          }
        : { id: sessionAccountId, isActive: true },
      include: {
        settings: true,
        persistentProfile: { include: { permanentSettings: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    if (accounts.length === 0) {
      return null;
    }

    const preferredId = cookieStore.get(ACTIVE_ACCOUNT_COOKIE)?.value;
    const selected =
      accounts.find((a) => a.id === preferredId) ??
      accounts.find((a) => a.id === sessionAccountId) ??
      accounts[0];

    const durable = selected.persistentProfile
      ? selected.persistentProfile
      : await ensurePersistentProfileForAccount(selected);

    const accountRules = parseAccountRules(selected.settings?.rules);
    const rules = mergeRulesWithPermanentSettings(
      accountRules,
      durable.permanentSettings
    );

    const profile = await prisma.userProfile.findUnique({
      where: { accountId: selected.id },
      select: { matchThreshold: true },
    });

    const matchThreshold = resolveMatchThreshold({
      permanentMatchScoreThreshold:
        durable.permanentSettings?.matchScoreThreshold,
      profileMatchThreshold: profile?.matchThreshold,
    });

    const pendingClassificationCount = await prisma.emailMessage.count({
      where: {
        accountId: selected.id,
        emailCategory: "PENDING_AI",
      },
    });

    return {
      id: selected.id,
      email: selected.email,
      isActive: selected.isActive,
      historyId: selected.historyId,
      updatedAt: selected.updatedAt,
      createdAt: selected.createdAt,
      persistentProfileId: durable.id,
      encryptedAccess: selected.encryptedAccess,
      isSyncing: selected.isSyncing,
      lastSyncedAt: selected.lastSyncedAt,
      syncError: selected.syncError,
      settings: selected.settings,
      rules,
      matchThreshold,
      hasCredentials: Boolean(
        selected.encryptedAccess && selected.encryptedRefresh
      ),
      pendingClassificationCount,
    };
  } catch (error) {
    console.error("getActiveAccount failed", error);
    return null;
  }
}

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

export async function getJobsForAccount(
  accountId: string
): Promise<JobApplication[]> {
  try {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, persistentProfileId: true },
    });

    if (!account) return [];

    return await prisma.jobApplication.findMany({
      where: {
        OR: [
          { accountId },
          ...(account.persistentProfileId
            ? [{ persistentProfileId: account.persistentProfileId }]
            : []),
        ],
      },
      orderBy: { emailDate: "desc" },
    });
  } catch (error) {
    console.error("getJobsForAccount failed", error);
    return [];
  }
}

export async function getJobOpportunitiesForAccount(
  accountId: string
): Promise<JobOpportunity[]> {
  try {
    // Heal legacy score soft-hides so threshold changes apply without rescan.
    await prisma.jobOpportunity.updateMany({
      where: {
        accountId,
        isArchived: true,
        previousStatus: null,
        status: { not: "DISMISSED" },
      },
      data: { isArchived: false },
    });

    return await prisma.jobOpportunity.findMany({
      where: { accountId },
      orderBy: [{ matchScore: "desc" }, { receivedAt: "desc" }],
    });
  } catch (error) {
    console.error("getJobOpportunitiesForAccount failed", error);
    return [];
  }
}
