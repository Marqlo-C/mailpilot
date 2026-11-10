import { prisma } from "@/lib/core/prisma";
import { addExcludedTitle } from "@/app/actions/settings";
import { parseAccountRules } from "@/lib/validations/rules.schema";
import {
  getGmailClientForAccount,
  InsufficientScopeError,
  REAUTH_REQUIRED_MESSAGE,
  isInsufficientScopeError,
} from "@/lib/gmail/google";
import { resolveIngestionRules } from "@/lib/gmail/sync";
import { loadCandidateProfileSummary } from "@/lib/ai";
import { processSyncMessage } from "@/lib/opportunities/sync/processor";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function dismissOpportunities(
  ids: string[]
): Promise<ActionResult<{ count: number }>> {
  if (!ids.length) return { ok: true, data: { count: 0 } };

  const records = await prisma.jobOpportunity.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      status: true,
      previousStatus: true,
      isArchived: true,
    },
  });

  let count = 0;
  for (const record of records) {
    if (record.status === "DISMISSED") continue;

    const prev = record.isArchived
      ? (record.previousStatus ?? "DISCOVERED")
      : record.status;

    await prisma.jobOpportunity.update({
      where: { id: record.id },
      data: {
        status: "DISMISSED",
        previousStatus: prev,
        isArchived: false,
        dismissedAt: new Date(),
      },
    });
    count += 1;
  }

  return { ok: true, data: { count } };
}

export async function dismissOpportunity(
  opportunityId: string
): Promise<ActionResult> {
  const result = await dismissOpportunities([opportunityId]);
  return result.ok ? { ok: true } : result;
}

export async function markOpportunitiesExternalApplied(
  ids: string[]
): Promise<ActionResult<{ count: number }>> {
  if (!ids.length) return { ok: true, data: { count: 0 } };

  const appliedAt = new Date();
  const result = await prisma.jobOpportunity.updateMany({
    where: { id: { in: ids } },
    data: {
      status: "APPLIED",
      isArchived: false,
      previousStatus: null,
      appliedAt,
    },
  });
  return { ok: true, data: { count: result.count } };
}

export async function markOpportunityExternalApplied(
  opportunityId: string
): Promise<ActionResult> {
  const result = await markOpportunitiesExternalApplied([opportunityId]);
  return result.ok ? { ok: true } : result;
}

/**
 * Ban this role pattern ("Less like this") and dismiss the card to History.
 */
export async function markLessLikeThis(
  opportunityId: string
): Promise<ActionResult> {
  const opp = await prisma.jobOpportunity.findUnique({
    where: { id: opportunityId },
  });
  if (!opp) return { ok: false, error: "Opportunity not found" };

  const banned = await addExcludedTitle(opp.accountId, opp.title);
  if (!banned.ok) return banned;

  const dismissed = await dismissOpportunities([opportunityId]);
  if (!dismissed.ok) return dismissed;
  return { ok: true };
}

/** Applied → back to active queue. */
export async function unmarkApplied(
  opportunityId: string
): Promise<ActionResult> {
  await prisma.jobOpportunity.update({
    where: { id: opportunityId },
    data: {
      status: "DISCOVERED",
      isArchived: false,
      previousStatus: null,
      dismissedAt: null,
      appliedAt: null,
    },
  });
  return { ok: true };
}

/** Action Required / leads → History (dismissed). */
export async function dismissActionRequired(
  opportunityId: string
): Promise<ActionResult> {
  const result = await dismissOpportunities([opportunityId]);
  return result.ok ? { ok: true } : result;
}

/** History → previous active status. */
export async function restoreFromHistory(
  opportunityId: string
): Promise<ActionResult> {
  const result = await restoreOpportunities([opportunityId]);
  return result.ok ? { ok: true } : result;
}

/** Permanently delete a dismissed opportunity row. */
export async function deleteOpportunityPermanently(
  opportunityId: string
): Promise<ActionResult> {
  const result = await deleteDismissedPermanently([opportunityId]);
  return result.ok ? { ok: true } : result;
}

/** Archive Leads & Applied only (moves to History as ARCHIVED). */
export async function archiveOpportunities(
  ids: string[]
): Promise<ActionResult<{ count: number }>> {
  if (!ids.length) return { ok: true, data: { count: 0 } };

  const records = await prisma.jobOpportunity.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true, isArchived: true, previousStatus: true },
  });

  let count = 0;
  for (const record of records) {
    if (record.status !== "DISCOVERED" && record.status !== "APPLIED") {
      continue;
    }
    if (record.isArchived && record.previousStatus != null) {
      continue;
    }

    await prisma.jobOpportunity.update({
      where: { id: record.id },
      data: {
        isArchived: true,
        previousStatus: record.status,
        dismissedAt: null,
      },
    });
    count += 1;
  }

  return { ok: true, data: { count } };
}

/** Restore History items to previousStatus (or DISCOVERED). */
export async function restoreOpportunities(
  ids: string[]
): Promise<ActionResult<{ count: number }>> {
  if (!ids.length) return { ok: true, data: { count: 0 } };

  const records = await prisma.jobOpportunity.findMany({
    where: { id: { in: ids } },
    select: { id: true, previousStatus: true, status: true, isArchived: true },
  });

  let count = 0;
  for (const record of records) {
    const isHistory =
      record.status === "DISMISSED" ||
      (record.isArchived && record.previousStatus != null);
    if (!isHistory) continue;

    const destinationStatus = record.previousStatus ?? "DISCOVERED";
    await prisma.jobOpportunity.update({
      where: { id: record.id },
      data: {
        status: destinationStatus,
        isArchived: false,
        previousStatus: null,
        dismissedAt: null,
      },
    });
    count += 1;
  }

  return { ok: true, data: { count } };
}

