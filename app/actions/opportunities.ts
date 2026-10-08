"use server";

import { revalidatePath } from "next/cache";

import { addExcludedTitle } from "@/app/actions/settings";
import { canDraftDirectEmail } from "@/lib/application-method";
import { cleanEmailPayload } from "@/lib/email/cleaner";
import {
  countSendsToday,
  dispatchOpportunityEmail,
  getDailySendLimit,
  getOpportunityResumeState,
  prepareOpportunityDraft,
  prepareOpportunityResume,
  refineOpportunityDraft,
  refineOpportunityResume,
  reorderResumeDraftNode,
  refineSingleResumeNode,
  compileResumeDocument,
  updateResumeDraftNode,
  updateOpportunityDraft,
  updateOpportunityRecipient,
  type MimeAttachment,
  type OpportunityResumePreview,
  type OpportunityResumeState,
} from "@/lib/opportunity-dispatch";
import {
  InsufficientScopeError,
  REAUTH_REQUIRED_MESSAGE,
  isInsufficientScopeError,
} from "@/lib/google";
import { prisma } from "@/lib/prisma";
import {
  projectInputSchema,
  skillsSchema,
  workExperienceInputSchema,
  type MasterProfileInput,
  type ProjectInput,
  type WorkExperienceInput,
} from "@/lib/validations/profile";
import { z } from "zod";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export type OriginalEmailPreview = {
  subject: string | null;
  fromName: string | null;
  fromEmail: string | null;
  date: Date | null;
  body: string;
};

export type DraftAttachmentInput = {
  filename: string;
  contentType: string;
  base64: string;
};

export type { OpportunityResumePreview, OpportunityResumeState };

const recipientEmailSchema = z.string().trim().email();

const draftAttachmentSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(200),
  /** Raw base64 (no data: URL prefix); ~10MB decoded ceiling. */
  base64: z.string().min(1).max(14_000_000),
});

const draftAttachmentsSchema = z.array(draftAttachmentSchema).max(10);

const reviewedExperiencesSchema = z.array(workExperienceInputSchema).max(30);
const reviewedProjectsSchema = z.array(projectInputSchema).max(30);

export type ReviewedResumeInput = {
  experiences: WorkExperienceInput[];
  projects?: ProjectInput[];
  tailoredSummary?: string | null;
  tailoredSkills?: MasterProfileInput["skills"];
  includeSummary?: boolean;
  attachResume?: boolean;
};

const originalEmailSelect = {
  subject: true,
  fromName: true,
  fromEmail: true,
  emailDate: true,
  rawBody: true,
  snippet: true,
} as const;

function mapOriginalEmail(
  emailMessage: {
    subject: string | null;
    fromName: string | null;
    fromEmail: string | null;
    emailDate: Date;
    rawBody: string | null;
    snippet: string | null;
  } | null
): OriginalEmailPreview | null {
  if (!emailMessage) return null;
  const raw = emailMessage.rawBody?.trim();
  const body = raw
    ? cleanEmailPayload(raw)
    : emailMessage.snippet?.trim() || "";
  return {
    subject: emailMessage.subject,
    fromName: emailMessage.fromName,
    fromEmail: emailMessage.fromEmail,
    date: emailMessage.emailDate,
    body,
  };
}

function decodeDraftAttachments(
  attachments: DraftAttachmentInput[] | undefined
): MimeAttachment[] {
  if (!attachments?.length) return [];
  const parsed = draftAttachmentsSchema.safeParse(attachments);
  if (!parsed.success) {
    throw new Error("Invalid attachment payload");
  }
  return parsed.data.map((item) => ({
    filename: item.filename,
    contentType: item.contentType || "application/octet-stream",
    content: Buffer.from(item.base64, "base64"),
  }));
}

export async function prepareOpportunityDraftForReview(
  opportunityId: string
): Promise<
  ActionResult<{
    subject: string;
    body: string;
    recipient: string | null;
    originalEmail: OriginalEmailPreview | null;
  }>
> {
  const opportunity = await prisma.jobOpportunity.findUnique({
    where: { id: opportunityId },
    include: {
      emailMessage: { select: originalEmailSelect },
    },
  });
  if (!opportunity) {
    return { ok: false, error: "Opportunity not found" };
  }

  const originalEmail = mapOriginalEmail(opportunity.emailMessage);

  try {
    if (
      opportunity.draftSubject?.trim() &&
      opportunity.draftBody?.trim() &&
      (opportunity.status === "REVIEW_READY" ||
        opportunity.status === "DISCOVERED")
    ) {
      return {
        ok: true,
        data: {
          subject: opportunity.draftSubject,
          body: opportunity.draftBody,
          recipient: opportunity.recipientEmail,
          originalEmail,
        },
      };
    }

    const draft = await prepareOpportunityDraft(
      opportunity.accountId,
      opportunityId
    );
    revalidatePath("/jobs");
    return { ok: true, data: { ...draft, originalEmail } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to prepare draft",
    };
  }
}

