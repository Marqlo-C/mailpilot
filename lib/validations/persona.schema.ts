import { z } from "zod";

/* -------------------------------------------------------------------------- */
/*                          1. INPUT: FACT LENS                               */
/* -------------------------------------------------------------------------- */

export const personaExperienceFactSchema = z.object({
  role: z.string(),
  company: z.string(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  category: z.string().optional(),
  bulletsCount: z.number(),
});
export type PersonaExperienceFact = z.infer<typeof personaExperienceFactSchema>;

export const personaEducationFactSchema = z.object({
  institution: z.string(),
  degree: z.string().nullable(),
  fieldOfStudy: z.string().nullable(),
  graduationDate: z.string().nullable(),
  status: z.enum(["GRADUATED", "IN_PROGRESS", "INCOMPLETE"]),
  honors: z.array(z.string()),
});
export type PersonaEducationFact = z.infer<typeof personaEducationFactSchema>;

export const personaFactLensSchema = z.object({
  experiences: z.array(personaExperienceFactSchema),
  education: z.array(personaEducationFactSchema),
  certificationsCount: z.number(),
  projectsCount: z.number(),
  skillsCount: z.number(),
  summary: z.string().nullable().optional(),
});
export type PersonaFactLens = z.infer<typeof personaFactLensSchema>;

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
export const seniorityTierSchema = z.enum(SENIORITY_TIERS);
export type SeniorityTier = (typeof SENIORITY_TIERS)[number];

export const CANDIDATE_ARCHETYPES = [
  "Deep Specialist",
  "Cross-Disciplinary Hybrid",
  "Applied Practitioner / Skill-Certified",
  "Generalist Practitioner",
] as const;
export const candidateArchetypeSchema = z.enum(CANDIDATE_ARCHETYPES);
export type CandidateArchetype = (typeof CANDIDATE_ARCHETYPES)[number];

export const LEADERSHIP_SCOPES = [
  "Individual Contributor / Practitioner",
  "Project / Team Lead",
  "Founder / Organizational Leader",
] as const;
export const leadershipScopeSchema = z.enum(LEADERSHIP_SCOPES);
export type LeadershipScope = (typeof LEADERSHIP_SCOPES)[number];

export const DISTINCTION_ANCHORS = [
  "Academic Honors / Pedigree",
  "High Project Velocity / Certified Portfolio",
  "None / Production Tenure",
] as const;
export const distinctionAnchorSchema = z.enum(DISTINCTION_ANCHORS);
export type DistinctionAnchor = (typeof DISTINCTION_ANCHORS)[number];

/* -------------------------------------------------------------------------- */
/*                         3. OUTPUT: PUBLIC CONTRACT                         */
/* -------------------------------------------------------------------------- */

export const candidatePersonaSchema = z.object({
  // Orthogonal Dimensions
  seniorityTier: seniorityTierSchema,
  archetype: candidateArchetypeSchema,
  leadershipScope: leadershipScopeSchema,
  distinctionAnchor: distinctionAnchorSchema,

  // Synthesized Prose for Downstream LLM Prompting
  timelineContext: z.string(),
  toneGuidance: z.string(),

  // Metadata / Reasoning
  titleFamily: z.string(),
  inFieldYears: z.number(),
  calendarYears: z.number(),
});
export type CandidatePersona = z.infer<typeof candidatePersonaSchema>;

/** Stored persona fields plus the title-family, tenure, and heuristic reasoning behind them. */
export const personaBreakdownSchema = candidatePersonaSchema.extend({
  rationale: z.array(z.string()),
});
export type PersonaBreakdown = z.infer<typeof personaBreakdownSchema>;
