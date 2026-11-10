import { type JobApplication, type JobOpportunity } from "@prisma/client";
import { prisma } from "@/lib/core/prisma";

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
