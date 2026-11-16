"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/core/auth";
import type { WorkExperienceInput } from "@/lib/validations/profile.schema";
import type {
  DraftAttachment,
  DraftAttachments,
} from "@/lib/validations/opportunity.schema";
import {
  idParamSchema,
  idsArraySchema,
  instructionParamSchema,
  actionError,
  actionSuccess,
  type ServerActionResult,
  type ActionResult,
} from "@/lib/validations/action.schema";
import {
  type OriginalEmailPreview,
  type DraftAttachmentInput,
  type OpportunityResumePreview,
  type OpportunityResumeState,
  type ReviewedResumeInput,
  prepareOpportunityDraftForReview as prepareOpportunityDraftForReviewService,
  getOpportunityMessageId as getOpportunityMessageIdService,
  regenerateOpportunityDraft as regenerateOpportunityDraftService,
  refineOpportunityDraftService,
  updateOpportunityRecipientService,
  saveOpportunityDraftEditsService,
  getOpportunityResumeStateService,
  prepareOpportunityResumeForReview as prepareOpportunityResumeForReviewService,
  hydrateOpportunitySpecService,
  generateOpportunityResumeService,
  updateResumeDraftNodeService,
  reorderResumeDraftNodeService,
  refineSingleResumeNodeService,
  compileResumeDocumentService,
  refineOpportunityResumeService,
  sendOpportunityApplicationService,
} from "@/lib/services/opportunity-draft.service";
import {
  dismissOpportunity as dismissOpportunityService,
  dismissOpportunities as dismissOpportunitiesService,
  markOpportunitiesExternalApplied as markOpportunitiesExternalAppliedService,
  markOpportunityExternalApplied as markOpportunityExternalAppliedService,
  markLessLikeThis as markLessLikeThisService,
  unmarkApplied as unmarkAppliedService,
  dismissActionRequired as dismissActionRequiredService,
  restoreFromHistory as restoreFromHistoryService,
  deleteOpportunityPermanently as deleteOpportunityPermanentlyService,
  archiveOpportunities as archiveOpportunitiesService,
  restoreOpportunities as restoreOpportunitiesService,
  deleteDismissedPermanently as deleteDismissedPermanentlyService,
  reprocessOpportunityEmail as reprocessOpportunityEmailService,
} from "@/lib/services/opportunity-lifecycle.service";

export type {
  ActionResult,
  OriginalEmailPreview,
  DraftAttachmentInput,
  OpportunityResumePreview,
  OpportunityResumeState,
  ReviewedResumeInput,
  DraftAttachment,
  DraftAttachments,
  ServerActionResult,
};

async function checkAuthSession(): Promise<ServerActionResult<string>> {
  const session = await auth();
  if (!session) return actionError("Unauthorized");
  return actionSuccess(session.accountId);
}

export async function prepareOpportunityDraftForReview(
  opportunityId: string
): Promise<
  ServerActionResult<{
    subject: string;
    body: string;
    recipient: string | null;
    originalEmail: OriginalEmailPreview | null;
  }>
> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const parsed = idParamSchema.safeParse(opportunityId);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid opportunity ID");

  const result = await prepareOpportunityDraftForReviewService(parsed.data);
  if (result.ok) revalidatePath("/jobs");
  return result.ok
    ? actionSuccess(result.data!)
    : actionError(result.error ?? "Failed to prepare opportunity draft");
}

export async function getOpportunityMessageIdAction(
  opportunityId: string
): Promise<ServerActionResult<{ messageId: string; subject: string | null; from: string | null; } | null>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const parsed = idParamSchema.safeParse(opportunityId);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid opportunity ID");

  const result = await getOpportunityMessageIdService(parsed.data);
  return result.ok
    ? actionSuccess(result.data ?? null)
    : actionError(result.error ?? "Failed to retrieve message ID");
}