/** Permanently delete DISMISSED items only. */
export async function deleteDismissedPermanently(
  ids: string[]
): Promise<ActionResult<{ count: number }>> {
  if (!ids.length) return { ok: true, data: { count: 0 } };

  const result = await prisma.jobOpportunity.deleteMany({
    where: {
      id: { in: ids },
      status: "DISMISSED",
    },
  });

  return { ok: true, data: { count: result.count } };
}

/**
 * Development-only utility to re-process an opportunity's source email message
 * back through the full sync, extraction, debiasing, and deduplication pipeline.
 */
export async function reprocessOpportunityEmail(
  opportunityId: string
): Promise<
  ActionResult<{
    messageId: string;
    createdCount: number;
    updatedCount: number;
    opportunitiesUpserted: number;
  }>
> {
  if (process.env.NODE_ENV === "production") {
    return {
      ok: false,
      error: "Re-processing opportunities is only permitted in development mode.",
    };
  }

  const opportunity = await prisma.jobOpportunity.findUnique({
    where: { id: opportunityId },
    include: {
      account: {
        include: { settings: true },
      },
      emailMessage: true,
    },
  });

  if (!opportunity) {
    return { ok: false, error: "Opportunity not found" };
  }

  if (!opportunity.account || !opportunity.account.isActive) {
    return { ok: false, error: "Account not found or inactive" };
  }

  const messageId = opportunity.emailMessage?.messageId;
  if (!messageId) {
    return {
      ok: false,
      error: "Original Gmail message ID not found for this opportunity",
    };
  }

  try {
    const account = opportunity.account;
    const gmail = await getGmailClientForAccount(account);
    const rules = await resolveIngestionRules(account.id, account.settings?.rules);
    const candidateProfile = await loadCandidateProfileSummary(account.id);

    const result = await processSyncMessage({
      gmail,
      account,
      messageId,
      index: 1,
      total: 1,
      rules,
      candidateProfile,
      syncStartedAt: Date.now(),
      ollamaDownForSync: false,
    });

    return {
      ok: true,
      data: {
        messageId,
        createdCount: result.createdCount,
        updatedCount: result.updatedCount,
        opportunitiesUpserted: result.opportunitiesUpserted,
      },
    };
  } catch (error) {
    if (
      error instanceof InsufficientScopeError ||
      isInsufficientScopeError(error)
    ) {
      return { ok: false, error: REAUTH_REQUIRED_MESSAGE };
    }
    const message =
      error instanceof Error ? error.message : "Sync re-process failed";
    return { ok: false, error: message };
  }
}

/**
 * Trashes all Gmail messages tagged with the account's rejection label,
 * and updates matching JobApplication rows to trashed/archived.
 */
export async function emptyRejectionApplications(
  accountId: string
): Promise<ActionResult<{ trashed: number }>> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { settings: true },
  });

  if (!account || !account.isActive) {
    return { ok: false, error: "Account not found or inactive" };
  }

  const rules = parseAccountRules(account.settings?.rules);
  const labelId = rules.rejectionLabelId;

  if (!labelId) {
    return {
      ok: false,
      error: "Rejection label is not configured for this account",
    };
  }

  try {
    const gmail = await getGmailClientForAccount(account);
    const messageIds: string[] = [];
    let pageToken: string | undefined;

    do {
      const listed = await gmail.users.messages.list({
        userId: "me",
        labelIds: [labelId],
        maxResults: 500,
        pageToken,
      });

      for (const message of listed.data.messages ?? []) {
        if (message.id) {
          messageIds.push(message.id);
        }
      }

      pageToken = listed.data.nextPageToken ?? undefined;
    } while (pageToken);

    // Also include DB-tracked rejections that may still be in Inbox (AUTO_TRASH off)
    const dbRejections = await prisma.jobApplication.findMany({
      where: {
        accountId,
        status: "REJECTION",
        isTrashed: false,
      },
      select: { messageId: true },
    });

    for (const row of dbRejections) {
      if (!messageIds.includes(row.messageId)) {
        messageIds.push(row.messageId);
      }
    }

    if (messageIds.length === 0) {
      return { ok: true, data: { trashed: 0 } };
    }

    const chunks = chunkArray(messageIds, 1000);
    for (const chunk of chunks) {
      await gmail.users.messages.batchModify({
        userId: "me",
        requestBody: {
          ids: chunk,
          addLabelIds: ["TRASH"],
          removeLabelIds: ["INBOX"],
        },
      });
    }

    await prisma.jobApplication.updateMany({
      where: {
        accountId,
        messageId: { in: messageIds },
      },
      data: {
        isTrashed: true,
        isArchived: true,
      },
    });

    return { ok: true, data: { trashed: messageIds.length } };
  } catch (error) {
    console.error("emptyRejectionApplications failed", error);
    if (
      error instanceof InsufficientScopeError ||
      isInsufficientScopeError(error)
    ) {
      return { ok: false, error: REAUTH_REQUIRED_MESSAGE };
    }
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to trash rejections",
    };
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
