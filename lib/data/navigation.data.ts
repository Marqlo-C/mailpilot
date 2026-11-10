import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/prisma";

/** Counts shown on the Job Radar and Subscriptions tab rails. */
export type SidebarTabCounts = {
  jobs: {
    leads: number;
    applied: number;
    action: number;
    history: number;
  };
  subscriptions: {
    active: number;
    archive: number;
  };
};

const EMPTY_SIDEBAR_TAB_COUNTS: SidebarTabCounts = {
  jobs: { leads: 0, applied: 0, action: 0, history: 0 },
  subscriptions: { active: 0, archive: 0 },
};

/** User archive: archived with a stored previous status, and not dismissed. */
const NOT_USER_ARCHIVED: Prisma.JobOpportunityWhereInput = {
  NOT: { isArchived: true, previousStatus: { not: null } },
};

/**
 * Same totals as the tab-rail pills. Leads ignore the match threshold.
 * Subscription archive is one row per sender, including history-only senders.
 */
export async function getSidebarTabCounts(
  accountId: string,
  persistentProfileId: string | null
): Promise<SidebarTabCounts> {
  try {
    const jobScope: Prisma.JobApplicationWhereInput = {
      OR: [
        { accountId },
        ...(persistentProfileId ? [{ persistentProfileId }] : []),
      ],
    };
    const [
      discoveredLeads,
      opportunityApplied,
      opportunityAction,
      opportunityHistory,
      jobLeads,
      jobApplied,
      jobAction,
      jobHistory,
      activeSubscriptions,
      unsubscribedSenders,
      historySenders,
    ] = await Promise.all([
      prisma.jobOpportunity.count({
        where: { accountId, status: "DISCOVERED", ...NOT_USER_ARCHIVED },
      }),
      prisma.jobOpportunity.count({
        where: { accountId, status: "APPLIED", ...NOT_USER_ARCHIVED },
      }),
      prisma.jobOpportunity.count({
        where: { accountId, status: "REVIEW_READY", ...NOT_USER_ARCHIVED },
      }),
      prisma.jobOpportunity.count({
        where: {
          accountId,
          OR: [
            { status: "DISMISSED" },
            {
              isArchived: true,
              previousStatus: { not: null },
              status: { not: "DISMISSED" },
            },
          ],
        },
      }),
      prisma.jobApplication.count({
        where: { ...jobScope, status: "LEAD", isArchived: false },
      }),
      prisma.jobApplication.count({
        where: { ...jobScope, status: "APPLIED" },
      }),
      prisma.jobApplication.count({
        where: {
          ...jobScope,
          status: { in: ["OA", "INTERVIEW"] },
          isTrashed: false,
        },
      }),
      prisma.jobApplication.count({
        where: {
          ...jobScope,
          status: { in: ["REJECTION", "OFFER", "ARCHIVED"] },
        },
      }),
      prisma.subscription.count({
        where: { accountId, status: { in: ["ACTIVE", "FAILED"] } },
      }),
      prisma.subscription.findMany({
        where: { accountId, status: "UNSUBSCRIBED" },
        select: { senderEmail: true },
      }),
      persistentProfileId
        ? prisma.subscriptionHistory.findMany({
            where: {
              userProfileId: persistentProfileId,
              status: "UNSUBSCRIBED",
            },
            select: { senderEmail: true },
          })
        : Promise.resolve([]),
    ]);

    const archiveSenders = new Set<string>();
    for (const row of unsubscribedSenders) {
      archiveSenders.add(row.senderEmail.toLowerCase());
    }
    for (const row of historySenders) {
      archiveSenders.add(row.senderEmail.toLowerCase());
    }

    return {
      jobs: {
        leads: discoveredLeads + jobLeads,
        applied: opportunityApplied + jobApplied,
        action: opportunityAction + jobAction,
        history: opportunityHistory + jobHistory,
      },
      subscriptions: {
        active: activeSubscriptions,
        archive: archiveSenders.size,
      },
    };
  } catch (error) {
    console.error("getSidebarTabCounts failed", error);
    return EMPTY_SIDEBAR_TAB_COUNTS;
  }
}
