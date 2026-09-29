"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { extractTextFromFile } from "@/lib/document-parser";
import { syncGitHubProjects, normalizeGitHubUsername } from "@/lib/github-sync";
import { parseLinkedInArchive } from "@/lib/linkedin-archive-parser";
import {
  consolidateProfiles,
  enrichLinksFromRawText,
  extractPlatformLinks,
  resolveGithubHandle,
} from "@/lib/profile-consolidation";
import {
  loadProfileSnapshot,
  recordProfileSnapshot,
  serializeUserProfileToInput,
} from "@/lib/profile-history";
import { synthesizeCandidatePersona } from "@/lib/ai/persona";
import { prisma } from "@/lib/prisma";
import { parseResumeToStructuredProfile } from "@/lib/resume-parser";
import {
  linkedAccountsSchema,
  masterProfileSchema,
  matchThresholdSchema,
  type LinkedAccountsInput,
  type MasterProfileInput,
  type MasterProfileUpdateInput,
} from "@/lib/validations/profile";
import { parseAccountRules } from "@/lib/validations/rules";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export type ProfileHistoryItem = {
  id: string;
  summary: string;
  createdAt: string;
};

export type UpdateMasterProfileOptions = {
  summary?: string;
  skipHistory?: boolean;
};

/**
 * Parses an uploaded resume / LinkedIn archive into a draft MasterProfile.
 */
