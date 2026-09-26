import { cookies } from "next/headers";
import type {
  Account,
  AccountSettings,
  JobApplication,
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
>;

export type AccountWithSettings = AccountSummary & {
  settings: AccountSettings | null;
  rules: AccountRules;
  hasCredentials: boolean;
};

export async function listAccounts(): Promise<AccountSummary[]> {
  try {
    const sessionAccountId = await getAuthenticatedAccountId();
    if (!sessionAccountId) {
      return [];
    }

    return await prisma.account.findMany({
      where: { isActive: true },
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
    const accounts = await prisma.account.findMany({
      where: { isActive: true },
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

    return {
      id: selected.id,
      email: selected.email,
      isActive: selected.isActive,
      historyId: selected.historyId,
      updatedAt: selected.updatedAt,
      createdAt: selected.createdAt,
      persistentProfileId: durable.id,
      encryptedAccess: selected.encryptedAccess,
      settings: selected.settings,
      rules,
      hasCredentials: Boolean(
        selected.encryptedAccess && selected.encryptedRefresh
      ),
    };
  } catch (error) {
    console.error("getActiveAccount failed", error);
    return null;
  }
}

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

export type DashboardMetrics = {
  activeInterviews: number;
  pendingAssessments: number;
  subscriptionsDetected: number;
  cleanedRejections: number;
  actionRequired: JobApplication[];
  recentSubscriptions: Subscription[];
};

export async function getDashboardMetrics(
  accountId: string
): Promise<DashboardMetrics> {
  try {
    const [
      activeInterviews,
      pendingAssessments,
      subscriptionsDetected,
      cleanedRejections,
      actionRequired,
      recentSubscriptions,
    ] = await Promise.all([
      prisma.jobApplication.count({
        where: {
          accountId,
          status: "INTERVIEW",
          isTrashed: false,
        },
      }),
      prisma.jobApplication.count({
        where: {
          accountId,
          status: "OA",
          isTrashed: false,
        },
      }),
      prisma.subscription.count({
        where: { accountId, status: "ACTIVE" },
      }),
      prisma.jobApplication.count({
        where: {
          accountId,
          status: "REJECTION",
          isTrashed: true,
        },
      }),
      prisma.jobApplication.findMany({
        where: {
          accountId,
          status: { in: ["OA", "INTERVIEW"] },
          isTrashed: false,
        },
        orderBy: { deadlineAt: "asc" },
        take: 5,
      }),
      prisma.subscription.findMany({
        where: { accountId, status: "ACTIVE" },
        orderBy: { lastReceivedAt: "desc" },
        take: 5,
      }),
    ]);

    return {
      activeInterviews,
      pendingAssessments,
      subscriptionsDetected,
      cleanedRejections,
      actionRequired,
      recentSubscriptions,
    };
  } catch (error) {
    console.error("getDashboardMetrics failed", error);
    return {
      activeInterviews: 0,
      pendingAssessments: 0,
      subscriptionsDetected: 0,
      cleanedRejections: 0,
      actionRequired: [],
      recentSubscriptions: [],
    };
  }
}
