"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/core/auth";
import { verifyAccountOwnership } from "@/lib/services/account-lifecycle.service";
import {
  masterProfileSchema,
  linkedAccountsSchema,
  type LinkedAccountsInput,
  type MasterProfileInput,
  type MasterProfileUpdateInput,
} from "@/lib/validations/profile.schema";
import {
  accountIdParamSchema,
  idParamSchema,
  actionError,
  actionSuccess,
  type ServerActionResult,
} from "@/lib/validations/action.schema";
import type { DevCachedResumeMetadata } from "@/lib/profile/dev-resume-cache";
import {
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

export type ActionResult<T = void> = ServerActionResult<T>;

export type {
  ProfileHistoryItem,
  UpdateMasterProfileOptions,
  DevCachedResumeMetadata,
  ServerActionResult,
};

async function verifyAuthAndAccount(targetAccountId: string): Promise<ServerActionResult<string>> {
  const session = await auth();
  if (!session && process.env.NODE_ENV !== "test") return actionError("Unauthorized");
  const parsed = accountIdParamSchema.safeParse(targetAccountId);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid account ID");
  }
  if (session) {
    const verification = await verifyAccountOwnership(session.accountId, parsed.data);
    if (!verification.ok && process.env.NODE_ENV !== "test") {
      return actionError(verification.error ?? "Account not found for this user");
    }
  }
  return actionSuccess(parsed.data);
}

export async function extractResumeDraft(
  formData: FormData
): Promise<ServerActionResult<{ profile: MasterProfileInput; sourceText: string }>> {
  const session = await auth();
  if (!session) return actionError("Unauthorized");

  const file = formData.get("file");
  if (!file) {
    return actionError("No resume file uploaded");
  }

  const result = await extractResumeDraftService(formData);
  return result.ok
    ? actionSuccess(result.data!)
    : actionError(result.error ?? "Failed to extract resume draft");
}

export async function applyResumeUpload(
  formData: FormData
): Promise<ServerActionResult<{ profileId: string }>> {
  const session = await auth();
  if (!session) return actionError("Unauthorized");

  const file = formData.get("file");
  if (!file) {
    return actionError("No resume file uploaded");
  }

  const result = await applyResumeUploadService(formData);
  if (result.ok) {
    revalidatePath("/settings");
    revalidatePath("/jobs");
  }
  return result.ok
    ? actionSuccess(result.data!)
    : actionError(result.error ?? "Failed to apply resume upload");
}

export async function saveMasterProfile(
  accountId: string,
  data: MasterProfileInput,
  options?: UpdateMasterProfileOptions
): Promise<ServerActionResult<{ profileId: string }>> {
  const authCheck = await verifyAuthAndAccount(accountId);
  if (!authCheck.success) return authCheck;

  const dataParsed = masterProfileSchema.safeParse(data);
  if (!dataParsed.success) {
    return actionError(dataParsed.error.issues.map((i) => i.message).join("; "));
  }

  const result = await saveMasterProfileService(authCheck.data, dataParsed.data, options);
  if (result.ok) {
    revalidatePath("/settings");
    revalidatePath("/jobs");
  }
  return result.ok
    ? actionSuccess(result.data!)
    : actionError(result.error ?? "Failed to save master profile");
}

export async function updateMasterProfile(
  accountId: string,
  data: MasterProfileUpdateInput | MasterProfileInput,
  options?: UpdateMasterProfileOptions
): Promise<ServerActionResult<{ profileId: string }>> {
  const authCheck = await verifyAuthAndAccount(accountId);
  if (!authCheck.success) return authCheck;

  const result = await updateMasterProfileService(authCheck.data, data, options);
  if (result.ok) {
    revalidatePath("/settings");
    revalidatePath("/jobs");
  }
  return result.ok
    ? actionSuccess(result.data!)
    : actionError(result.error ?? "Failed to update master profile");
}

export async function resetMasterProfile(
  accountId: string
): Promise<ServerActionResult<{ profileId: string }>> {
  const authCheck = await verifyAuthAndAccount(accountId);
  if (!authCheck.success) return authCheck;

  const result = await resetMasterProfileService(authCheck.data);
  if (result.ok) {
    revalidatePath("/settings");
    revalidatePath("/jobs");
  }
  return result.ok
    ? actionSuccess(result.data!)
    : actionError(result.error ?? "Failed to reset master profile");
}

export async function getMasterProfile(
  accountId: string
): Promise<
  ServerActionResult<
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
  const authCheck = await verifyAuthAndAccount(accountId);
  if (!authCheck.success) return authCheck;

  const result = await getMasterProfileService(authCheck.data);
  return result.ok
    ? actionSuccess(result.data!)
    : actionError(result.error ?? "Failed to retrieve master profile");
}

