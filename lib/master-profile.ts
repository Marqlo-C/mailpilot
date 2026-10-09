import type { ProfileWithPersonaCache } from "@/lib/ai/persona";
import { prisma } from "@/lib/prisma";
import { skillGroupsFromUnknown } from "@/lib/skill-groups";
import {
  awardsSchema,
  certificationsSchema,
  interestsSchema,
  type MasterProfileInput,
} from "@/lib/validations/profile";

/**
 * Loads the master resume plus cached persona columns for drafting.
 * Shared by application and opportunity dispatch paths.
 */
export async function loadMasterProfileForDraft(
  accountId: string
): Promise<ProfileWithPersonaCache> {
  const profile = await prisma.userProfile.findUnique({
    where: { accountId },
    include: {
      experiences: { orderBy: { displayOrder: "asc" } },
      projects: true,
      education: true,
    },
  });

  if (!profile) {
    throw new Error("Master resume profile not found. Upload a resume first.");
  }

  return {
    accountId: profile.accountId,
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
      honors: Array.isArray(ed.honors)
        ? ed.honors.filter((item): item is string => typeof item === "string")
        : [],
    })),
    certifications: certificationsSchema.parse(profile.certifications),
    awards: awardsSchema.parse(profile.awards),
    interests: interestsSchema.parse(profile.interests),
    seniorityTier: profile.seniorityTier,
    timelineContext: profile.timelineContext,
    toneGuidance: profile.toneGuidance,
  };
}
