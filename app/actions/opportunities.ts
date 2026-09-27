"use server";

import { revalidatePath } from "next/cache";

import { canDraftDirectEmail } from "@/lib/application-method";
import {
  countSendsToday,
  dispatchOpportunityEmail,
  getDailySendLimit,
  prepareOpportunityDraft,
  updateOpportunityDraft,
} from "@/lib/opportunity-dispatch";
import {
  InsufficientScopeError,
  REAUTH_REQUIRED_MESSAGE,
  isInsufficientScopeError,
} from "@/lib/google";
import { prisma } from "@/lib/prisma";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function prepareOpportunityDraftForReview(
  opportunityId: string
): Promise<
  ActionResult<{ subject: string; body: string; recipient: string }>
> {
  const opportunity = await prisma.jobOpportunity.findUnique({
    where: { id: opportunityId },
  });
  if (!opportunity) {
    return { ok: false, error: "Opportunity not found" };
  }

  if (!canDraftDirectEmail(opportunity.recipientEmail)) {
    return {
      ok: false,
      error:
        "No recruiter email on this listing. Use the external apply link instead — email drafts are disabled.",
    };
  }

  try {
    if (
      opportunity.draftSubject?.trim() &&
      opportunity.draftBody?.trim() &&
      (opportunity.status === "REVIEW_READY" || opportunity.status === "DISCOVERED")
    ) {
      return {
        ok: true,
        data: {
          subject: opportunity.draftSubject,
          body: opportunity.draftBody,
          recipient: opportunity.recipientEmail!,
        },
      };
    }

    const draft = await prepareOpportunityDraft(opportunity.accountId, opportunityId);
    revalidatePath("/jobs");
    return { ok: true, data: draft };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to prepare draft",
    };
  }
}

export async function saveOpportunityDraftEdits(
  opportunityId: string,
  input: { subject: string; body: string }
): Promise<ActionResult> {
  const opportunity = await prisma.jobOpportunity.findUnique({
    where: { id: opportunityId },
  });
  if (!opportunity) {
    return { ok: false, error: "Opportunity not found" };
  }
  if (!canDraftDirectEmail(opportunity.recipientEmail)) {
    return {
      ok: false,
      error: "Cannot save an email draft without a recruiter email address.",
    };
  }

  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject || !body) {
    return { ok: false, error: "Subject and body are required" };
  }

  try {
    await updateOpportunityDraft(opportunity.accountId, opportunityId, {
      subject,
      body,
    });
    revalidatePath("/jobs");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to save draft",
    };
  }
}

export async function sendOpportunityApplication(
  opportunityId: string,
  asDraft = false
): Promise<ActionResult<{ mode: "draft" | "sent" }>> {
  const opportunity = await prisma.jobOpportunity.findUnique({
    where: { id: opportunityId },
  });
  if (!opportunity) {
    return { ok: false, error: "Opportunity not found" };
  }
  if (!canDraftDirectEmail(opportunity.recipientEmail)) {
    return {
      ok: false,
      error:
        "No recruiter email address — email drafts/sends are forbidden for this listing.",
    };
  }

  try {
    if (!asDraft) {
      const sentToday = await countSendsToday(opportunity.accountId);
      const limit = await getDailySendLimit(opportunity.accountId);
      if (sentToday >= limit) {
        return {
          ok: false,
          error: `Daily auto-send limit reached (${limit})`,
        };
      }
    }

    const result = await dispatchOpportunityEmail(
      opportunity.accountId,
      opportunityId,
      { createDraftOnly: asDraft }
    );
    revalidatePath("/jobs");
    revalidatePath("/");
    return { ok: true, data: result };
  } catch (error) {
    console.error("sendOpportunityApplication failed", error);
    if (
      error instanceof InsufficientScopeError ||
      isInsufficientScopeError(error)
    ) {
      return { ok: false, error: REAUTH_REQUIRED_MESSAGE };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Dispatch failed",
    };
  }
}

export async function dismissOpportunity(
  opportunityId: string
): Promise<ActionResult> {
  const result = await dismissOpportunities([opportunityId]);
  return result.ok ? { ok: true } : result;
}

export async function markOpportunityExternalApplied(
  opportunityId: string
): Promise<ActionResult> {
  await prisma.jobOpportunity.update({
    where: { id: opportunityId },
    data: {
      status: "APPLIED",
      isArchived: false,
      previousStatus: null,
      appliedAt: new Date(),
    },
  });
  revalidatePath("/jobs");
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
  revalidatePath("/jobs");
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
    // Skip if already user-archived
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

  revalidatePath("/jobs");
  return { ok: true, data: { count } };
}

/**
 * Dismiss to History (Leads, Action Required, Applied, or user-Archived).
 * Sets DISMISSED + dismissedAt for retention countdown / auto-purge.
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

    // Preserve origin status if previously archived
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

  revalidatePath("/jobs");
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

  revalidatePath("/jobs");
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

  revalidatePath("/jobs");
  return { ok: true, data: { count: result.count } };
}
