"use server";

import { revalidatePath } from "next/cache";
import type {
  LinkedAccountsInput,
  MasterProfileInput,
  MasterProfileUpdateInput,
} from "@/lib/validations/profile";
import type { DevCachedResumeMetadata } from "@/lib/profile/dev-resume-cache";
import {
  type ActionResult,
  type ProfileHistoryItem,
  getProfileHistory as getProfileHistoryService,
  restoreProfileHistory as restoreProfileHistoryService,
  renameProfileRevision as renameProfileRevisionService,
} from "@/lib/services/profile-diff.service";
import {
  type UpdateMasterProfileOptions,
  updateMasterProfile as updateMasterProfileService,
  saveMasterProfile as saveMasterProfileService,
  resetMasterProfile as resetMasterProfileService,
  getMasterProfile as getMasterProfileService,
  updateMatchThreshold as updateMatchThresholdService,
  updateLinkedAccounts as updateLinkedAccountsService,
  exportMasterProfilePdf as exportMasterProfilePdfService,
} from "@/lib/services/profile-snapshot.service";
import {
  extractResumeDraft as extractResumeDraftService,
  applyResumeUpload as applyResumeUploadService,
  importGitHubProjects as importGitHubProjectsService,
  getDevCachedResumeInfo as getDevCachedResumeInfoService,
} from "@/lib/services/profile-sync.service";

export type { ActionResult, ProfileHistoryItem, UpdateMasterProfileOptions, DevCachedResumeMetadata };

export async function extractResumeDraft(
  formData: FormData
): Promise<ActionResult<{ profile: MasterProfileInput; sourceText: string }>> {
  return extractResumeDraftService(formData);
}

export async function applyResumeUpload(
  formData: FormData
): Promise<ActionResult<{ profileId: string }>> {
  const result = await applyResumeUploadService(formData);
  if (result.ok) {
    revalidatePath("/settings");
    revalidatePath("/jobs");
  }
  return result;
}

export async function saveMasterProfile(
  accountId: string,
  data: MasterProfileInput,
  options?: UpdateMasterProfileOptions
): Promise<ActionResult<{ profileId: string }>> {
  const result = await saveMasterProfileService(accountId, data, options);
  if (result.ok) {
    revalidatePath("/settings");
    revalidatePath("/jobs");
  }
  return result;
}

export async function updateMasterProfile(
  accountId: string,
  data: MasterProfileUpdateInput | MasterProfileInput,
  options?: UpdateMasterProfileOptions
): Promise<ActionResult<{ profileId: string }>> {
  const result = await updateMasterProfileService(accountId, data, options);
  if (result.ok) {
    revalidatePath("/settings");
    revalidatePath("/jobs");
  }
  return result;
}

export async function resetMasterProfile(
  accountId: string
): Promise<ActionResult<{ profileId: string }>> {
  const result = await resetMasterProfileService(accountId);
  if (result.ok) {
    revalidatePath("/settings");
    revalidatePath("/jobs");
  }
  return result;
}

export async function getMasterProfile(
  accountId: string
): Promise<
  ActionResult<
    MasterProfileInput & {
      updatedAt?: string;
      matchThreshold: number;
      linkedWebsite: string | null;
      linkedIndeed: string | null;
      linkedGlassdoor: string | null;
      linkedGithub: string | null;
      linkedLinkedin: string | null;
      linkedHandshake: string | null;
      seniorityTier: string | null;
      timelineContext: string | null;
      toneGuidance: string | null;
    }
  >
> {
  return getMasterProfileService(accountId);
}

export async function getProfileHistory(
  accountId: string
): Promise<ActionResult<ProfileHistoryItem[]>> {
  return getProfileHistoryService(accountId);
}

export async function restoreProfileHistory(
  accountId: string,
  historyId: string
): Promise<ActionResult> {
  const result = await restoreProfileHistoryService(accountId, historyId);
  if (result.ok) {
    revalidatePath("/settings");
    revalidatePath("/jobs");
  }
  return result;
}

export async function renameProfileRevision(
  accountId: string,
  revisionId: string,
  newName: string
): Promise<ActionResult> {
  const result = await renameProfileRevisionService(accountId, revisionId, newName);
  if (result.ok) {
    revalidatePath("/settings");
  }
  return result;
}

export async function updateMatchThreshold(
  accountId: string,
  value: number
): Promise<ActionResult<{ matchThreshold: number }>> {
  const result = await updateMatchThresholdService(accountId, value);
  if (result.ok) {
    revalidatePath("/settings");
    revalidatePath("/jobs");
  }
  return result;
}

export async function updateLinkedAccounts(
  accountId: string,
  input: LinkedAccountsInput
): Promise<ActionResult> {
  const result = await updateLinkedAccountsService(accountId, input);
  if (result.ok) {
    revalidatePath("/settings");
  }
  return result;
}

export async function importGitHubProjects(
  accountId: string,
  githubHandleOrUrl: string,
  devModelOverride?: string | null,
  options?: { forceRefresh?: boolean }
): Promise<ActionResult<{ imported: number }>> {
  const result = await importGitHubProjectsService(
    accountId,
    githubHandleOrUrl,
    devModelOverride,
    options
  );
  if (result.ok) {
    revalidatePath("/settings");
  }
  return result;
}

export async function exportMasterProfilePdfAction(
  accountId: string
): Promise<ActionResult<{ pdfBase64: string; filename: string }>> {
  return exportMasterProfilePdfService(accountId);
}

export async function getDevCachedResumeInfo(
  accountId: string
): Promise<ActionResult<DevCachedResumeMetadata | null>> {
  return getDevCachedResumeInfoService(accountId);
}
