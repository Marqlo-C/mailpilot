/**
 * ============================================================================
 * ANTI-CORRUPTION ADAPTER LENS: MATCH CANDIDATE LENS
 * 
 * ATTENTION FUTURE DEVELOPERS:
 * This is the SOLE adapter file permitted to map raw profile structures and
 * candidate personas into the canonical MatchCandidateLens contract.
 * All downstream match scoring evaluators must consume this lens.
 * ============================================================================
 */

import type { MasterProfileInput } from "@/lib/validations/profile";
import type { CandidatePersona } from "@/lib/persona";
import type {
  CandidateProfileSummary,
  CandidatePersonaSummary,
} from "@/lib/ai/classifier";
import { flattenSkillItems, skillGroupsFromUnknown } from "@/lib/skill-groups";
import type { MatchCandidateLens } from "./schema.ssot";

/**
 * Extracts normalized candidate matching facts from profile input and synthesized persona.
 */
export function extractMatchCandidateLens(
  profile?: MasterProfileInput | CandidateProfileSummary | null,
  persona?: CandidatePersona | CandidatePersonaSummary | null
): MatchCandidateLens {
  let skills: string[] = [];
  let recentRoles: string[] = [];
  let summary: string | null = null;

  if (profile) {
    if ("targetTitles" in profile) {
      // CandidateProfileSummary
      skills = Array.isArray(profile.skills) ? profile.skills : [];
      recentRoles = Array.isArray(profile.targetTitles) ? profile.targetTitles : [];
      summary = profile.experienceSummary || null;
    } else {
      // MasterProfileInput
      if (Array.isArray(profile.skills)) {
        if (profile.skills.length > 0 && typeof profile.skills[0] === "string") {
          skills = profile.skills.map((s) => String(s).trim()).filter(Boolean);
        } else {
          skills = flattenSkillItems(profile.skills);
        }
      } else if (profile.skills) {
        skills = flattenSkillItems(profile.skills);
      }

      recentRoles = (profile.experiences ?? [])
        .slice(0, 5)
        .map((exp) => exp.role?.trim())
        .filter((role): role is string => Boolean(role && role.length > 0));

      summary = profile.summary?.trim() || null;
    }
  }

  const seniorityTier =
    persona?.seniorityTier ??
    (profile && "persona" in profile ? profile.persona?.seniorityTier ?? null : null);
  const inFieldYears =
    (persona && "inFieldYears" in persona ? persona.inFieldYears : 0) ?? 0;
  const archetype =
    (persona && "archetype" in persona ? persona.archetype : null) ?? null;
  const timelineContext =
    persona?.timelineContext ??
    (profile && "persona" in profile ? profile.persona?.timelineContext ?? null : null);
  const titleFamily =
    (persona && "titleFamily" in persona ? persona.titleFamily : null) ?? null;

  return {
    skills,
    recentRoles,
    summary,
    seniorityTier,
    inFieldYears,
    archetype,
    timelineContext,
    titleFamily,
  };
}
