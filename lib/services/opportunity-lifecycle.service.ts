import { prisma } from "@/lib/core/prisma";
import { addExcludedTitle } from "@/lib/services/settings-rules.service";
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

/**
 * Bulk dismisses job opportunities to the History tab.
 * Preserves the original active lifecycle state in `previousStatus` so the card
 * can be accurately restored later, while clearing active archive indicators.
 *
 * @param ids - Array of opportunity IDs to dismiss
 * @returns Result object containing the count of successfully updated opportunities
 */
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

/**
 * Dismisses a single job opportunity to the History tab.
 *
 * @param opportunityId - Unique identifier of the opportunity to dismiss
 * @returns Standard tagged union result
 */
export async function dismissOpportunity(
  opportunityId: string
): Promise<ActionResult> {
  const result = await dismissOpportunities([opportunityId]);
  return result.ok ? { ok: true } : result;
}

/**
 * Bulk marks opportunities as externally applied (e.g. submitted via external job portal).
 * Updates status to APPLIED, timestamps submission, and clears previous navigation pointers.
 *
 * @param ids - Array of opportunity IDs to mark as applied
 * @returns Result object containing the count of successfully updated rows
 */
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

/**
 * Marks a single opportunity as externally applied.
 *
 * @param opportunityId - Unique identifier of the target opportunity
 * @returns Standard tagged union result
 */
export async function markOpportunityExternalApplied(
  opportunityId: string
): Promise<ActionResult> {
  const result = await markOpportunitiesExternalApplied([opportunityId]);
  return result.ok ? { ok: true } : result;
}

/**
 * Bans a role title pattern ("Less like this") by appending it to the account's excluded titles list,
 * then dismisses the card into the History tab. Prevents future sync cycles from surfacing this role.
 *
 * @param opportunityId - Target opportunity whose title will be excluded
 * @returns Standard tagged union result
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

/**
 * Moves an applied opportunity back to the active discovery pipeline (status DISCOVERED).
 * Clears applied and dismissed timestamps.
 *
 * @param opportunityId - Target opportunity to unmark
 * @returns Standard tagged union result
 */
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

/**
 * Dismisses an opportunity in the Action Required queue directly to the History tab.
 *
 * @param opportunityId - Unique opportunity identifier
 * @returns Standard tagged union result
 */
export async function dismissActionRequired(
  opportunityId: string
): Promise<ActionResult> {
  const result = await dismissOpportunities([opportunityId]);
  return result.ok ? { ok: true } : result;
}

/**
 * Restores a dismissed or archived card from the History tab back to its previous active pipeline status.
 *
 * @param opportunityId - Target opportunity to restore
 * @returns Standard tagged union result
 */
export async function restoreFromHistory(
  opportunityId: string
): Promise<ActionResult> {
  const result = await restoreOpportunities([opportunityId]);
  return result.ok ? { ok: true } : result;
}

/**
 * Permanently removes a dismissed opportunity row from the database.
 * Only opportunities in DISMISSED status can be deleted through this pipeline.
 *
 * @param opportunityId - Opportunity ID to permanently delete
 * @returns Standard tagged union result
 */
export async function deleteOpportunityPermanently(
  opportunityId: string
): Promise<ActionResult> {
  const result = await deleteDismissedPermanently([opportunityId]);
  return result.ok ? { ok: true } : result;
}

/**
 * Bulk archives eligible opportunities (DISCOVERED and APPLIED), moving them to the History tab.
 * Preserves the original active state in `previousStatus` so they can be accurately restored.
 *
 * @param ids - Array of opportunity IDs to archive
 * @returns Result object containing the count of archived opportunities
 */
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

/**
 * Restores opportunities from the History tab back to their previous active state (or DISCOVERED).
 * Unsets archive flags, clears dismissal timestamps, and restores navigational status.
 *
 * @param ids - Array of opportunity IDs to restore
 * @returns Result object containing the count of successfully restored opportunities
 */
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

/**
 * Permanently deletes rows that are in DISMISSED state from the database.
 * Non-dismissed records are safely bypassed by database where-clause filters.
 *
 * @param ids - Array of opportunity IDs to permanently delete
 * @returns Result object containing the count of deleted rows
 */
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
 * Development-only diagnostic utility to re-process an opportunity's raw Gmail message
 * through ingestion, taxonomy classification, and opportunity upsertion pipelines.
 * Blocked in production environments.
 *
 * @param opportunityId - Unique identifier of the opportunity to reprocess
 * @returns Result object containing message processing telemetry and counts
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
 * Trashes all Gmail messages associated with the account's configured rejection label
 * and marks matching JobApplication records as archived/trashed in the database.
 * Batches Gmail message IDs and uses batchDelete / trash API commands.
 *
 * @param accountId - Target user account ID
 * @returns Result object containing the total count of messages moved to trash
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
