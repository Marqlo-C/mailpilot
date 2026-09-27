import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Revert alert leads that were falsely marked APPLIED, remove placeholders,
 * and ensure both distinct ByteDance applied roles exist.
 */
async function revertFalseApplied() {
  console.log("Reverting false APPLIED statuses back to DISCOVERED...");

  const alertCompanies = [
    "Deloitte",
    "Deloitte Touche Tohmatsu Ltd",
    "Microsoft",
    "Hewlett Packard Enterprise",
    "IBM Research Park",
    "Terabase Energy",
    "Butcher Power Products",
    "Mobina",
    "Mobina Software Engineers",
    "Synergy BIS",
    "Eonics LLC",
    "Emonics LLC",
  ];

  for (const company of alertCompanies) {
    const updated = await prisma.jobOpportunity.updateMany({
      where: {
        company: { contains: company, mode: "insensitive" },
        status: "APPLIED",
      },
      data: {
        status: "DISCOVERED",
        isArchived: false,
        previousStatus: null,
        dismissedAt: null,
      },
    });
    if (updated.count > 0) {
      console.log(
        `Reverted ${updated.count} opportunities for ${company} -> DISCOVERED`
      );
    }
  }

  const deletedPlaceholders = await prisma.jobOpportunity.deleteMany({
    where: {
      title: { equals: "Applied Position", mode: "insensitive" },
    },
  });
  console.log(
    `Deleted ${deletedPlaceholders.count} "Applied Position" placeholder rows.`
  );

  // Also revert legacy JobApplication APPLIED rows for those alert companies.
  for (const company of alertCompanies) {
    await prisma.jobApplication.updateMany({
      where: {
        companyName: { contains: company, mode: "insensitive" },
        status: "APPLIED",
      },
      data: { status: "LEAD" },
    });
  }

  const account = await prisma.account.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
  });

  if (account) {
    const bytedanceRoles = [
      {
        title: "Software Engineer - Data Agent & Agentic Search",
        location: "San Jose, CA",
        description:
          "Data Agent and Agentic Search software engineering role at ByteDance.",
      },
      {
        title: "Backend Software Engineer - Platforms",
        location: "San Jose, CA (On-site)",
        description:
          "Backend software engineering role focusing on platforms infrastructure at ByteDance.",
      },
    ];

    for (const role of bytedanceRoles) {
      const exists = await prisma.jobOpportunity.findFirst({
        where: {
          accountId: account.id,
          company: { equals: "ByteDance", mode: "insensitive" },
          title: { equals: role.title, mode: "insensitive" },
        },
      });

      if (!exists) {
        await prisma.jobOpportunity.create({
          data: {
            accountId: account.id,
            company: "ByteDance",
            title: role.title,
            location: role.location,
            description: role.description,
            status: "APPLIED",
            receivedAt: new Date("2026-09-27T12:00:00.000Z"),
            matchScore: 90,
            matchReason:
              "Strong CS background matches software engineering role at ByteDance.",
            applicationType: "EXTERNAL_LINK",
            isArchived: false,
          },
        });
        console.log(`Restored ByteDance role: ${role.title}`);
      } else {
        await prisma.jobOpportunity.update({
          where: { id: exists.id },
          data: {
            status: "APPLIED",
            location: role.location,
            isArchived: false,
            previousStatus: null,
            dismissedAt: null,
          },
        });
        console.log(`Confirmed ByteDance role APPLIED: ${role.title}`);
      }
    }
  } else {
    console.warn("No active account found — skipped ByteDance restore.");
  }

  console.log("Remediation complete.");
}

revertFalseApplied()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