/** Force a fresh LLM draft (ignores cached draftSubject/draftBody). */
export async function regenerateOpportunityDraftAction(
  opportunityId: string
): Promise<
  ActionResult<{ subject: string; body: string; recipient: string | null }>
> {
  const opportunity = await prisma.jobOpportunity.findUnique({
    where: { id: opportunityId },
  });
  if (!opportunity) {
    return { ok: false, error: "Opportunity not found" };
  }

  try {
    const draft = await prepareOpportunityDraft(
      opportunity.accountId,
      opportunityId
    );
    revalidatePath("/jobs");
    return { ok: true, data: draft };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to regenerate draft",
    };
  }
}

export async function refineOpportunityDraftAction(
  opportunityId: string,
  instruction: string
): Promise<ActionResult<{ subject: string; body: string }>> {
  const opportunity = await prisma.jobOpportunity.findUnique({
    where: { id: opportunityId },
  });
  if (!opportunity) {
    return { ok: false, error: "Opportunity not found" };
  }

  try {
    const draft = await refineOpportunityDraft(
      opportunity.accountId,
      opportunityId,
      instruction
    );
    revalidatePath("/jobs");
    return { ok: true, data: draft };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to refine draft",
    };
  }
}

export async function updateOpportunityRecipientAction(
  opportunityId: string,
  recipientEmail: string
): Promise<ActionResult<{ recipientEmail: string }>> {
  const parsed = recipientEmailSchema.safeParse(recipientEmail);
  if (!parsed.success) {
    return { ok: false, error: "Invalid recipient email address" };
  }

  const opportunity = await prisma.jobOpportunity.findUnique({
    where: { id: opportunityId },
  });
  if (!opportunity) {
    return { ok: false, error: "Opportunity not found" };
  }

  try {
    const data = await updateOpportunityRecipient(
      opportunity.accountId,
      opportunityId,
      parsed.data
    );
    revalidatePath("/jobs");
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to update recipient",
    };
  }
}

export async function saveOpportunityDraftEdits(
  opportunityId: string,
  input: { subject: string; body: string; recipientEmail?: string }
): Promise<ActionResult> {
  const opportunity = await prisma.jobOpportunity.findUnique({
    where: { id: opportunityId },
  });
  if (!opportunity) {
    return { ok: false, error: "Opportunity not found" };
  }

  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject || !body) {
    return { ok: false, error: "Subject and body are required" };
  }

  if (input.recipientEmail !== undefined && input.recipientEmail.trim()) {
    const parsed = recipientEmailSchema.safeParse(input.recipientEmail);
    if (!parsed.success) {
      return { ok: false, error: "Invalid recipient email address" };
    }
  }

  const effectiveRecipient =
    input.recipientEmail !== undefined
      ? input.recipientEmail.trim()
      : opportunity.recipientEmail;
  if (!canDraftDirectEmail(effectiveRecipient)) {
    return {
      ok: false,
      error: "Add a valid recruiter email in the To field before saving.",
    };
  }

  try {
    await updateOpportunityDraft(opportunity.accountId, opportunityId, {
      subject,
      body,
      ...(input.recipientEmail !== undefined
        ? { recipientEmail: input.recipientEmail }
        : {}),
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

/** Load cached tailored resume (if any) + settings default for Include Summary. */
export async function getOpportunityResumeStateAction(
  opportunityId: string
): Promise<ActionResult<OpportunityResumeState>> {
  const opportunity = await prisma.jobOpportunity.findUnique({
    where: { id: opportunityId },
    select: { id: true, accountId: true },
  });
  if (!opportunity) {
    return { ok: false, error: "Opportunity not found" };
  }

  try {
    const data = await getOpportunityResumeState(
      opportunity.accountId,
      opportunityId
    );
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to load resume state",
    };
  }
}

/**
 * Read-only resume load: returns cached PDF or null.
 * Does not call Ollama — use generateOpportunityResumeAction to create one.
 */
export async function prepareOpportunityResumeForReview(
  opportunityId: string,
  includeSummary = false
): Promise<ActionResult<OpportunityResumePreview | null>> {
  const opportunity = await prisma.jobOpportunity.findUnique({
    where: { id: opportunityId },
    select: { id: true, accountId: true },
  });
  if (!opportunity) {
    return { ok: false, error: "Opportunity not found" };
  }

  try {
    const data = await prepareOpportunityResume(
      opportunity.accountId,
      opportunityId,
      { includeSummary, forceRegenerate: false }
    );
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to prepare resume",
    };
  }
}

/** Explicit Generate / Regenerate — always runs tailor and persists cache. */
export async function generateOpportunityResumeAction(
  opportunityId: string,
  includeSummary = false
): Promise<ActionResult<OpportunityResumePreview>> {
  const opportunity = await prisma.jobOpportunity.findUnique({
    where: { id: opportunityId },
    select: { id: true, accountId: true },
  });
  if (!opportunity) {
    return { ok: false, error: "Opportunity not found" };
  }

  try {
    const data = await prepareOpportunityResume(
      opportunity.accountId,
      opportunityId,
      { includeSummary, forceRegenerate: true }
    );
    if (!data) {
      return { ok: false, error: "Failed to generate resume" };
    }
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to generate resume",
    };
  }
}

