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
  await prisma.jobOpportunity.update({
    where: { id: opportunityId },
    data: { status: "DISMISSED" },
  });
  revalidatePath("/jobs");
  return { ok: true };
}

export async function markOpportunityExternalApplied(
  opportunityId: string
): Promise<ActionResult> {
  await prisma.jobOpportunity.update({
    where: { id: opportunityId },
    data: { status: "APPLIED" },
  });
  revalidatePath("/jobs");
  return { ok: true };
}