export async function extractResumeDraft(
  formData: FormData
): Promise<ActionResult<MasterProfileInput>> {
  try {
    const accountId = String(formData.get("accountId") ?? "");
    const file = formData.get("file");
    if (!accountId) {
      return { ok: false, error: "accountId is required" };
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
          ...draft,
          email: account.email || draft.email,
        },
      };
    }

    // Reconstruct a File-like for text extractors that expect File
    const rebuilt = new File([buffer], file.name, { type: file.type });
    const text = await extractTextFromFile(rebuilt);
    const rules = parseAccountRules(account.settings?.rules);
    const draft = await parseResumeToStructuredProfile(text, {
      llmProvider:
        account.settings?.llmProvider === "LOCAL_OLLAMA"
          ? "LOCAL_OLLAMA"
          : "OPENROUTER",
      localOllamaUrl: account.settings?.localOllamaUrl,
      ollamaModel: account.settings?.ollamaModel,
      allowCloudFallback: rules.allowCloudFallback,
    });

    const links = enrichLinksFromRawText(text, draft.links);

    return { ok: true, data: { ...draft, links } };
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

  let profileDraft = extracted.data;

  // 2. GitHub handle from explicit input OR detected resume links
  const inputGithub = String(formData.get("githubUsername") ?? "").trim();
  const targetGithubHandle = resolveGithubHandle(
    inputGithub,
    profileDraft.links
  );

  // 3. Deep technical inference when a handle is present
  if (targetGithubHandle) {
    try {
      const account = await prisma.account.findUnique({
        where: { id: accountId },
        include: { settings: true },
      });

      const username = normalizeGitHubUsername(targetGithubHandle);
      const githubProjects = await syncGitHubProjects(username, {
        llmProvider:
          account?.settings?.llmProvider === "LOCAL_OLLAMA"
            ? "LOCAL_OLLAMA"
            : "OPENROUTER",
        localOllamaUrl: account?.settings?.localOllamaUrl,
        ollamaModel: account?.settings?.ollamaModel,
        allowCloudFallback: parseAccountRules(account?.settings?.rules)
          .allowCloudFallback,
      });

      const linkedGithub = `https://github.com/${username}`;
      const existingProjectNames = new Set(
        profileDraft.projects.map((p) =>
          p.name.toLowerCase().replace(/[^a-z0-9]/g, "")
        )
      );

      const additionalProjects = githubProjects
        .filter(
          (gp) =>
            !existingProjectNames.has(
              gp.name.toLowerCase().replace(/[^a-z0-9]/g, "")
            )
        )
        .map((gp) => ({
          name: gp.name,
          description: gp.description,
          technologies: gp.technologies,
          link: gp.link,
          bullets: gp.bullets,
        }));

      const hasGithubLink = profileDraft.links.some(
        (l) =>
          l.url.toLowerCase().includes("github.com/") &&
          !l.url.toLowerCase().includes("github.io")
      );

      profileDraft = {
        ...profileDraft,
        projects: [...profileDraft.projects, ...additionalProjects],
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

  // 4. Additive consolidation + snapshot
  return saveMasterProfile(accountId, profileDraft, {
    summary: "Before Resume Extraction",
  });
}

/**
 * Additively consolidates incoming profile data with any existing master profile,
 * auto-fills linked platform URLs from the links array, then persists.
 */
export async function saveMasterProfile(
  accountId: string,
  data: MasterProfileInput,
  options?: UpdateMasterProfileOptions
): Promise<ActionResult<{ profileId: string }>> {
  const existing = await prisma.userProfile.findUnique({
    where: { accountId },
    include: {
      experiences: { orderBy: { displayOrder: "asc" } },
      projects: true,
      education: true,
    },
  });

  const platforms = extractPlatformLinks(data.links);
  let consolidated: MasterProfileInput = data;

  if (existing) {
    const current = serializeUserProfileToInput(existing);
    consolidated = consolidateProfiles(current, data);
  }

  if (platforms.linkedWebsite) {
    const hasWebsite = consolidated.links.some(
      (l) =>
        l.url.toLowerCase() === platforms.linkedWebsite!.toLowerCase() ||
        l.label.toLowerCase().includes("portfolio") ||
        l.label.toLowerCase().includes("website")
    );
    if (!hasWebsite) {
      consolidated = {
        ...consolidated,
        links: [
          ...consolidated.links,
          { label: "Portfolio", url: platforms.linkedWebsite },
        ],
      };
    }
  }

  const resolvedPlatforms = extractPlatformLinks(consolidated.links);

  return updateMasterProfile(
    accountId,
    {
      ...consolidated,
      linkedWebsite:
        existing?.linkedWebsite ?? resolvedPlatforms.linkedWebsite ?? null,
      linkedIndeed:
        existing?.linkedIndeed ?? resolvedPlatforms.linkedIndeed ?? null,
      linkedGlassdoor:
        existing?.linkedGlassdoor ?? resolvedPlatforms.linkedGlassdoor ?? null,
      linkedGithub:
        existing?.linkedGithub ?? resolvedPlatforms.linkedGithub ?? null,
      linkedLinkedin:
        existing?.linkedLinkedin ?? resolvedPlatforms.linkedLinkedin ?? null,
      linkedHandshake:
        existing?.linkedHandshake ?? resolvedPlatforms.linkedHandshake ?? null,
    },
    {
      summary:
        options?.summary ??
        (existing ? "Additive Profile Update" : "Before Resume Extraction"),
      skipHistory: options?.skipHistory,
    }
  );
}

/**
 * Full master profile write (core resume fields + linked URLs).
 * Validates with `masterProfileSchema` and replaces child relations in a transaction.
 */
export async function updateMasterProfile(
  accountId: string,
  data: MasterProfileUpdateInput | MasterProfileInput,
  options?: UpdateMasterProfileOptions
): Promise<ActionResult<{ profileId: string }>> {
  const parsed = masterProfileSchema.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) {
    return { ok: false, error: "Account not found" };
  }

  const payload = parsed.data;
  const persona = synthesizeCandidatePersona(payload);

  try {
    if (!options?.skipHistory) {
      const existingTree = await prisma.userProfile.findUnique({
        where: { accountId },
        include: {
          experiences: { orderBy: { displayOrder: "asc" } },
          projects: true,
          education: true,
        },
      });
      if (existingTree) {
        await recordProfileSnapshot(
          existingTree.id,
          options?.summary ?? "Manual Edit",
          serializeUserProfileToInput(existingTree)
        );
      }
    }

    const profileId = await prisma.$transaction(async (tx) => {
      const existing = await tx.userProfile.findUnique({
        where: { accountId },
      });

      const shared = {
        fullName: payload.fullName,
        email: payload.email,
        phone: payload.phone ?? null,
        location: payload.location ?? null,
        summary: payload.summary ?? null,
        links: payload.links as Prisma.InputJsonValue,
        skills: payload.skills as Prisma.InputJsonValue,
        linkedWebsite: payload.linkedWebsite ?? null,
        linkedIndeed: payload.linkedIndeed ?? null,
        linkedGlassdoor: payload.linkedGlassdoor ?? null,
        linkedGithub: payload.linkedGithub ?? null,
        linkedLinkedin: payload.linkedLinkedin ?? null,
        linkedHandshake: payload.linkedHandshake ?? null,
        seniorityTier: persona.seniorityTier,
        timelineContext: persona.timelineContext,
        toneGuidance: persona.toneGuidance,
      };

      const profile = existing
        ? await tx.userProfile.update({
            where: { accountId },
            data: shared,
          })
        : await tx.userProfile.create({
            data: {
              accountId,
              ...shared,
            },
          });

      await tx.workExperience.deleteMany({ where: { profileId: profile.id } });
      await tx.project.deleteMany({ where: { profileId: profile.id } });
      await tx.education.deleteMany({ where: { profileId: profile.id } });

      if (payload.experiences.length > 0) {
        await tx.workExperience.createMany({
          data: payload.experiences.map((exp, index) => ({
            profileId: profile.id,
            company: exp.company,
            role: exp.role,
            location: exp.location ?? null,
            startDate: exp.startDate,
            endDate: exp.endDate ?? null,
            bullets: exp.bullets as Prisma.InputJsonValue,
            displayOrder: exp.displayOrder ?? index,
          })),
        });
      }

      if (payload.projects.length > 0) {
        await tx.project.createMany({
          data: payload.projects.map((p) => ({
            profileId: profile.id,
            name: p.name,
            description: p.description,
            technologies: p.technologies,
            link: p.link ?? null,
            bullets: p.bullets,
          })),
        });
      }

      if (payload.education.length > 0) {
        await tx.education.createMany({
          data: payload.education.map((ed) => ({
            profileId: profile.id,
            institution: ed.institution,
            degree: ed.degree,
            fieldOfStudy: ed.fieldOfStudy ?? null,
            graduationDate: ed.graduationDate ?? null,
          })),
        });
      }

      return profile.id;
    });

    revalidatePath("/settings");
    revalidatePath("/jobs");
    return { ok: true, data: { profileId } };
  } catch (error) {
    console.error("updateMasterProfile failed", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to save profile",
    };
  }
}

/**
 * Fetches the full master profile with experiences, projects, and education.
 */
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
    }
  >
