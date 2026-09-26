import { cookies } from "next/headers";
import type { Account, AccountSettings, JobApplication, Subscription } from "@prisma/client";

import { ACTIVE_ACCOUNT_COOKIE } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { parseAccountRules, type AccountRules } from "@/lib/validations/rules";

export type AccountSummary = Pick<
  Account,
  "id" | "email" | "isActive" | "historyId" | "updatedAt" | "createdAt"
>;

export type AccountWithSettings = AccountSummary & {
  settings: AccountSettings | null;
  rules: AccountRules;
};

export async function listAccounts(): Promise<AccountSummary[]> {
  try {
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
      },
    });
  } catch (error) {
    console.error("listAccounts failed", error);
    return [];
  }
}

export async function getActiveAccount(): Promise<AccountWithSettings | null> {
  try {
    const accounts = await prisma.account.findMany({
      where: { isActive: true },
      include: { settings: true },
      orderBy: { createdAt: "asc" },
    });

    if (accounts.length === 0) {
      return null;
    }

    const cookieStore = await cookies();
    const preferredId = cookieStore.get(ACTIVE_ACCOUNT_COOKIE)?.value;
    const selected =
      accounts.find((a) => a.id === preferredId) ?? accounts[0];

    return {
      id: selected.id,
      email: selected.email,
      isActive: selected.isActive,
      historyId: selected.historyId,
      updatedAt: selected.updatedAt,
      createdAt: selected.createdAt,
      settings: selected.settings,
      rules: parseAccountRules(selected.settings?.rules),
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

export async function getJobsForAccount(
  accountId: string
): Promise<JobApplication[]> {
  try {
    return await prisma.jobApplication.findMany({
      where: { accountId },
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
    const [activeInterviews, pendingAssessments, subscriptionsDetected, cleanedRejections, actionRequired, recentSubscriptions] =
      await Promise.all([
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