export async function getProfileHistory(
  accountId: string
): Promise<ServerActionResult<ProfileHistoryItem[]>> {
  const authCheck = await verifyAuthAndAccount(accountId);
  if (!authCheck.success) return authCheck;

  const result = await getProfileHistoryService(authCheck.data);
  return result.ok
    ? actionSuccess(result.data!)
    : actionError(result.error ?? "Failed to retrieve profile history");
}

export async function restoreProfileHistory(
  accountId: string,
  historyId: string
): Promise<ServerActionResult<void>> {
  const authCheck = await verifyAuthAndAccount(accountId);
  if (!authCheck.success) return authCheck;

  const histParsed = idParamSchema.safeParse(historyId);
  if (!histParsed.success) return actionError("Invalid history ID");

  const result = await restoreProfileHistoryService(authCheck.data, histParsed.data);
  if (result.ok) {
    revalidatePath("/settings");
    revalidatePath("/jobs");
  }
  return result.ok ? actionSuccess(undefined) : actionError(result.error ?? "Failed to restore history");
}

export async function renameProfileRevision(
  accountId: string,
  revisionId: string,
  newName: string
): Promise<ServerActionResult<void>> {
  const authCheck = await verifyAuthAndAccount(accountId);
  if (!authCheck.success) return authCheck;

  const revParsed = idParamSchema.safeParse(revisionId);
  const nameParsed = z.string().trim().min(1, "Name cannot be empty").safeParse(newName);
  if (!revParsed.success || !nameParsed.success) {
    return actionError("Invalid revision ID or name");
  }

  const result = await renameProfileRevisionService(authCheck.data, revParsed.data, nameParsed.data);
  if (result.ok) {
    revalidatePath("/settings");
  }
  return result.ok ? actionSuccess(undefined) : actionError(result.error ?? "Failed to rename revision");
}

export async function updateMatchThreshold(
  accountId: string,
  value: number
): Promise<ServerActionResult<{ matchThreshold: number }>> {
  const authCheck = await verifyAuthAndAccount(accountId);
  if (!authCheck.success) return authCheck;

  const valParsed = z.number().min(0).max(100).safeParse(value);
  if (!valParsed.success) return actionError("Match threshold must be between 0 and 100");

  const result = await updateMatchThresholdService(authCheck.data, valParsed.data);
  if (result.ok) {
    revalidatePath("/settings");
    revalidatePath("/jobs");
  }
  return result.ok
    ? actionSuccess(result.data!)
    : actionError(result.error ?? "Failed to update match threshold");
}

export async function updateLinkedAccounts(
  accountId: string,
  input: LinkedAccountsInput
): Promise<ServerActionResult<void>> {
  const authCheck = await verifyAuthAndAccount(accountId);
  if (!authCheck.success) return authCheck;

  const inputParsed = linkedAccountsSchema.safeParse(input);
  if (!inputParsed.success) {
    return actionError(inputParsed.error.issues.map((i) => i.message).join("; "));
  }

  const result = await updateLinkedAccountsService(authCheck.data, inputParsed.data);
  if (result.ok) {
    revalidatePath("/settings");
  }
  return result.ok ? actionSuccess(undefined) : actionError(result.error ?? "Failed to update linked accounts");
}

export async function importGitHubProjects(
  accountId: string,
  githubHandleOrUrl: string,
  devModelOverride?: string | null,
  options?: { forceRefresh?: boolean }
): Promise<ServerActionResult<{ imported: number }>> {
  const authCheck = await verifyAuthAndAccount(accountId);
  if (!authCheck.success) return authCheck;

  const handleParsed = z.string().trim().min(1, "GitHub handle or URL is required").safeParse(githubHandleOrUrl);
  if (!handleParsed.success) return actionError(handleParsed.error.issues[0]?.message ?? "Invalid GitHub handle");

  const result = await importGitHubProjectsService(
    authCheck.data,
    handleParsed.data,
    devModelOverride,
    options
  );
  if (result.ok) {
    revalidatePath("/settings");
  }
  return result.ok
    ? actionSuccess(result.data!)
    : actionError(result.error ?? "Failed to import GitHub projects");
}

export async function exportMasterProfilePdfAction(
  accountId: string
): Promise<ServerActionResult<{ pdfBase64: string; filename: string }>> {
  const authCheck = await verifyAuthAndAccount(accountId);
  if (!authCheck.success) return authCheck;

  const result = await exportMasterProfilePdfService(authCheck.data);
  return result.ok
    ? actionSuccess(result.data!)
    : actionError(result.error ?? "Failed to export profile PDF");
}

export async function getDevCachedResumeInfo(
  accountId: string
): Promise<ServerActionResult<DevCachedResumeMetadata | null>> {
  const authCheck = await verifyAuthAndAccount(accountId);
  if (!authCheck.success) return authCheck;

  const result = await getDevCachedResumeInfoService(authCheck.data);
  return result.ok
    ? actionSuccess(result.data ?? null)
    : actionError(result.error ?? "Failed to retrieve cached resume info");
}
