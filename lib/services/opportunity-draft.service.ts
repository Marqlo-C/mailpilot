import { canDraftDirectEmail } from "@/lib/opportunities/application-method";
import { cleanEmailPayload } from "@/lib/ai/email-cleaner";
import {
  countSendsToday,
  dispatchOpportunityEmail,
  getDailySendLimit,
  getOpportunityResumeState,
  hydrateOpportunitySpec,
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
} from "@/lib/opportunities/dispatch";
import {
  InsufficientScopeError,
  REAUTH_REQUIRED_MESSAGE,
  isInsufficientScopeError,
} from "@/lib/gmail/google";
import { prisma } from "@/lib/core/prisma";
import {
  projectInputSchema,
  skillsSchema,
  workExperienceInputSchema,
  type MasterProfileInput,
  type ProjectInput,
  type WorkExperienceInput,
} from "@/lib/validations/profile.schema";
import {
  recipientEmailSchema,
  draftAttachmentsSchema,
  type DraftAttachment,
  type DraftAttachments,
} from "@/lib/validations/opportunity.schema";
import { z } from "zod";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export type OriginalEmailPreview = {
  messageId?: string | null;
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
export type { DraftAttachment, DraftAttachments };

export const reviewedExperiencesSchema = z.array(workExperienceInputSchema).max(30);
export const reviewedProjectsSchema = z.array(projectInputSchema).max(30);

export type ReviewedResumeInput = {
  experiences: WorkExperienceInput[];
  projects?: ProjectInput[];
  tailoredSummary?: string | null;
  tailoredSkills?: MasterProfileInput["skills"];
  includeSummary?: boolean;
  attachResume?: boolean;
};

export const originalEmailSelect = {
  messageId: true,
  subject: true,
  fromName: true,
  fromEmail: true,
  emailDate: true,
  rawBody: true,
  snippet: true,
} as const;

export function mapOriginalEmail(
  emailMessage: {
    messageId: string;
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
    messageId: emailMessage.messageId,
    subject: emailMessage.subject,
    fromName: emailMessage.fromName,
    fromEmail: emailMessage.fromEmail,
    date: emailMessage.emailDate,
    body,
  };
}

export function decodeDraftAttachments(
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
    return { ok: true, data: { ...draft, originalEmail } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to prepare draft",
    };
  }
}

/** Retrieve Gmail messageId for an opportunity to view original email on demand. */
export async function getOpportunityMessageId(
  opportunityId: string
): Promise<
  ActionResult<{
    messageId: string;
    subject: string | null;
    from: string | null;
  }>
> {
  const opportunity = await prisma.jobOpportunity.findUnique({
    where: { id: opportunityId },
    include: {
      emailMessage: {
        select: {
          messageId: true,
          subject: true,
          fromName: true,
          fromEmail: true,
        },
      },
    },
  });
  if (!opportunity?.emailMessage?.messageId) {
    return { ok: false, error: "Original email not found" };
  }
  return {
    ok: true,
    data: {
      messageId: opportunity.emailMessage.messageId,
      subject: opportunity.emailMessage.subject,
      from:
        [
          opportunity.emailMessage.fromName,
          opportunity.emailMessage.fromEmail,
        ]
          .filter(Boolean)
          .join(" · ") || null,
    },
  };
}

/** Force a fresh LLM draft (ignores cached draftSubject/draftBody). */
export async function regenerateOpportunityDraft(
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
    return { ok: true, data: draft };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to regenerate draft",
    };
  }
}

export async function refineOpportunityDraftService(
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
    return { ok: true, data: draft };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to refine draft",
    };
  }
}

export async function updateOpportunityRecipientService(
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
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to update recipient",
    };
  }
}

export async function saveOpportunityDraftEditsService(
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
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to save draft",
    };
  }
}

/** Load cached tailored resume (if any) + settings default for Include Summary. */
export async function getOpportunityResumeStateService(
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
  includeSummary = true
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

/** On-Demand spec hydration via HasData BYOK key. */
export async function hydrateOpportunitySpecService(
  opportunityId: string
): Promise<ActionResult<{ upgraded: boolean; message: string }>> {
  const opportunity = await prisma.jobOpportunity.findUnique({
    where: { id: opportunityId },
    select: { id: true, accountId: true },
  });
  if (!opportunity) {
    return { ok: false, error: "Opportunity not found" };
  }

  try {
    const result = await hydrateOpportunitySpec(
      opportunity.accountId,
      opportunityId
    );
    if (!result.ok) {
      return { ok: false, error: result.message };
    }
    return { ok: true, data: { upgraded: result.upgraded, message: result.message } };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to hydrate spec",
    };
  }
}

export async function generateOpportunityResumeService(
  opportunityId: string,
  includeSummary = true,
  inventMetrics?: boolean,
  devModelOverride?: string | null
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
      { includeSummary, forceRegenerate: true, inventMetrics, devModelOverride }
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

export async function updateResumeDraftNodeService(
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

export async function reorderResumeDraftNodeService(
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

export async function refineSingleResumeNodeService(
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

export async function compileResumeDocumentService(
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

export async function refineOpportunityResumeService(
  opportunityId: string,
  instruction: string,
  previousExperiences?: WorkExperienceInput[] | null,
  includeSummary = true,
  inventMetrics?: boolean,
  devModelOverride?: string | null
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
      includeSummary,
      inventMetrics,
      devModelOverride
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

export async function sendOpportunityApplicationService(
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