export async function regenerateOpportunityResumeAction(
  opportunityId: string,
  includeSummary = false
): Promise<ActionResult<OpportunityResumePreview>> {
  return generateOpportunityResumeAction(opportunityId, includeSummary);
}

export async function updateResumeDraftNodeAction(
  opportunityId: string,
  nodeId: string,
  patch: { content?: string; selected?: boolean }
): Promise<ActionResult<OpportunityResumePreview>> {
  const opportunity = await prisma.jobOpportunity.findUnique({
    where: { id: opportunityId },
    select: { id: true, accountId: true },
  });
  if (!opportunity) {
    return { ok: false, error: "Opportunity not found" };
  }
  try {
    const data = await updateResumeDraftNode(
      opportunity.accountId,
      opportunityId,
      nodeId,
      patch
    );
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to update resume line",
    };
  }
}

export async function reorderResumeDraftNodeAction(
  opportunityId: string,
  nodeId: string,
  direction: "up" | "down"
): Promise<ActionResult<OpportunityResumePreview>> {
  const opportunity = await prisma.jobOpportunity.findUnique({
    where: { id: opportunityId },
    select: { id: true, accountId: true },
  });
  if (!opportunity) {
    return { ok: false, error: "Opportunity not found" };
  }
  try {
    const data = await reorderResumeDraftNode(
      opportunity.accountId,
      opportunityId,
      nodeId,
      direction
    );
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to reorder resume line",
    };
  }
}

export async function refineSingleResumeNodeAction(
  opportunityId: string,
  nodeId: string,
  instruction: string
): Promise<ActionResult<OpportunityResumePreview>> {
  const opportunity = await prisma.jobOpportunity.findUnique({
    where: { id: opportunityId },
    select: { id: true, accountId: true },
  });
  if (!opportunity) {
    return { ok: false, error: "Opportunity not found" };
  }
  try {
    const data = await refineSingleResumeNode(
      opportunity.accountId,
      opportunityId,
      nodeId,
      instruction
    );
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to refine resume line",
    };
  }
}

export async function compileResumeDocumentAction(
  opportunityId: string,
  format: "pdf" | "docx" = "pdf"
): Promise<ActionResult<OpportunityResumePreview>> {
  const opportunity = await prisma.jobOpportunity.findUnique({
    where: { id: opportunityId },
    select: { id: true, accountId: true },
  });
  if (!opportunity) {
    return { ok: false, error: "Opportunity not found" };
  }
  try {
    const data = await compileResumeDocument(
      opportunity.accountId,
      opportunityId,
      format
    );
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to export resume",
    };
  }
}

export async function refineOpportunityResumeAction(
  opportunityId: string,
  instruction: string,
  previousExperiences?: WorkExperienceInput[] | null,
  includeSummary = false
): Promise<ActionResult<OpportunityResumePreview>> {
  const opportunity = await prisma.jobOpportunity.findUnique({
    where: { id: opportunityId },
    select: { id: true, accountId: true },
  });
  if (!opportunity) {
    return { ok: false, error: "Opportunity not found" };
  }

  try {
    const previous = previousExperiences
      ? reviewedExperiencesSchema.parse(previousExperiences)
      : null;
    const data = await refineOpportunityResume(
      opportunity.accountId,
      opportunityId,
      instruction,
      previous,
      includeSummary
    );
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to refine resume",
    };
  }
}

export async function sendOpportunityApplication(
  opportunityId: string,
  asDraft = false,
  attachments?: DraftAttachmentInput[],
  reviewedResume?: ReviewedResumeInput | WorkExperienceInput[] | null
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

    const extraAttachments = decodeDraftAttachments(attachments);
    const normalizedResume: ReviewedResumeInput | null = Array.isArray(
      reviewedResume
    )
      ? { experiences: reviewedResume }
      : reviewedResume ?? null;
    const experiences = normalizedResume
      ? reviewedExperiencesSchema.parse(normalizedResume.experiences)
      : null;
    const projects = normalizedResume?.projects
      ? reviewedProjectsSchema.parse(normalizedResume.projects)
      : null;
    const skills = normalizedResume?.tailoredSkills
      ? skillsSchema.parse(normalizedResume.tailoredSkills)
      : null;
    const includeSummary = normalizedResume?.includeSummary === true;
    const attachResume =
      typeof normalizedResume?.attachResume === "boolean"
        ? normalizedResume.attachResume
        : undefined;
    const result = await dispatchOpportunityEmail(
      opportunity.accountId,
      opportunityId,
      {
        createDraftOnly: asDraft,
        extraAttachments,
        reviewedExperiences: experiences,
        reviewedProjects: projects,
        reviewedSummary: normalizedResume?.tailoredSummary ?? null,
        reviewedSkills: skills,
        includeSummary,
        attachResume,
      }
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
  revalidatePath("/jobs");
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