> {
  try {
    const profile = await prisma.userProfile.findUnique({
      where: { accountId },
      include: {
        experiences: { orderBy: { displayOrder: "asc" } },
        projects: true,
        education: true,
      },
    });

    if (!profile) {
      return { ok: false, error: "Profile not found" };
    }

    return {
      ok: true,
      data: {
        fullName: profile.fullName,
        email: profile.email,
        phone: profile.phone,
        location: profile.location,
        summary: profile.summary,
        links: (profile.links as MasterProfileInput["links"]) ?? [],
        skills: (profile.skills as MasterProfileInput["skills"]) ?? {
          languages: [],
          frameworks: [],
          tools: [],
          concepts: [],
        },
        experiences: profile.experiences.map((e) => ({
          id: e.id,
          company: e.company,
          role: e.role,
          location: e.location,
          startDate: e.startDate,
          endDate: e.endDate,
          bullets:
            (e.bullets as MasterProfileInput["experiences"][number]["bullets"]) ??
            [],
          displayOrder: e.displayOrder,
        })),
        projects: profile.projects.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          technologies: p.technologies,
          link: p.link,
          bullets: p.bullets,
        })),
        education: profile.education.map((ed) => ({
          id: ed.id,
          institution: ed.institution,
          degree: ed.degree,
          fieldOfStudy: ed.fieldOfStudy,
          graduationDate: ed.graduationDate,
        })),
        updatedAt: profile.updatedAt.toISOString(),
        matchThreshold: profile.matchThreshold,
        linkedWebsite: profile.linkedWebsite,
        linkedIndeed: profile.linkedIndeed,
        linkedGlassdoor: profile.linkedGlassdoor,
        linkedGithub: profile.linkedGithub,
        linkedLinkedin: profile.linkedLinkedin,
        linkedHandshake: profile.linkedHandshake,
      },
    };
  } catch (error) {
    console.error("getMasterProfile failed", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to load profile",
    };
  }
}

/**
 * Lists the last 5 profile revision snapshots (newest first).
 */
export async function getProfileHistory(
  accountId: string
): Promise<ActionResult<ProfileHistoryItem[]>> {
  const profile = await prisma.userProfile.findUnique({
    where: { accountId },
    select: { id: true },
  });

  if (!profile) return { ok: false, error: "Profile not found" };

  const history = await prisma.profileHistory.findMany({
    where: { profileId: profile.id },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, summary: true, createdAt: true },
  });

  return {
    ok: true,
    data: history.map((h) => ({
      id: h.id,
      summary: h.summary,
      createdAt: h.createdAt.toISOString(),
    })),
  };
}

/**
 * Restores a prior snapshot. Current state is archived first via updateMasterProfile.
 */
