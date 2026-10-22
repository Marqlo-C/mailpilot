import { cookies } from "next/headers";
import {
  type Account,
  type AccountSettings,
  type JobApplication,
  type JobOpportunity,
  Prisma,
  type Subscription,
  type SubscriptionHistory,
} from "@prisma/client";

import { getAuthenticatedAccountId, getSessionToken } from "@/lib/auth";
import { ACTIVE_ACCOUNT_COOKIE } from "@/lib/core/constants";
import {
  ensurePersistentProfileForAccount,
  mergeRulesWithPermanentSettings,
  persistProfileScopedRules,
} from "@/lib/profile/persistent-profile";
import { prisma } from "@/lib/core/prisma";
import { resolveMatchThreshold } from "@/lib/validations/profile";
import {
  accountRulesSchema,
  parseAccountRules,
  type AccountRules,
} from "@/lib/validations/rules";
import { decryptToken } from "@/lib/core/crypto";

export type AccountSummary = Pick<
  Account,
  | "id"
  | "email"
  | "name"
  | "picture"
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
          name: true,
          picture: true,
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
        name: true,
        picture: true,
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

    // Passive durable sync:
    const durableRules = parseAccountRules(durable.permanentSettings?.rules);
    const hasDurableKeys = Boolean(
      durableRules.encryptedApiKey ||
      durableRules.encryptedScrapingAntApiKey ||
      durableRules.encryptedHasDataApiKey
    );
    const hasAccountKeys = Boolean(
      accountRules.encryptedApiKey ||
      accountRules.encryptedScrapingAntApiKey ||
      accountRules.encryptedHasDataApiKey
    );

    // 1. If legacy AccountSettings has keys but durable profile doesn't, backfill to durable profile
    if (hasAccountKeys && !hasDurableKeys && selected.id) {
      persistProfileScopedRules(selected.id, {
        encryptedApiKey: accountRules.encryptedApiKey,
        maskedApiKey: accountRules.maskedApiKey,
        cloudProvider: accountRules.cloudProvider,
        cloudModel: accountRules.cloudModel,
        cloudModelProvider: accountRules.cloudModelProvider,
        allowCloudFallback: accountRules.allowCloudFallback,
        enableWebScrapingProxies: accountRules.enableWebScrapingProxies,
        encryptedScrapingAntApiKey: accountRules.encryptedScrapingAntApiKey,
        maskedScrapingAntApiKey: accountRules.maskedScrapingAntApiKey,
        encryptedHasDataApiKey: accountRules.encryptedHasDataApiKey,
        maskedHasDataApiKey: accountRules.maskedHasDataApiKey,
        encryptedJinaApiKey: accountRules.encryptedJinaApiKey,
        maskedJinaApiKey: accountRules.maskedJinaApiKey,
        scrapingAntUsage: accountRules.scrapingAntUsage,
        hasDataUsage: accountRules.hasDataUsage,
      }).catch((err) => {
        console.warn("[data] Passive backfill of durable profile keys failed:", err);
      });
    }

    // 2. If durable profile has keys but current AccountSettings is empty (e.g. freshly linked inbox), backfill AccountSettings
    if (hasDurableKeys && !hasAccountKeys && selected.settings) {
      const mergedAccountRules = accountRulesSchema.parse({
        ...accountRules,
        encryptedApiKey: durableRules.encryptedApiKey,
        maskedApiKey: durableRules.maskedApiKey,
        cloudProvider: durableRules.cloudProvider ?? accountRules.cloudProvider,
        cloudModel: durableRules.cloudModel ?? accountRules.cloudModel,
        cloudModelProvider:
          durableRules.cloudModelProvider ?? accountRules.cloudModelProvider,
        allowCloudFallback:
          durableRules.allowCloudFallback || accountRules.allowCloudFallback,
        enableWebScrapingProxies:
          durableRules.enableWebScrapingProxies ??
          accountRules.enableWebScrapingProxies,
        encryptedScrapingAntApiKey: durableRules.encryptedScrapingAntApiKey,
        maskedScrapingAntApiKey: durableRules.maskedScrapingAntApiKey,
        scrapingAntUsage: durableRules.scrapingAntUsage,
        hasDataUsage: durableRules.hasDataUsage,
        encryptedHasDataApiKey: durableRules.encryptedHasDataApiKey,
        maskedHasDataApiKey: durableRules.maskedHasDataApiKey,
        encryptedJinaApiKey: durableRules.encryptedJinaApiKey,
        maskedJinaApiKey: durableRules.maskedJinaApiKey,
      });
      const { matchScoreThreshold: _drop, ...rulesToSave } = mergedAccountRules;
      prisma.accountSettings
        .update({
          where: { accountId: selected.id },
          data: { rules: rulesToSave as Prisma.InputJsonValue },
        })
        .catch((err) => {
          console.warn("[data] Passive sync of durable keys to accountSettings failed:", err);
        });
    }
    if (!rules.bridgeSecret && rules.encryptedBridgeSecret) {
      try {
        rules.bridgeSecret = decryptToken(rules.encryptedBridgeSecret).trim();
      } catch {
        // gracefully ignore decryption failure
      }
    }

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
      name: selected.name,
      picture: selected.picture,
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
