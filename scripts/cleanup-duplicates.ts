import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function isPlaceholderTitle(title: string): boolean {
  const lower = title.toLowerCase().trim();
  return (
    lower === "applied position" ||
    lower.includes("application was sent") ||
    lower === "linkedin"
  );
}

/**
 * One-shot cleanup: merge Applied Position duplicates per company and
 * purge APPLIED JobApplication rows that mirror JobOpportunity cards.
 * Does NOT wipe OA/INTERVIEW/REJECTION JobApplications.
 */
async function cleanupDuplicates() {
  console.log("Starting database deduplication cleanup...");

  const allOpps = await prisma.jobOpportunity.findMany({
    orderBy: { createdAt: "desc" },
  });

  const grouped = new Map<string, typeof allOpps>();
  for (const opp of allOpps) {
    const key = `${opp.accountId}:${opp.company.toLowerCase().trim()}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(opp);
  }

  let totalDeleted = 0;
  let totalUpgraded = 0;

  for (const [, opps] of grouped.entries()) {
    if (opps.length <= 1) continue;

    const bestRecord =
      opps.find(
        (o) => !isPlaceholderTitle(o.title) && o.status === "APPLIED"
      ) ||
      opps.find((o) => !isPlaceholderTitle(o.title)) ||
      opps.find((o) => o.status === "APPLIED") ||
      opps[0];

    const titleWithContent = opps.find(
      (o) => !isPlaceholderTitle(o.title)
    )?.title;
    const locationWithContent = opps.find((o) => Boolean(o.location))?.location;

    if (
      (isPlaceholderTitle(bestRecord.title) && titleWithContent) ||
      (!bestRecord.location && locationWithContent) ||
      bestRecord.status !== "APPLIED"
    ) {
      await prisma.jobOpportunity.update({
        where: { id: bestRecord.id },
        data: {
          ...(isPlaceholderTitle(bestRecord.title) && titleWithContent
            ? { title: titleWithContent }
            : {}),
          ...(locationWithContent && !bestRecord.location
            ? { location: locationWithContent }
            : {}),
          status: "APPLIED",
          isArchived: false,
          previousStatus: null,
          dismissedAt: null,
        },
      });
      totalUpgraded += 1;
    }

    // Only delete placeholders or exact title clones — keep distinct real roles.
    const toDeleteIds = opps
      .filter((o) => o.id !== bestRecord.id)
      .filter(
        (o) =>
          isPlaceholderTitle(o.title) ||
          o.title.toLowerCase() === bestRecord.title.toLowerCase()
      )
      .map((o) => o.id);

    if (toDeleteIds.length > 0) {
      const del = await prisma.jobOpportunity.deleteMany({
        where: { id: { in: toDeleteIds } },
      });
      totalDeleted += del.count;
    }
  }

  // Wipe only APPLIED JobApplications that share a company with an APPLIED opportunity.
  const appliedOpps = await prisma.jobOpportunity.findMany({
    where: { status: "APPLIED" },
    select: { accountId: true, company: true },
  });

  let legacyDeleted = 0;
  for (const opp of appliedOpps) {
    const result = await prisma.jobApplication.deleteMany({
      where: {
        accountId: opp.accountId,
        status: "APPLIED",
        companyName: { equals: opp.company, mode: "insensitive" },
      },
    });
    legacyDeleted += result.count;
  }

  console.log(`Deduplication complete:
- Deleted ${totalDeleted} duplicate JobOpportunity rows
- Upgraded ${totalUpgraded} placeholder / APPLIED records
- Purged ${legacyDeleted} mirrored APPLIED JobApplication rows`);
}

cleanupDuplicates()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