export async function restoreProfileHistory(
  accountId: string,
  historyId: string
): Promise<ActionResult> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { profile: true },
  });
  if (!account?.profile) return { ok: false, error: "Profile not found" };

  const target = await prisma.profileHistory.findUnique({
    where: { id: historyId },
  });
  if (!target || target.profileId !== account.profile.id) {
    return { ok: false, error: "Revision not found" };
  }

  const restoredData = target.snapshot as MasterProfileUpdateInput;

  const result = await updateMasterProfile(accountId, restoredData, {
    summary: `Restored: ${target.summary}`,
  });
  if (!result.ok) return result;

  revalidatePath("/settings");
  revalidatePath("/jobs");
  return { ok: true };
}

/**
 * Persists the Job Radar match threshold on UserProfile (and mirrors PermanentSettings).
 */
export async function updateMatchThreshold(
  accountId: string,
  value: number
): Promise<ActionResult<{ matchThreshold: number }>> {
  const parsed = matchThresholdSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
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
      error: "Upload a master resume before setting the match threshold",
    };
  }

  try {
    const profile = await prisma.userProfile.update({
      where: { accountId },
      data: { matchThreshold: parsed.data },
    });

    // Keep Job Radar automation knobs in sync when a durable profile exists.
    if (account.persistentProfileId) {
      await prisma.permanentSettings.upsert({
        where: { persistentProfileId: account.persistentProfileId },
        create: {
          persistentProfileId: account.persistentProfileId,
          matchScoreThreshold: parsed.data,
        },
        update: { matchScoreThreshold: parsed.data },
      });
    }

    if (account.settings) {
      const rules = parseAccountRules(account.settings.rules);
      await prisma.accountSettings.update({
        where: { accountId },
        data: {
          rules: {
            ...rules,
            matchScoreThreshold: parsed.data,
          } as Prisma.InputJsonValue,
        },
      });
    }

    revalidatePath("/settings");
    revalidatePath("/jobs");
    return { ok: true, data: { matchThreshold: profile.matchThreshold } };
  } catch (error) {
    console.error("updateMatchThreshold failed", error);
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to update threshold",
    };
  }
}

/**
 * Saves Linked Professional Account profile URLs on UserProfile.
 */
export async function updateLinkedAccounts(
  accountId: string,
  input: LinkedAccountsInput
): Promise<ActionResult> {
  const parsed = linkedAccountsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { profile: true },
  });
  if (!account) {
    return { ok: false, error: "Account not found" };
  }
  if (!account.profile) {
    return {
      ok: false,
      error: "Upload a master resume before linking professional accounts",
    };
  }

  try {
    await prisma.userProfile.update({
      where: { accountId },
      data: {
        linkedWebsite: parsed.data.linkedWebsite,
        linkedIndeed: parsed.data.linkedIndeed,
        linkedGlassdoor: parsed.data.linkedGlassdoor,
        linkedGithub: parsed.data.linkedGithub,
        linkedLinkedin: parsed.data.linkedLinkedin,
        linkedHandshake: parsed.data.linkedHandshake,
      },
    });

    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    console.error("updateLinkedAccounts failed", error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to update linked accounts",
    };
  }
}

/**
 * Syncs GitHub repositories into Project rows and stores linkedGithub.
 */
export async function importGitHubProjects(
  accountId: string,
  githubHandleOrUrl: string
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

    const projects = await syncGitHubProjects(username, {
      llmProvider:
        account.settings?.llmProvider === "LOCAL_OLLAMA"
          ? "LOCAL_OLLAMA"
          : "OPENROUTER",
      localOllamaUrl: account.settings?.localOllamaUrl,
      ollamaModel: account.settings?.ollamaModel,
      allowCloudFallback: parseAccountRules(account.settings?.rules)
        .allowCloudFallback,
    });
    const linkedGithub = `https://github.com/${username}`;

    await prisma.$transaction(async (tx) => {
      await tx.userProfile.update({
        where: { accountId },
        data: { linkedGithub },
      });

      for (const project of projects) {
        const existing = await tx.project.findFirst({
          where: {
            profileId: account.profile!.id,
            name: project.name,
          },
        });

        if (existing) {
          await tx.project.update({
            where: { id: existing.id },
            data: {
              description: project.description,
              technologies: project.technologies,
              link: project.link,
              bullets: project.bullets,
            },
          });
        } else {
          await tx.project.create({
            data: {
              profileId: account.profile!.id,
              name: project.name,
              description: project.description,
              technologies: project.technologies,
              link: project.link,
              bullets: project.bullets,
            },
          });
        }
      }
    });

    revalidatePath("/settings");
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