export async function regenerateOpportunityDraftAction(
  opportunityId: string
): Promise<ServerActionResult<{ subject: string; body: string; recipient: string | null }>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const parsed = idParamSchema.safeParse(opportunityId);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid opportunity ID");

  const result = await regenerateOpportunityDraftService(parsed.data);
  if (result.ok) revalidatePath("/jobs");
  return result.ok
    ? actionSuccess(result.data!)
    : actionError(result.error ?? "Failed to regenerate draft");
}

export async function refineOpportunityDraftAction(
  opportunityId: string,
  instruction: string
): Promise<ServerActionResult<{ subject: string; body: string }>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const idParsed = idParamSchema.safeParse(opportunityId);
  if (!idParsed.success) return actionError(idParsed.error.issues[0]?.message ?? "Invalid opportunity ID");

  const instrParsed = instructionParamSchema.safeParse(instruction);
  if (!instrParsed.success) return actionError(instrParsed.error.issues[0]?.message ?? "Invalid instruction");

  const result = await refineOpportunityDraftService(idParsed.data, instrParsed.data);
  if (result.ok) revalidatePath("/jobs");
  return result.ok
    ? actionSuccess(result.data!)
    : actionError(result.error ?? "Failed to refine draft");
}

export async function updateOpportunityRecipientAction(
  opportunityId: string,
  recipientEmail: string
): Promise<ServerActionResult<{ recipientEmail: string }>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const idParsed = idParamSchema.safeParse(opportunityId);
  if (!idParsed.success) return actionError(idParsed.error.issues[0]?.message ?? "Invalid opportunity ID");

  const emailParsed = z.string().trim().email("Invalid recipient email address").safeParse(recipientEmail);
  if (!emailParsed.success) return actionError(emailParsed.error.issues[0]?.message ?? "Invalid email address");

  const result = await updateOpportunityRecipientService(idParsed.data, emailParsed.data);
  if (result.ok) revalidatePath("/jobs");
  return result.ok
    ? actionSuccess(result.data!)
    : actionError(result.error ?? "Failed to update recipient email");
}

export async function saveOpportunityDraftEdits(
  opportunityId: string,
  input: { subject: string; body: string; recipientEmail?: string }
): Promise<ServerActionResult<{ subject: string; body: string; recipient: string | null }>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const idParsed = idParamSchema.safeParse(opportunityId);
  if (!idParsed.success) return actionError(idParsed.error.issues[0]?.message ?? "Invalid opportunity ID");

  const draftSchema = z.object({
    subject: z.string().trim().min(1, "Subject cannot be empty"),
    body: z.string().trim().min(1, "Body cannot be empty"),
    recipientEmail: z.string().trim().email().optional(),
  });
  const inputParsed = draftSchema.safeParse(input);
  if (!inputParsed.success) {
    return actionError(inputParsed.error.issues.map((i) => i.message).join("; "));
  }

  const result = await saveOpportunityDraftEditsService(idParsed.data, inputParsed.data);
  if (result.ok) revalidatePath("/jobs");
  return result.ok
    ? actionSuccess(result.data!)
    : actionError(result.error ?? "Failed to save draft edits");
}

export async function getOpportunityResumeStateAction(
  opportunityId: string
): Promise<ServerActionResult<OpportunityResumeState>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const parsed = idParamSchema.safeParse(opportunityId);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid opportunity ID");

  const result = await getOpportunityResumeStateService(parsed.data);
  return result.ok
    ? actionSuccess(result.data!)
    : actionError(result.error ?? "Failed to get resume state");
}

export async function prepareOpportunityResumeForReview(
  opportunityId: string,
  includeSummary = true
): Promise<ServerActionResult<OpportunityResumePreview>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const parsed = idParamSchema.safeParse(opportunityId);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid opportunity ID");

  const result = await prepareOpportunityResumeForReviewService(parsed.data, includeSummary);
  return result.ok
    ? actionSuccess(result.data!)
    : actionError(result.error ?? "Failed to prepare resume preview");
}

