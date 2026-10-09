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
  githubProfileUrlInText,
  isGithubProfileUrl,
  isPlaceholderEmail,
  resolveGithubHandle,
} from "@/lib/profile-consolidation";
import { nameProfileRevision } from "@/lib/ai/revision-namer";
import { normalizeProfileUrl } from "@/lib/utils/url";
import {
  loadProfileSnapshot,
  recordProfileSnapshot,
  serializeUserProfileToInput,
} from "@/lib/profile-history";
import { synthesizeCandidatePersona } from "@/lib/ai/persona";
import { prisma } from "@/lib/prisma";
import { skillGroupsFromUnknown } from "@/lib/skill-groups";
import { parseResumeToStructuredProfile } from "@/lib/resume-parser";
import { ensurePersistentProfileForAccount } from "@/lib/persistent-profile";
import {
  awardsSchema,
  certificationsSchema,
  getEmptyMasterProfileData,
  interestsSchema,
  linkedAccountsSchema,
  masterProfileSchema,
  matchThresholdSchema,
  snapMatchThreshold,
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
  /** Replace the stored profile with the incoming resume instead of merging. */
  overwriteAll?: boolean;
};

const LINKED_ACCOUNT_KEYS = [
  "linkedWebsite",
  "linkedIndeed",
  "linkedGlassdoor",
  "linkedGithub",
  "linkedLinkedin",
  "linkedHandshake",
] as const;

/** Bare domains get a scheme before schema validation. Blank fields stay null. */
function normalizedLinkedAccounts(
  input: object
): Partial<Record<(typeof LINKED_ACCOUNT_KEYS)[number], string | null>> {
  const record = input as Partial<
    Record<(typeof LINKED_ACCOUNT_KEYS)[number], string | null | undefined>
  >;
  const normalized: Partial<Record<(typeof LINKED_ACCOUNT_KEYS)[number], string | null>> = {};
  for (const key of LINKED_ACCOUNT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
    const raw = record[key];
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    normalized[key] = trimmed ? normalizeProfileUrl(trimmed) : null;
  }
  return normalized;
}

/**
 * Records the current profile in ProfileHistory before a destructive write.
 * Returns the profile id when a snapshot was stored.
 */
