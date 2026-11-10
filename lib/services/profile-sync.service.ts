import { prisma } from "@/lib/core/prisma";
import { extractTextFromFile } from "@/lib/document/document-parser";
import { syncGitHubProjects, normalizeGitHubUsername } from "@/lib/github";
import { parseLinkedInArchive } from "@/lib/profile/linkedin-archive-parser";
import {
  deduplicateProjectCollection,
  enrichLinksFromRawText,
  githubProfileUrlInText,
  isGithubProfileUrl,
  resolveGithubHandle,
} from "@/lib/profile/profile-consolidation";
import { parseResumeToStructuredProfile } from "@/lib/profile/resume-parser";
import {
  saveDevCachedResume,
  getDevCachedResume,
  getDevCachedResumeMetadata,
  type DevCachedResumeMetadata,
} from "@/lib/profile/dev-resume-cache";
import {
  loadProfileSnapshot,
  recordProfileSnapshot,
} from "@/lib/profile/profile-history";
import { parseAccountRules } from "@/lib/validations/rules";
import type { MasterProfileInput } from "@/lib/validations/profile";
import {
  saveMasterProfile,
  getMasterProfile,
  updateMasterProfile,
} from "./profile-snapshot.service";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/**
 * Parses an uploaded resume / LinkedIn archive into a draft MasterProfile.
 */
export async function extractResumeDraft(
  formData: FormData
): Promise<
  ActionResult<{ profile: MasterProfileInput; sourceText: string }>
> {
  try {
    const accountId = String(formData.get("accountId") ?? "");
    let file = formData.get("file");
    const useDevCachedResume =
      String(formData.get("useDevCachedResume") ?? "") === "true";
    const devModelOverride =
      String(formData.get("devModelOverride") ?? "").trim() || undefined;
    if (!accountId) {
      return { ok: false, error: "accountId is required" };
    }
    if (!(file instanceof File) && useDevCachedResume) {
      const cached = await getDevCachedResume(accountId);
      if (cached) {
        file = new File([new Uint8Array(cached.buffer)], cached.fileName, {
          type: cached.fileType,
        });
      }
    }
    if (!(file instanceof File)) {
      return { ok: false, error: "Resume file is required" };
    }

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: { settings: true },
    });
    if (!account) {
      return { ok: false, error: "Account not found" };
    }

    const name = file.name.toLowerCase();
    const type = file.type.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    if (name.endsWith(".zip") || type === "application/zip" || type === "application/x-zip-compressed") {
      const draft = await parseLinkedInArchive(buffer);
      return {
        ok: true,
        data: {
          profile: {
            ...draft,
            email: account.email || draft.email,
          },
          sourceText: "",
        },
      };
    }

    // Reconstruct a File-like for text extractors that expect File
    const rebuilt = new File([buffer], file.name, { type: file.type });
    const text = await extractTextFromFile(rebuilt);

    if (process.env.NODE_ENV === "development") {
      void saveDevCachedResume(accountId, {
        fileName: file.name,
        fileType: file.type,
        buffer,
        sourceText: text,
      });
    }
    const rules = parseAccountRules(account.settings?.rules);
    const draft = await parseResumeToStructuredProfile(text, {
      llmProvider:
        account.settings?.llmProvider === "LOCAL_OLLAMA"
          ? "LOCAL_OLLAMA"
          : "OPENROUTER",
      localOllamaUrl: account.settings?.localOllamaUrl,
      ollamaModel: account.settings?.ollamaModel,
      allowCloudFallback: rules.allowCloudFallback,
      accountEmail: account.email,
      accountId: account.id,
      accountRules: rules,
      devModelOverride,
    });

    const links = enrichLinksFromRawText(text, draft.links);

    return {
      ok: true,
      data: { profile: { ...draft, links }, sourceText: text },
    };
  } catch (error) {
    console.error("extractResumeDraft failed", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Resume extraction failed",
    };
  }
}

/**
 * Extracts a resume/LinkedIn archive first, optionally runs GitHub deep sync,
 * then additively consolidates into the master profile.
 */
