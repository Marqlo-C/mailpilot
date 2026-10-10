import { extractPersonaFacts, type MasterProfileInput } from "./lens";
import { classifyPersonaMatrix } from "./matrix";
import type {
  CandidatePersona,
  PersonaBreakdown,
  PersonaFactLens,
} from "./schema.ssot";
import {
  buildTimelineContext,
  composeToneGuidance,
} from "./tone-composer";

function isPersonaFactLens(input: unknown): input is PersonaFactLens {
  if (!input || typeof input !== "object") return false;
  const cand = input as Record<string, unknown>;
  return (
    typeof cand.certificationsCount === "number" &&
    typeof cand.projectsCount === "number" &&
    typeof cand.skillsCount === "number" &&
    Array.isArray(cand.experiences) &&
    Array.isArray(cand.education)
  );
}

/**
 * Inspects experiences + education to derive multidimensional seniority,
 * archetype, leadership scope, distinction anchor, timeline summary,
 * tone guidance, and rationale.
 */
export function explainCandidatePersona(
  input: PersonaFactLens | MasterProfileInput | unknown
): PersonaBreakdown {
  const facts = isPersonaFactLens(input)
    ? input
    : extractPersonaFacts((input ?? {}) as MasterProfileInput);

  const matrix = classifyPersonaMatrix(facts);

  const timelineContext = buildTimelineContext({
    seniorityTier: matrix.seniorityTier,
    inFieldYears: matrix.inFieldYears,
    calendarYears: matrix.calendarYears,
    priorFieldYears: matrix.priorFieldYears,
    firstRole: matrix.firstRole,
    latestRole: matrix.latestRole,
    latestGraduationDate: matrix.latestGraduationDate,
    yearsSinceGrad: matrix.yearsSinceGrad,
  });

  const toneGuidance = composeToneGuidance({
    seniorityTier: matrix.seniorityTier,
    archetype: matrix.archetype,
    leadershipScope: matrix.leadershipScope,
    distinctionAnchor: matrix.distinctionAnchor,
    inFieldYears: matrix.inFieldYears,
    priorFieldYears: matrix.priorFieldYears,
  });

  return {
    seniorityTier: matrix.seniorityTier,
    archetype: matrix.archetype,
    leadershipScope: matrix.leadershipScope,
    distinctionAnchor: matrix.distinctionAnchor,
    timelineContext,
    toneGuidance,
    titleFamily: matrix.titleFamily,
    inFieldYears: matrix.inFieldYears,
    calendarYears: matrix.calendarYears,
    rationale: matrix.rationale,
  };
}

/**
 * Derives full CandidatePersona contract from either raw profile or fact lens.
 */
export function synthesizeCandidatePersona(
  input: PersonaFactLens | MasterProfileInput | unknown
): CandidatePersona {
  const explained = explainCandidatePersona(input);
  return {
    seniorityTier: explained.seniorityTier,
    archetype: explained.archetype,
    leadershipScope: explained.leadershipScope,
    distinctionAnchor: explained.distinctionAnchor,
    timelineContext: explained.timelineContext,
    toneGuidance: explained.toneGuidance,
    titleFamily: explained.titleFamily,
    inFieldYears: explained.inFieldYears,
    calendarYears: explained.calendarYears,
  };
}