export async function hydrateOpportunitySpecAction(
  opportunityId: string
): Promise<ServerActionResult<void>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const parsed = idParamSchema.safeParse(opportunityId);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid opportunity ID");

  const result = await hydrateOpportunitySpecService(parsed.data);
  if (result.ok) revalidatePath("/jobs");
  return result.ok
    ? actionSuccess(undefined)
    : actionError(result.error ?? "Failed to hydrate opportunity spec");
}

export async function generateOpportunityResumeAction(
  opportunityId: string,
  includeSummary = true,
  inventMetrics?: boolean,
  devModelOverride?: string | null
): Promise<ServerActionResult<OpportunityResumePreview>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const parsed = idParamSchema.safeParse(opportunityId);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid opportunity ID");

  const result = await generateOpportunityResumeService(
    parsed.data,
    includeSummary,
    inventMetrics,
    devModelOverride
  );
  return result.ok
    ? actionSuccess(result.data!)
    : actionError(result.error ?? "Failed to generate resume");
}

export async function regenerateOpportunityResumeAction(
  opportunityId: string,
  includeSummary = true,
  inventMetrics?: boolean,
  devModelOverride?: string | null
): Promise<ServerActionResult<OpportunityResumePreview>> {
  return generateOpportunityResumeAction(opportunityId, includeSummary, inventMetrics, devModelOverride);
}

export async function updateResumeDraftNodeAction(
  opportunityId: string,
  nodeId: string,
  patch: { content?: string; selected?: boolean }
): Promise<ServerActionResult<OpportunityResumePreview>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const idParsed = idParamSchema.safeParse(opportunityId);
  const nodeParsed = idParamSchema.safeParse(nodeId);
  if (!idParsed.success || !nodeParsed.success) {
    return actionError("Invalid opportunity or node identifier");
  }

  const patchSchema = z.object({
    content: z.string().optional(),
    selected: z.boolean().optional(),
  });
  const patchParsed = patchSchema.safeParse(patch);
  if (!patchParsed.success) {
    return actionError(patchParsed.error.issues.map((i) => i.message).join("; "));
  }

  const result = await updateResumeDraftNodeService(idParsed.data, nodeParsed.data, patchParsed.data);
  return result.ok
    ? actionSuccess(result.data!)
    : actionError(result.error ?? "Failed to update node");
}

export async function reorderResumeDraftNodeAction(
  opportunityId: string,
  nodeId: string,
  direction: "up" | "down"
): Promise<ServerActionResult<OpportunityResumePreview>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const idParsed = idParamSchema.safeParse(opportunityId);
  const nodeParsed = idParamSchema.safeParse(nodeId);
  const dirParsed = z.enum(["up", "down"]).safeParse(direction);
  if (!idParsed.success || !nodeParsed.success || !dirParsed.success) {
    return actionError("Invalid reorder parameters");
  }

  const result = await reorderResumeDraftNodeService(idParsed.data, nodeParsed.data, dirParsed.data);
  return result.ok
    ? actionSuccess(result.data!)
    : actionError(result.error ?? "Failed to reorder node");
}

export async function refineSingleResumeNodeAction(
  opportunityId: string,
  nodeId: string,
  instruction: string
): Promise<ServerActionResult<OpportunityResumePreview>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const idParsed = idParamSchema.safeParse(opportunityId);
  const nodeParsed = idParamSchema.safeParse(nodeId);
  const instrParsed = instructionParamSchema.safeParse(instruction);
  if (!idParsed.success || !nodeParsed.success || !instrParsed.success) {
    return actionError("Invalid node refinement parameters");
  }

  const result = await refineSingleResumeNodeService(idParsed.data, nodeParsed.data, instrParsed.data);
  return result.ok
    ? actionSuccess(result.data!)
    : actionError(result.error ?? "Failed to refine node");
}

