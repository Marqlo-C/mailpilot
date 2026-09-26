"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { extractTextFromFile } from "@/lib/document-parser";
import { syncGitHubProjects, normalizeGitHubUsername } from "@/lib/github-sync";
import { parseLinkedInArchive } from "@/lib/linkedin-archive-parser";
import { prisma } from "@/lib/prisma";
import { parseResumeToStructuredProfile } from "@/lib/resume-parser";
import {
  contactInfoSchema,
  linkedAccountsSchema,
  masterProfileSchema,
  matchThresholdSchema,
  resolveMfaPreferredChannel,
  type ContactInfoInput,
  type LinkedAccountsInput,
  type MasterProfileInput,
  type MasterProfileUpdateInput,
} from "@/lib/validations/profile";
import { parseAccountRules } from "@/lib/validations/rules";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

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
    const draft = await parseResumeToStructuredProfile(text, {
      llmProvider:
        account.settings?.llmProvider === "LOCAL_OLLAMA"
          ? "LOCAL_OLLAMA"
          : "OPENROUTER",
      localOllamaUrl: account.settings?.localOllamaUrl,
    });

    return { ok: true, data: draft };
  } catch (error) {
    console.error("extractResumeDraft failed", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Resume extraction failed",
    };
  }
}

/**
 * Transactionally upserts the master profile and related entities.
 * Resume import path — does not overwrite MFA / linked account URLs.
 */
export async function saveMasterProfile(
  accountId: string,
  data: MasterProfileInput
): Promise<ActionResult<{ profileId: string }>> {
  const existing = await prisma.userProfile.findUnique({
    where: { accountId },
  });

  return updateMasterProfile(accountId, {
    ...data,
    mfaPhoneNumber: existing?.mfaPhoneNumber ?? null,
    mfaReserveEmail: existing?.mfaReserveEmail ?? null,
    mfaEnabled: existing?.mfaEnabled ?? false,
    mfaPreferredChannel:
      (existing?.mfaPreferredChannel as "SMS" | "EMAIL" | "BOTH" | undefined) ??
      "EMAIL",
    linkedIndeed: existing?.linkedIndeed ?? null,
    linkedGlassdoor: existing?.linkedGlassdoor ?? null,
    linkedGithub: existing?.linkedGithub ?? null,
    linkedLinkedin: existing?.linkedLinkedin ?? null,
    linkedHandshake: existing?.linkedHandshake ?? null,
  });
}

/**
 * Full master profile write (core resume fields + MFA + linked URLs).
 * Validates with `masterProfileSchema` and replaces child relations in a transaction.
 */
export async function updateMasterProfile(
  accountId: string,
  data: MasterProfileUpdateInput | MasterProfileInput
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
  const mfaPreferredChannel = resolveMfaPreferredChannel({
    mfaPhoneNumber: payload.mfaPhoneNumber,
    mfaReserveEmail: payload.mfaReserveEmail,
    mfaPreferredChannel: payload.mfaPreferredChannel,
  });

  try {
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
        mfaPhoneNumber: (payload.mfaPhoneNumber ?? "").trim() || null,
        mfaReserveEmail: (payload.mfaReserveEmail ?? "").trim() || null,
        mfaEnabled: payload.mfaEnabled ?? false,
        mfaPreferredChannel,
        linkedIndeed: payload.linkedIndeed ?? null,
        linkedGlassdoor: payload.linkedGlassdoor ?? null,
        linkedGithub: payload.linkedGithub ?? null,
        linkedLinkedin: payload.linkedLinkedin ?? null,
        linkedHandshake: payload.linkedHandshake ?? null,
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
      mfaPhoneNumber: string | null;
      mfaReserveEmail: string | null;
      mfaEnabled: boolean;
      mfaPreferredChannel: "SMS" | "EMAIL" | "BOTH";
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
        mfaPhoneNumber: profile.mfaPhoneNumber,
        mfaReserveEmail: profile.mfaReserveEmail,
        mfaEnabled: profile.mfaEnabled,
        mfaPreferredChannel:
          profile.mfaPreferredChannel === "SMS" ||
          profile.mfaPreferredChannel === "BOTH"
            ? profile.mfaPreferredChannel
            : "EMAIL",
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
 * Updates Contact & MFA fields on UserProfile after Zod safeParse validation.
 */
export async function updateContactInfo(
  accountId: string,
  input: ContactInfoInput
): Promise<ActionResult> {
  const parsed = contactInfoSchema.safeParse(input);
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
      error: "Upload a master resume before saving contact info",
    };
  }

  try {
    const phone = (parsed.data.mfaPhoneNumber ?? "").trim() || null;
    const email = (parsed.data.mfaReserveEmail ?? "").trim() || null;
    const mfaPreferredChannel = resolveMfaPreferredChannel({
      mfaPhoneNumber: phone,
      mfaReserveEmail: email,
      mfaPreferredChannel: parsed.data.mfaPreferredChannel,
    });

    await prisma.userProfile.update({
      where: { accountId },
      data: {
        mfaPhoneNumber: phone,
        mfaReserveEmail: email,
        mfaEnabled: parsed.data.mfaEnabled,
        mfaPreferredChannel,
      },
    });

    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    console.error("updateContactInfo failed", error);
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to update contact info",
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
    include: { profile: true },
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
    const projects = await syncGitHubProjects(username);
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
