import { prisma } from "@/lib/prisma";
import { parseAccountRules } from "@/lib/validations/rules";

/**
 * Permanently deletes DISMISSED opportunities older than the account's
 * configured retention window. User-archived (non-dismissed) items are never purged.
 */
export async function purgeExpiredDismissed(accountId: string): Promise<{
  purgedCount: number;
  purgedEmailCount: number;
  retentionDays: number;
}> {
  const settings = await prisma.accountSettings.findUnique({
    where: { accountId },
    select: { rules: true },
  });

  const retentionDays =
    parseAccountRules(settings?.rules).dismissedRetentionDays ?? 30;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  // Stamp legacy DISMISSED rows missing dismissedAt (use updatedAt as proxy).
  const legacy = await prisma.jobOpportunity.findMany({
    where: {
      accountId,
      status: "DISMISSED",
      dismissedAt: null,
    },
    select: { id: true, updatedAt: true },
  });

  for (const row of legacy) {
    await prisma.jobOpportunity.update({
      where: { id: row.id },
      data: { dismissedAt: row.updatedAt },
    });
  }

  const result = await prisma.jobOpportunity.deleteMany({
    where: {
      accountId,
      status: "DISMISSED",
      dismissedAt: {
        lt: cutoffDate,
      },
    },
  });

  // Unlinked digests and irrelevant mail only. Any JobOpportunity row
  // (lead, applied, dismissed, or user-archived) keeps its source email.
  const emails = await prisma.emailMessage.deleteMany({
    where: {
      accountId,
      emailDate: { lt: cutoffDate },
      emailCategory: { in: ["IRRELEVANT", "JOB_BOARD_DIGEST"] },
      opportunities: { none: {} },
    },
  });

  return {
    purgedCount: result.count,
    purgedEmailCount: emails.count,
    retentionDays,
  };
}

/**
 * Deletes legacy opportunities created via heuristic parsing and re-queues
 * their source emails to PENDING_AI so they can be re-evaluated by the 2-tier AI pipeline.
 */
export async function pruneHeuristicOpportunities(
  accountId: string
): Promise<{ prunedCount: number }> {
  const badOpps = await prisma.jobOpportunity.findMany({
    where: { accountId, classificationMethod: "HEURISTIC" },
    select: { id: true, emailMessageId: true },
  });

  if (badOpps.length === 0) return { prunedCount: 0 };

  const emailMessageIds = badOpps
    .map((o) => o.emailMessageId)
    .filter((id): id is string => Boolean(id));

  const result = await prisma.jobOpportunity.deleteMany({
    where: { id: { in: badOpps.map((o) => o.id) } },
  });

  if (emailMessageIds.length > 0) {
    await prisma.emailMessage.updateMany({
      where: { id: { in: emailMessageIds }, accountId },
      data: { emailCategory: "PENDING_AI" },
    });
  }

  return { prunedCount: result.count };
}