export async function compileResumeDocumentAction(
  opportunityId: string,
  format: "pdf" | "docx" = "pdf"
): Promise<ServerActionResult<OpportunityResumePreview>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const idParsed = idParamSchema.safeParse(opportunityId);
  const formatParsed = z.enum(["pdf", "docx"]).safeParse(format);
  if (!idParsed.success || !formatParsed.success) {
    return actionError("Invalid compilation parameters");
  }

  const result = await compileResumeDocumentService(idParsed.data, formatParsed.data);
  return result.ok
    ? actionSuccess(result.data!)
    : actionError(result.error ?? "Failed to compile document");
}

export async function refineOpportunityResumeAction(
  opportunityId: string,
  instruction: string,
  previousExperiences?: WorkExperienceInput[] | null,
  includeSummary = true,
  inventMetrics?: boolean,
  devModelOverride?: string | null
): Promise<ServerActionResult<OpportunityResumePreview>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const idParsed = idParamSchema.safeParse(opportunityId);
  const instrParsed = instructionParamSchema.safeParse(instruction);
  if (!idParsed.success || !instrParsed.success) {
    return actionError("Invalid refinement parameters");
  }

  const result = await refineOpportunityResumeService(
    idParsed.data,
    instrParsed.data,
    previousExperiences,
    includeSummary,
    inventMetrics,
    devModelOverride
  );
  return result.ok
    ? actionSuccess(result.data!)
    : actionError(result.error ?? "Failed to refine resume");
}

export async function sendOpportunityApplication(
  opportunityId: string,
  asDraft = false,
  attachments?: DraftAttachmentInput[],
  reviewedResume?: ReviewedResumeInput | WorkExperienceInput[] | null
): Promise<ServerActionResult<{ mode: "draft" | "sent" }>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const parsed = idParamSchema.safeParse(opportunityId);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid opportunity ID");

  const result = await sendOpportunityApplicationService(
    parsed.data,
    asDraft,
    attachments,
    reviewedResume
  );
  if (result.ok) {
    revalidatePath("/jobs");
    revalidatePath("/");
  }
  return result.ok
    ? actionSuccess(result.data!)
    : actionError(result.error ?? "Failed to send opportunity application");
}

export async function dismissOpportunity(
  opportunityId: string
): Promise<ServerActionResult<void>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const parsed = idParamSchema.safeParse(opportunityId);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid opportunity ID");

  const result = await dismissOpportunityService(parsed.data);
  if (result.ok) revalidatePath("/jobs");
  return result.ok ? actionSuccess(undefined) : actionError(result.error ?? "Failed to dismiss opportunity");
}

export async function markOpportunitiesExternalApplied(
  ids: string[]
): Promise<ServerActionResult<{ count: number }>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const parsed = idsArraySchema.safeParse(ids);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid IDs array");

  const result = await markOpportunitiesExternalAppliedService(parsed.data);
  if (result.ok) revalidatePath("/jobs");
  return result.ok ? actionSuccess(result.data ?? { count: parsed.data.length }) : actionError(result.error ?? "Failed to mark applied");
}

export async function markOpportunityExternalApplied(
  opportunityId: string
): Promise<ServerActionResult<void>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const parsed = idParamSchema.safeParse(opportunityId);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid opportunity ID");

  const result = await markOpportunityExternalAppliedService(parsed.data);
  if (result.ok) revalidatePath("/jobs");
  return result.ok ? actionSuccess(undefined) : actionError(result.error ?? "Failed to mark applied");
}

export async function markLessLikeThis(
  opportunityId: string
): Promise<ServerActionResult<void>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const parsed = idParamSchema.safeParse(opportunityId);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid opportunity ID");

  const result = await markLessLikeThisService(parsed.data);
  if (result.ok) revalidatePath("/jobs");
  return result.ok ? actionSuccess(undefined) : actionError(result.error ?? "Failed to mark less like this");
}

