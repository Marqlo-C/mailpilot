/**
 * ============================================================================
 * SINGLE SOURCE OF TRUTH (SSOT) FOR PERSONA ENGINE CONTRACTS
 * 
 * If you add, remove, or modify fields upstream in the Master Profile, or
 * expand persona classifications, THIS is the sole contract file to update.
 * ============================================================================
 */

/* -------------------------------------------------------------------------- */
/*                          1. INPUT: FACT LENS                               */
/* -------------------------------------------------------------------------- */

export type PersonaExperienceFact = {
  role: string;
  company: string;
  startDate: string | null;
  endDate: string | null;
  category?: string;
  bulletsCount: number;
};

export type PersonaEducationFact = {
  institution: string;
  degree: string | null;
  fieldOfStudy: string | null;
  graduationDate: string | null;
  status: "GRADUATED" | "IN_PROGRESS" | "INCOMPLETE";
  honors: string[];
};

export type PersonaFactLens = {
  experiences: PersonaExperienceFact[];
  education: PersonaEducationFact[];
  certificationsCount: number;
  projectsCount: number;
  skillsCount: number;
  summary?: string | null;
};

/* -------------------------------------------------------------------------- */
/*                       2. MULTI-DIMENSIONAL TYPES                           */
/* -------------------------------------------------------------------------- */

export const SENIORITY_TIERS = [
  "Student / Intern",
  "Early Career / New Grad",
  "Mid-Level Professional",
  "Senior / Lead Professional",
  "Principal / Executive / Director",
  "Career Switcher",
] as const;
export type SeniorityTier = (typeof SENIORITY_TIERS)[number];

export const CANDIDATE_ARCHETYPES = [
  "Deep Specialist",
  "Cross-Disciplinary Hybrid",
  "Applied Practitioner / Skill-Certified",
  "Generalist Practitioner",
] as const;
export type CandidateArchetype = (typeof CANDIDATE_ARCHETYPES)[number];

export const LEADERSHIP_SCOPES = [
  "Individual Contributor / Practitioner",
  "Project / Team Lead",
  "Founder / Organizational Leader",
] as const;
export type LeadershipScope = (typeof LEADERSHIP_SCOPES)[number];

export const DISTINCTION_ANCHORS = [
  "Academic Honors / Pedigree",
  "High Project Velocity / Certified Portfolio",
  "None / Production Tenure",
] as const;
export type DistinctionAnchor = (typeof DISTINCTION_ANCHORS)[number];

/* -------------------------------------------------------------------------- */
/*                         3. OUTPUT: PUBLIC CONTRACT                         */
/* -------------------------------------------------------------------------- */

export type CandidatePersona = {
  // Orthogonal Dimensions
  seniorityTier: SeniorityTier;
  archetype: CandidateArchetype;
  leadershipScope: LeadershipScope;
  distinctionAnchor: DistinctionAnchor;

  // Synthesized Prose for Downstream LLM Prompting
  timelineContext: string;
  toneGuidance: string;

  // Metadata / Reasoning
  titleFamily: string;
  inFieldYears: number;
  calendarYears: number;
};

/** Stored persona fields plus the title-family, tenure, and heuristic reasoning behind them. */
export type PersonaBreakdown = CandidatePersona & {
  rationale: string[];
};