async function captureProfileRevision(
  accountId: string,
  summary: string
): Promise<string | null> {
  const existingTree = await prisma.userProfile.findUnique({
    where: { accountId },
    include: {
      experiences: { orderBy: { displayOrder: "asc" } },
      projects: true,
      education: true,
    },
  });
  if (!existingTree) return null;
  await recordProfileSnapshot(
    existingTree.id,
    summary,
    serializeUserProfileToInput(existingTree)
  );
  return existingTree.id;
}

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

  // 2. GitHub handle from the new document, or from the form when merging.
  const documentGithub = githubProfileUrlInText(sourceText);
  const inputGithub = String(formData.get("githubUsername") ?? "").trim();
  const targetGithubHandle = overwriteAll
    ? documentGithub
    : resolveGithubHandle(inputGithub, profileDraft.links);

  if (overwriteAll && !documentGithub) {
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

  return saveMasterProfile(accountId, profileDraft, {
    summary: overwriteAll
      ? "Before Resume Replacement"
      : "Before Resume Extraction",
    overwriteAll,
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

  const overwriteAll = options?.overwriteAll === true;

  if (existing) {
    const current = serializeUserProfileToInput(existing);
    consolidated = consolidateProfiles(current, data, { overwriteAll });
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
      linkedWebsite: overwriteAll
        ? resolvedPlatforms.linkedWebsite
        : existing?.linkedWebsite ?? resolvedPlatforms.linkedWebsite ?? null,
      linkedIndeed: overwriteAll
        ? resolvedPlatforms.linkedIndeed
        : existing?.linkedIndeed ?? resolvedPlatforms.linkedIndeed ?? null,
      linkedGlassdoor: overwriteAll
        ? resolvedPlatforms.linkedGlassdoor
        : existing?.linkedGlassdoor ?? resolvedPlatforms.linkedGlassdoor ?? null,
      linkedGithub: overwriteAll
        ? resolvedPlatforms.linkedGithub
        : existing?.linkedGithub ?? resolvedPlatforms.linkedGithub ?? null,
      linkedLinkedin: overwriteAll
        ? resolvedPlatforms.linkedLinkedin
        : existing?.linkedLinkedin ?? resolvedPlatforms.linkedLinkedin ?? null,
      linkedHandshake: overwriteAll
        ? resolvedPlatforms.linkedHandshake
        : existing?.linkedHandshake ?? resolvedPlatforms.linkedHandshake ?? null,
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
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) {
    return { ok: false, error: "Account not found" };
  }

  const email = isPlaceholderEmail(data.email) ? account.email : data.email;
  const parsed = masterProfileSchema.safeParse({
    ...data,
    email,
    ...normalizedLinkedAccounts(data),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  const payload = parsed.data;
  const persona = synthesizeCandidatePersona(payload);

  try {
    if (!options?.skipHistory) {
      const keepGiven =
        options?.summary?.startsWith("Restored:") ||
        options?.summary === "Before Profile Reset";
      let summary = options?.summary ?? "Profile update";
      if (!keepGiven) {
        const existingTree = await prisma.userProfile.findUnique({
          where: { accountId },
          include: {
            experiences: { orderBy: { displayOrder: "asc" } },
            projects: true,
            education: true,
          },
        });
        const previous = existingTree
          ? serializeUserProfileToInput(existingTree)
          : null;
        summary = await nameProfileRevision(previous, payload);
      }
      await captureProfileRevision(accountId, summary);
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
        certifications: payload.certifications as Prisma.InputJsonValue,
        awards: payload.awards as Prisma.InputJsonValue,
        interests: payload.interests as Prisma.InputJsonValue,
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
            category: exp.category || "Work",
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
            subSchool: ed.subSchool ?? null,
            degree: ed.degree ?? null,
            fieldOfStudy: ed.fieldOfStudy ?? null,
            startDate: ed.startDate ?? null,
            graduationDate: ed.graduationDate || ed.endDate || null,
            gpa: ed.gpa ?? null,
            honors: (ed.honors ?? []) as Prisma.InputJsonValue,
            coursework: (ed.coursework ?? []) as Prisma.InputJsonValue,
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
 * Wipes the active master profile after storing the current state in ProfileHistory.
 */
export async function resetMasterProfile(
  accountId: string
): Promise<ActionResult<{ profileId: string }>> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { profile: true },
  });
  if (!account) return { ok: false, error: "Account not found" };
  if (!account.profile) return { ok: false, error: "Profile not found" };

  const blank = getEmptyMasterProfileData();

  try {
    await captureProfileRevision(accountId, "Before Profile Reset");
    await prisma.$transaction(async (tx) => {
      await tx.userProfile.update({
        where: { accountId },
        data: {
          fullName: blank.fullName,
          email: blank.email,
          phone: null,
          location: null,
          summary: null,
          links: blank.links as Prisma.InputJsonValue,
          skills: blank.skills as Prisma.InputJsonValue,
          certifications: blank.certifications as Prisma.InputJsonValue,
          awards: blank.awards as Prisma.InputJsonValue,
          interests: blank.interests as Prisma.InputJsonValue,
          linkedWebsite: null,
          linkedIndeed: null,
          linkedGlassdoor: null,
          linkedGithub: null,
          linkedLinkedin: null,
          linkedHandshake: null,
          seniorityTier: null,
          timelineContext: null,
          toneGuidance: null,
        },
      });
      await tx.workExperience.deleteMany({
        where: { profileId: account.profile!.id },
      });
      await tx.project.deleteMany({
        where: { profileId: account.profile!.id },
      });
      await tx.education.deleteMany({
        where: { profileId: account.profile!.id },
      });
    });

    revalidatePath("/settings");
    revalidatePath("/jobs");
    return { ok: true, data: { profileId: account.profile.id } };
  } catch (error) {
    console.error("resetMasterProfile failed", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to reset profile",
    };
  }
}

function honorsList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    typeof item === "string" && item.trim() ? [item.trim()] : []
  );
}

function resolvedAccountLinks(profile: {
  links: MasterProfileInput["links"];
  linkedWebsite: string | null;
  linkedIndeed: string | null;
  linkedGlassdoor: string | null;
  linkedGithub: string | null;
  linkedLinkedin: string | null;
  linkedHandshake: string | null;
}) {
  const detected = extractPlatformLinks(profile.links);
  return {
    linkedWebsite: profile.linkedWebsite || detected.linkedWebsite,
    linkedIndeed: profile.linkedIndeed || detected.linkedIndeed,
    linkedGlassdoor: profile.linkedGlassdoor || detected.linkedGlassdoor,
    linkedGithub: profile.linkedGithub || detected.linkedGithub,
    linkedLinkedin: profile.linkedLinkedin || detected.linkedLinkedin,
    linkedHandshake: profile.linkedHandshake || detected.linkedHandshake,
  };
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
      seniorityTier: string | null;
      timelineContext: string | null;
      toneGuidance: string | null;
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
        skills: skillGroupsFromUnknown(profile.skills),
        experiences: profile.experiences.map((e) => ({
          id: e.id,
          company: e.company,
          role: e.role,
          location: e.location,
          category: e.category,
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
          subSchool: ed.subSchool,
          degree: ed.degree,
          fieldOfStudy: ed.fieldOfStudy,
          startDate: ed.startDate,
          graduationDate: ed.graduationDate,
          gpa: ed.gpa,
          honors: honorsList(ed.honors),
          coursework: honorsList(ed.coursework),
        })),
        certifications: certificationsSchema.parse(profile.certifications),
        awards: awardsSchema.parse(profile.awards),
        interests: interestsSchema.parse(profile.interests),
        updatedAt: profile.updatedAt.toISOString(),
        matchThreshold: profile.matchThreshold,
        ...resolvedAccountLinks({
          links: (profile.links as MasterProfileInput["links"]) ?? [],
          linkedWebsite: profile.linkedWebsite,
          linkedIndeed: profile.linkedIndeed,
          linkedGlassdoor: profile.linkedGlassdoor,
          linkedGithub: profile.linkedGithub,
          linkedLinkedin: profile.linkedLinkedin,
          linkedHandshake: profile.linkedHandshake,
        }),
        seniorityTier: profile.seniorityTier,
        timelineContext: profile.timelineContext,
        toneGuidance: profile.toneGuidance,
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
 * Renames a revision the account owns. The stored snapshot stays unchanged.
 */
export async function renameProfileRevision(
  accountId: string,
  revisionId: string,
  newName: string
): Promise<ActionResult> {
  const name = newName.trim();
  if (!name || name.length > 160) {
    return { ok: false, error: "Revision name must be 1–160 characters." };
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { profile: { select: { id: true } } },
  });
  if (!account?.profile) return { ok: false, error: "Profile not found" };

  const target = await prisma.profileHistory.findUnique({
    where: { id: revisionId },
    select: { id: true, profileId: true },
  });
  if (!target || target.profileId !== account.profile.id) {
    return { ok: false, error: "Revision not found" };
  }

  await prisma.profileHistory.update({
    where: { id: revisionId },
    data: { summary: name },
  });
  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Sole mutation for Job Radar match threshold.
 * Writes PermanentSettings.matchScoreThreshold (canonical) and mirrors
 * UserProfile.matchThreshold when a resume profile exists.
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

  const next = snapMatchThreshold(parsed.data);

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      email: true,
      persistentProfileId: true,
      profile: { select: { id: true } },
    },
  });
  if (!account) {
    return { ok: false, error: "Account not found" };
  }

  try {
    const durable = await ensurePersistentProfileForAccount(account);

    await prisma.permanentSettings.upsert({
      where: { persistentProfileId: durable.id },
      create: {
        persistentProfileId: durable.id,
        matchScoreThreshold: next,
      },
      update: { matchScoreThreshold: next },
    });

    if (account.profile) {
      await prisma.userProfile.update({
        where: { accountId },
        data: { matchThreshold: next },
      });
    }

    revalidatePath("/settings");
    revalidatePath("/jobs");
    return { ok: true, data: { matchThreshold: next } };
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
  const parsed = linkedAccountsSchema.safeParse(normalizedLinkedAccounts(input));
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
