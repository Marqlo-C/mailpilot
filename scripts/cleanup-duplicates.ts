import { PrismaClient } from "@prisma/client";

import { isGenericTitle } from "../lib/parsers/application-parser";

const prisma = new PrismaClient();

/**
 * One-shot cleanup: merge generic/placeholder duplicates per company and
 * purge APPLIED JobApplication rows that mirror JobOpportunity cards.
 * Does NOT wipe OA/INTERVIEW/REJECTION JobApplications.
 * Safe for multi-tenant use — never hardcodes profession titles.
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

    const company = opps[0]?.company ?? "";

    const bestRecord =
      opps.find(
        (o) => !isGenericTitle(o.title, company) && o.status === "APPLIED"
      ) ||
      opps.find((o) => !isGenericTitle(o.title, company)) ||
      opps.find((o) => o.status === "APPLIED") ||
      opps[0];

    const titleWithContent = opps.find(
      (o) => !isGenericTitle(o.title, company)
    )?.title;
    const locationWithContent = opps.find((o) => Boolean(o.location))?.location;

    if (
      (isGenericTitle(bestRecord.title, company) && titleWithContent) ||
      (!bestRecord.location && locationWithContent) ||
      bestRecord.status !== "APPLIED"
    ) {
      await prisma.jobOpportunity.update({
        where: { id: bestRecord.id },
        data: {
          ...(isGenericTitle(bestRecord.title, company) && titleWithContent
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
          isGenericTitle(o.title, company) ||
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

  let appsDeleted = 0;
  for (const opp of appliedOpps) {
    const del = await prisma.jobApplication.deleteMany({
      where: {
        accountId: opp.accountId,
        companyName: { equals: opp.company, mode: "insensitive" },
        status: "APPLIED",
      },
    });
    appsDeleted += del.count;
  }

  console.log(
    `Cleanup complete. Upgraded ${totalUpgraded} opportunities, deleted ${totalDeleted} duplicate opportunities, deleted ${appsDeleted} mirrored APPLIED applications.`
  );
}

cleanupDuplicates()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
