"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { extractTextFromFile } from "@/lib/document-parser";
import { prisma } from "@/lib/prisma";
import { parseResumeToStructuredProfile } from "@/lib/resume-parser";
import {
  masterProfileInputSchema,
  type MasterProfileInput,
} from "@/lib/validations/profile";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/**
 * Parses an uploaded resume into a draft MasterProfile for user review.
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

    const text = await extractTextFromFile(file);
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
 */
export async function saveMasterProfile(
  accountId: string,
  data: MasterProfileInput
): Promise<ActionResult<{ profileId: string }>> {
  const parsed = masterProfileInputSchema.safeParse(data);
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

  try {
    const profileId = await prisma.$transaction(async (tx) => {
      const existing = await tx.userProfile.findUnique({
        where: { accountId },
      });

      const profile = existing
        ? await tx.userProfile.update({
            where: { accountId },
            data: {
              fullName: parsed.data.fullName,
              email: parsed.data.email,
              phone: parsed.data.phone ?? null,
              location: parsed.data.location ?? null,
              summary: parsed.data.summary ?? null,
              links: parsed.data.links as Prisma.InputJsonValue,
              skills: parsed.data.skills as Prisma.InputJsonValue,
            },
          })
        : await tx.userProfile.create({
            data: {
              accountId,
              fullName: parsed.data.fullName,
              email: parsed.data.email,
              phone: parsed.data.phone ?? null,
              location: parsed.data.location ?? null,
              summary: parsed.data.summary ?? null,
              links: parsed.data.links as Prisma.InputJsonValue,
              skills: parsed.data.skills as Prisma.InputJsonValue,
            },
          });

      await tx.workExperience.deleteMany({ where: { profileId: profile.id } });
      await tx.project.deleteMany({ where: { profileId: profile.id } });
      await tx.education.deleteMany({ where: { profileId: profile.id } });

      if (parsed.data.experiences.length > 0) {
        await tx.workExperience.createMany({
          data: parsed.data.experiences.map((exp, index) => ({
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

      if (parsed.data.projects.length > 0) {
        await tx.project.createMany({
          data: parsed.data.projects.map((p) => ({
            profileId: profile.id,
            name: p.name,
            description: p.description,
            technologies: p.technologies,
            link: p.link ?? null,
            bullets: p.bullets,
          })),
        });
      }

      if (parsed.data.education.length > 0) {
        await tx.education.createMany({
          data: parsed.data.education.map((ed) => ({
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
    console.error("saveMasterProfile failed", error);
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
): Promise<ActionResult<MasterProfileInput & { updatedAt?: string }>> {
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