export async function applyResumeUpload(
  formData: FormData
): Promise<ActionResult<{ profileId: string }>> {
  const accountId = String(formData.get("accountId") ?? "");
  if (!accountId) {
    return { ok: false, error: "accountId is required" };
  }

  // 1. Extract resume ground truth first
  const extracted = await extractResumeDraft(formData);
  if (!extracted.ok || !extracted.data) {
    return {
      ok: false,
      error: extracted.ok ? "Empty draft returned" : extracted.error,
    };
  }

  let profileDraft = extracted.data.profile;
  const sourceText = extracted.data.sourceText;
  const overwriteAll = String(formData.get("overwriteAll") ?? "") === "true";
  const forceReinfer = String(formData.get("forceReinfer") ?? "") === "true";
  const devModelOverride =
    String(formData.get("devModelOverride") ?? "").trim() || undefined;

  // 2. GitHub handle from the new document, or from the form when merging.
  const documentGithub = githubProfileUrlInText(sourceText);
  const inputGithub = String(formData.get("githubUsername") ?? "").trim();
  const targetGithubHandle =
    resolveGithubHandle(inputGithub, profileDraft.links) || documentGithub;

  if (overwriteAll && !targetGithubHandle) {
    profileDraft = {
      ...profileDraft,
      links: profileDraft.links.filter((link) => !isGithubProfileUrl(link.url)),
    };
  }

  // 3. Deep technical inference when a handle is present
  if (targetGithubHandle) {
    try {
      const account = await prisma.account.findUnique({
        where: { id: accountId },
        include: { settings: true },
      });

      const username = normalizeGitHubUsername(targetGithubHandle);
      const rules = parseAccountRules(account?.settings?.rules);
      const effectiveAccountId = account?.id ?? accountId;
      const githubProjects = await syncGitHubProjects(username, {
        accountId: effectiveAccountId,
        llmProvider:
          account?.settings?.llmProvider === "LOCAL_OLLAMA"
            ? "LOCAL_OLLAMA"
            : "OPENROUTER",
        localOllamaUrl: account?.settings?.localOllamaUrl,
        ollamaModel: account?.settings?.ollamaModel,
        allowCloudFallback: rules.allowCloudFallback,
        accountRules: rules,
        devModelOverride,
        bypassCache: forceReinfer,
        forceRefresh: forceReinfer,
      });

      const linkedGithub = `https://github.com/${username}`;
      const formattedGithubProjects = githubProjects.map((gp) => ({
        name: gp.name,
        description: gp.description,
        technologies: gp.technologies,
        link: gp.link,
        bullets: gp.bullets,
        origin: gp.origin,
      }));

      const hasGithubLink = profileDraft.links.some(
        (l) =>
          l.url.toLowerCase().includes("github.com/") &&
          !l.url.toLowerCase().includes("github.io")
      );

      profileDraft = {
        ...profileDraft,
        projects: deduplicateProjectCollection([
          ...profileDraft.projects,
          ...formattedGithubProjects,
        ]),
        links: hasGithubLink
          ? profileDraft.links
          : [...profileDraft.links, { label: "GitHub", url: linkedGithub }],
      };
    } catch (githubError) {
      console.warn(
        "GitHub deep sync failed during resume upload; proceeding with resume data only:",
        githubError
      );
    }
  }

  return saveMasterProfile(accountId, profileDraft, {
    summary: forceReinfer
      ? "Development Test Run"
      : overwriteAll
        ? "Before Resume Replacement"
        : "Before Resume Extraction",
    overwriteAll,
  });
}

/**
 * Syncs GitHub repositories into Project rows and stores linkedGithub.
 */
export async function importGitHubProjects(
  accountId: string,
  githubHandleOrUrl: string,
  devModelOverride?: string | null,
  options?: { forceRefresh?: boolean }
): Promise<ActionResult<{ imported: number }>> {
  const handle = githubHandleOrUrl.trim();
  if (!handle) {
    return { ok: false, error: "GitHub username or URL is required" };
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { profile: true, settings: true },
  });
  if (!account) {
    return { ok: false, error: "Account not found" };
  }
  if (!account.profile) {
    return {
      ok: false,
      error: "Create a master profile before syncing GitHub projects",
    };
  }

  try {
    const username = normalizeGitHubUsername(handle);

    const preSync = await loadProfileSnapshot(account.profile.id);
    if (preSync) {
      await recordProfileSnapshot(
        account.profile.id,
        "Before GitHub Sync",
        preSync
      );
    }

    const rules = parseAccountRules(account.settings?.rules);
    const projects = await syncGitHubProjects(username, {
      accountId,
      llmProvider:
        account.settings?.llmProvider === "LOCAL_OLLAMA"
          ? "LOCAL_OLLAMA"
          : "OPENROUTER",
      localOllamaUrl: account.settings?.localOllamaUrl,
      ollamaModel: account.settings?.ollamaModel,
      allowCloudFallback: rules.allowCloudFallback,
      accountRules: rules,
      devModelOverride,
      bypassCache: options?.forceRefresh,
      forceRefresh: options?.forceRefresh,
    });
    const linkedGithub = `https://github.com/${username}`;

    const currentProfileResult = await getMasterProfile(accountId);
    if (currentProfileResult.ok && currentProfileResult.data) {
      const currentProjects = currentProfileResult.data.projects;
      const mergedProjects = deduplicateProjectCollection([
        ...currentProjects,
        ...projects,
      ]);
      await updateMasterProfile(
        accountId,
        {
          ...currentProfileResult.data,
          linkedGithub,
          projects: mergedProjects,
        },
        {
          summary: "GitHub Sync",
        }
      );
    }

    return { ok: true, data: { imported: projects.length } };
  } catch (error) {
    console.error("importGitHubProjects failed", error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to sync GitHub projects",
    };
  }
}

/**
 * Returns metadata about the dev-cached resume for instant repeated benchmark runs.
 */
export async function getDevCachedResumeInfo(
  accountId: string
): Promise<ActionResult<DevCachedResumeMetadata | null>> {
  if (process.env.NODE_ENV !== "development") {
    return { ok: true, data: null };
  }
  const meta = await getDevCachedResumeMetadata(accountId);
  return { ok: true, data: meta };
}