export async function unmarkApplied(
  opportunityId: string
): Promise<ServerActionResult<void>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const parsed = idParamSchema.safeParse(opportunityId);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid opportunity ID");

  const result = await unmarkAppliedService(parsed.data);
  if (result.ok) revalidatePath("/jobs");
  return result.ok ? actionSuccess(undefined) : actionError(result.error ?? "Failed to unmark applied");
}

export async function dismissActionRequired(
  opportunityId: string
): Promise<ServerActionResult<void>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const parsed = idParamSchema.safeParse(opportunityId);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid opportunity ID");

  const result = await dismissActionRequiredService(parsed.data);
  if (result.ok) revalidatePath("/jobs");
  return result.ok ? actionSuccess(undefined) : actionError(result.error ?? "Failed to dismiss action required");
}

export async function restoreFromHistory(
  opportunityId: string
): Promise<ServerActionResult<void>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const parsed = idParamSchema.safeParse(opportunityId);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid opportunity ID");

  const result = await restoreFromHistoryService(parsed.data);
  if (result.ok) revalidatePath("/jobs");
  return result.ok ? actionSuccess(undefined) : actionError(result.error ?? "Failed to restore opportunity");
}

export async function deleteOpportunityPermanently(
  opportunityId: string
): Promise<ServerActionResult<void>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const parsed = idParamSchema.safeParse(opportunityId);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid opportunity ID");

  const result = await deleteOpportunityPermanentlyService(parsed.data);
  if (result.ok) revalidatePath("/jobs");
  return result.ok ? actionSuccess(undefined) : actionError(result.error ?? "Failed to delete opportunity");
}

export async function archiveOpportunities(
  ids: string[]
): Promise<ServerActionResult<{ count: number }>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const parsed = idsArraySchema.safeParse(ids);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid IDs array");

  const result = await archiveOpportunitiesService(parsed.data);
  if (result.ok) revalidatePath("/jobs");
  return result.ok ? actionSuccess(result.data ?? { count: parsed.data.length }) : actionError(result.error ?? "Failed to archive");
}

export async function dismissOpportunities(
  ids: string[]
): Promise<ServerActionResult<{ count: number }>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const parsed = idsArraySchema.safeParse(ids);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid IDs array");

  const result = await dismissOpportunitiesService(parsed.data);
  if (result.ok) revalidatePath("/jobs");
  return result.ok ? actionSuccess(result.data ?? { count: parsed.data.length }) : actionError(result.error ?? "Failed to dismiss");
}

export async function restoreOpportunities(
  ids: string[]
): Promise<ServerActionResult<{ count: number }>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const parsed = idsArraySchema.safeParse(ids);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid IDs array");

  const result = await restoreOpportunitiesService(parsed.data);
  if (result.ok) revalidatePath("/jobs");
  return result.ok ? actionSuccess(result.data ?? { count: parsed.data.length }) : actionError(result.error ?? "Failed to restore");
}

export async function deleteDismissedPermanently(
  ids: string[]
): Promise<ServerActionResult<{ count: number }>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const parsed = idsArraySchema.safeParse(ids);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid IDs array");

  const result = await deleteDismissedPermanentlyService(parsed.data);
  if (result.ok) revalidatePath("/jobs");
  return result.ok ? actionSuccess(result.data ?? { count: parsed.data.length }) : actionError(result.error ?? "Failed to delete");
}

export async function reprocessOpportunityEmailAction(
  opportunityId: string
): Promise<
  ServerActionResult<{
    messageId: string;
    createdCount: number;
    updatedCount: number;
    opportunitiesUpserted: number;
  }>
> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const parsed = idParamSchema.safeParse(opportunityId);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid opportunity ID");

  const result = await reprocessOpportunityEmailService(parsed.data);
  if (result.ok) {
    revalidatePath("/");
    revalidatePath("/jobs");
  }
  return result.ok ? actionSuccess(result.data!) : actionError(result.error ?? "Failed to reprocess email");
}
