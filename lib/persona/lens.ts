import {
  isWorkExperienceCategory,
  type MasterProfileInput,
} from "@/lib/validations/profile";
import type { PersonaFactLens } from "./schema.ssot";

export type { MasterProfileInput };

/** Profile shape that may already carry cached persona columns from UserProfile. */
export type ProfileWithPersonaCache = MasterProfileInput & {
  accountId?: string | null;
  seniorityTier?: string | null;
  timelineContext?: string | null;
  toneGuidance?: string | null;
};

/**
 * Pure adapter: extracts minimal facts required by the persona matrix
 * from the canonical MasterProfileInput.
 */
export function extractPersonaFacts(
  profile: MasterProfileInput
): PersonaFactLens {
  const p = (profile ?? {}) as Partial<MasterProfileInput>;

  const experiences = (p.experiences ?? [])
    .filter((exp) => exp && isWorkExperienceCategory(exp.category))
    .map((exp) => ({
      role: exp.role?.trim() || "Role",
      company: exp.company?.trim() || "Company",
      startDate: exp.startDate ?? null,
      endDate: exp.endDate ?? null,
      category: exp.category,
      bulletsCount: exp.bullets?.length ?? 0,
    }));

  const education = (p.education ?? [])
    .filter(Boolean)
    .map((ed) => ({
      institution: ed.institution?.trim() || "",
      degree: ed.degree ?? null,
      fieldOfStudy: ed.fieldOfStudy ?? null,
      graduationDate: ed.graduationDate ?? null,
      status: (
        ed.status === "IN_PROGRESS"
          ? "IN_PROGRESS"
          : (ed.status as string) === "INCOMPLETE"
          ? "INCOMPLETE"
          : "GRADUATED"
      ) as "GRADUATED" | "IN_PROGRESS" | "INCOMPLETE",
      honors: Array.isArray(ed.honors)
        ? ed.honors.filter(
            (item): item is string =>
              typeof item === "string" && item.trim().length > 0
          )
        : [],
    }));

  const certificationsCount = p.certifications?.length ?? 0;
  const projectsCount = p.projects?.length ?? 0;
  const skillsCount = (p.skills ?? []).reduce(
    (acc, group) => acc + (group?.items?.length ?? 0),
    0
  );

  return {
    experiences,
    education,
    certificationsCount,
    projectsCount,
    skillsCount,
    summary: p.summary ?? null,
  };
}
