import { type JobApplication, type JobOpportunity } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/core/prisma";

/**
 * Queries all job application records associated with an account or its cross-inbox persistent profile.
 * Ordered by most recent email transmission/reception date descending.
 *
 * @param accountId - Target user account ID
 * @returns Array of JobApplication records
 */
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

/**
 * Queries job opportunity leads for an account, self-healing any legacy soft-hidden archive flags.
 * Sorts primarily by matchScore descending and secondarily by receivedAt timestamp descending.
 *
 * @param accountId - Target user account ID
 * @returns Array of JobOpportunity records
 */
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
