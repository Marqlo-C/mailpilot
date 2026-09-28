import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type {
  MasterProfileInput,
  MasterProfileUpdateInput,
} from "@/lib/validations/profile";

const MAX_HISTORY_STATES = 5;

type ProfileTree = {
  fullName: string;
  email: string;
  phone: string | null;
  location: string | null;
  summary: string | null;
  links: unknown;
  skills: unknown;
  linkedWebsite?: string | null;
  linkedIndeed?: string | null;
  linkedGlassdoor?: string | null;
  linkedGithub?: string | null;
  linkedLinkedin?: string | null;
  linkedHandshake?: string | null;
  experiences: Array<{
    id: string;
    company: string;
    role: string;
    location: string | null;
    startDate: string;
    endDate: string | null;
    bullets: unknown;
    displayOrder: number;
  }>;
  projects: Array<{
    id: string;
    name: string;
    description: string;
    technologies: string[];
    link: string | null;
    bullets: string[];
  }>;
  education: Array<{
    id: string;
    institution: string;
    degree: string;
    fieldOfStudy: string | null;
    graduationDate: string | null;
  }>;
};

/** Serializes a loaded UserProfile tree into MasterProfileUpdateInput. */
export function serializeUserProfileToInput(
  profile: ProfileTree
): MasterProfileUpdateInput {
  return {
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
    linkedWebsite: profile.linkedWebsite ?? null,
    linkedIndeed: profile.linkedIndeed ?? null,
    linkedGlassdoor: profile.linkedGlassdoor ?? null,
    linkedGithub: profile.linkedGithub ?? null,
    linkedLinkedin: profile.linkedLinkedin ?? null,
    linkedHandshake: profile.linkedHandshake ?? null,
  };
}

/**
 * Loads the current profile tree for snapshotting. Returns null if missing.
 */
export async function loadProfileSnapshot(
  profileId: string
): Promise<MasterProfileUpdateInput | null> {
  const profile = await prisma.userProfile.findUnique({
    where: { id: profileId },
    include: {
      experiences: { orderBy: { displayOrder: "asc" } },
      projects: true,
      education: true,
    },
  });
  if (!profile) return null;
  return serializeUserProfileToInput(profile);
}

/**
 * Saves a pre-change snapshot of the profile, maintaining a strict 5-item cap.
 */
export async function recordProfileSnapshot(
  profileId: string,
  summary: string,
  snapshot: MasterProfileInput | MasterProfileUpdateInput
): Promise<void> {
  await prisma.profileHistory.create({
    data: {
      profileId,
      summary,
      snapshot: snapshot as Prisma.InputJsonValue,
    },
  });

  const excess = await prisma.profileHistory.findMany({
    where: { profileId },
    orderBy: { createdAt: "desc" },
    skip: MAX_HISTORY_STATES,
    select: { id: true },
  });

  if (excess.length > 0) {
    await prisma.profileHistory.deleteMany({
      where: { id: { in: excess.map((r) => r.id) } },
    });
  }
}
