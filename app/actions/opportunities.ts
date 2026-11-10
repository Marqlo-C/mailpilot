"use server";

import { revalidatePath } from "next/cache";
import type { WorkExperienceInput } from "@/lib/validations/profile";
import type {
  DraftAttachment,
  DraftAttachments,
} from "@/lib/validations/opportunity";
import {
  type ActionResult,
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
};

export async function prepareOpportunityDraftForReview(opportunityId: string) {
  const result = await prepareOpportunityDraftForReviewService(opportunityId);
  if (result.ok) revalidatePath("/jobs");
  return result;
}

export async function getOpportunityMessageIdAction(opportunityId: string) {
  return getOpportunityMessageIdService(opportunityId);
}

export async function regenerateOpportunityDraftAction(opportunityId: string) {
  const result = await regenerateOpportunityDraftService(opportunityId);
  if (result.ok) revalidatePath("/jobs");
  return result;
}

export async function refineOpportunityDraftAction(opportunityId: string, instruction: string) {
  const result = await refineOpportunityDraftService(opportunityId, instruction);
  if (result.ok) revalidatePath("/jobs");
  return result;
}

export async function updateOpportunityRecipientAction(opportunityId: string, recipientEmail: string) {
  const result = await updateOpportunityRecipientService(opportunityId, recipientEmail);
  if (result.ok) revalidatePath("/jobs");
  return result;
}

export async function saveOpportunityDraftEdits(opportunityId: string, input: { subject: string; body: string; recipientEmail?: string }) {
  const result = await saveOpportunityDraftEditsService(opportunityId, input);
  if (result.ok) revalidatePath("/jobs");
  return result;
}

export async function getOpportunityResumeStateAction(opportunityId: string) {
  return getOpportunityResumeStateService(opportunityId);
}

export async function prepareOpportunityResumeForReview(opportunityId: string, includeSummary = true) {
  return prepareOpportunityResumeForReviewService(opportunityId, includeSummary);
}

export async function hydrateOpportunitySpecAction(opportunityId: string) {
  const result = await hydrateOpportunitySpecService(opportunityId);
  if (result.ok) revalidatePath("/jobs");
  return result;
}

export async function generateOpportunityResumeAction(opportunityId: string, includeSummary = true, inventMetrics?: boolean, devModelOverride?: string | null) {
  return generateOpportunityResumeService(opportunityId, includeSummary, inventMetrics, devModelOverride);
}

export async function regenerateOpportunityResumeAction(opportunityId: string, includeSummary = true, inventMetrics?: boolean, devModelOverride?: string | null) {
  return generateOpportunityResumeAction(opportunityId, includeSummary, inventMetrics, devModelOverride);
}

export async function updateResumeDraftNodeAction(opportunityId: string, nodeId: string, patch: { content?: string; selected?: boolean }) {
  return updateResumeDraftNodeService(opportunityId, nodeId, patch);
}

export async function reorderResumeDraftNodeAction(opportunityId: string, nodeId: string, direction: "up" | "down") {
  return reorderResumeDraftNodeService(opportunityId, nodeId, direction);
}

export async function refineSingleResumeNodeAction(opportunityId: string, nodeId: string, instruction: string) {
  return refineSingleResumeNodeService(opportunityId, nodeId, instruction);
}

export async function compileResumeDocumentAction(opportunityId: string, format: "pdf" | "docx" = "pdf") {
  return compileResumeDocumentService(opportunityId, format);
}

export async function refineOpportunityResumeAction(
  opportunityId: string,
  instruction: string,
  previousExperiences?: WorkExperienceInput[] | null,
  includeSummary = true,
  inventMetrics?: boolean,
  devModelOverride?: string | null
) {
  return refineOpportunityResumeService(opportunityId, instruction, previousExperiences, includeSummary, inventMetrics, devModelOverride);
}

export async function sendOpportunityApplication(
  opportunityId: string,
  asDraft = false,
  attachments?: DraftAttachmentInput[],
  reviewedResume?: ReviewedResumeInput | WorkExperienceInput[] | null
) {
  const result = await sendOpportunityApplicationService(opportunityId, asDraft, attachments, reviewedResume);
  if (result.ok) {
    revalidatePath("/jobs");
    revalidatePath("/");
  }
  return result;
}

export async function dismissOpportunity(opportunityId: string) {
  const result = await dismissOpportunityService(opportunityId);
  if (result.ok) revalidatePath("/jobs");
  return result;
}

export async function markOpportunitiesExternalApplied(ids: string[]) {
  const result = await markOpportunitiesExternalAppliedService(ids);
  if (result.ok) revalidatePath("/jobs");
  return result;
}

export async function markOpportunityExternalApplied(opportunityId: string) {
  const result = await markOpportunityExternalAppliedService(opportunityId);
  if (result.ok) revalidatePath("/jobs");
  return result;
}

export async function markLessLikeThis(opportunityId: string) {
  const result = await markLessLikeThisService(opportunityId);
  if (result.ok) revalidatePath("/jobs");
  return result;
}

export async function unmarkApplied(opportunityId: string) {
  const result = await unmarkAppliedService(opportunityId);
  if (result.ok) revalidatePath("/jobs");
  return result;
}

export async function dismissActionRequired(opportunityId: string) {
  const result = await dismissActionRequiredService(opportunityId);
  if (result.ok) revalidatePath("/jobs");
  return result;
}

export async function restoreFromHistory(opportunityId: string) {
  const result = await restoreFromHistoryService(opportunityId);
  if (result.ok) revalidatePath("/jobs");
  return result;
}

export async function deleteOpportunityPermanently(opportunityId: string) {
  const result = await deleteOpportunityPermanentlyService(opportunityId);
  if (result.ok) revalidatePath("/jobs");
  return result;
}

export async function archiveOpportunities(ids: string[]) {
  const result = await archiveOpportunitiesService(ids);
  if (result.ok) revalidatePath("/jobs");
  return result;
}

export async function dismissOpportunities(ids: string[]) {
  const result = await dismissOpportunitiesService(ids);
  if (result.ok) revalidatePath("/jobs");
  return result;
}

export async function restoreOpportunities(ids: string[]) {
  const result = await restoreOpportunitiesService(ids);
  if (result.ok) revalidatePath("/jobs");
  return result;
}

export async function deleteDismissedPermanently(ids: string[]) {
  const result = await deleteDismissedPermanentlyService(ids);
  if (result.ok) revalidatePath("/jobs");
  return result;
}

export async function reprocessOpportunityEmailAction(opportunityId: string) {
  const result = await reprocessOpportunityEmailService(opportunityId);
  if (result.ok) {
    revalidatePath("/");
    revalidatePath("/jobs");
  }
  return result;
}
