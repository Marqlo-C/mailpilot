import { z } from "zod";

/**
 * Three-tier match stratification:
 * - "HIGH": Score >= 75 (strong profile and skill alignment).
 * - "MID": Score between 50 and 74 (moderate alignment or adjacent background).
 * - "LOW": Score < 50 (below threshold / significant skill or level mismatch).
 */
export const matchTierSchema = z.enum(["HIGH", "MID", "LOW"]);
export type MatchTier = z.infer<typeof matchTierSchema>;

/**
 * Relative seniority comparison between candidate and job posting:
 * - "ALIGNED": Candidate seniority tier matches role level expectations.
 * - "REACH": Role requires higher seniority or scope than candidate's current tier.
 * - "OVERQUALIFIED": Candidate is significantly more senior than role level.
 */
export const seniorityFitSchema = z.enum(["ALIGNED", "REACH", "OVERQUALIFIED"]);
export type SeniorityFit = z.infer<typeof seniorityFitSchema>;

/**
 * Normalized result of a match evaluation.
 */
export const matchResultSchema = z.object({
  /** Numeric fit score (0-100) */
  score: z.number().min(0).max(100),

  /** Stratified fit tier */
  tier: matchTierSchema,

  /** Human-readable explanation of alignment and gaps */
  reason: z.string(),

  /** Candidate skills that explicitly match the job posting */
  matchedSkills: z.array(z.string()),

  /** Job requirements/skills that appear missing from candidate profile */
  missingRequirements: z.array(z.string()),

  /** Evaluated seniority alignment */
  seniorityFit: seniorityFitSchema,
});
export type MatchResult = z.infer<typeof matchResultSchema>;

/**
 * Standardized candidate facts consumed by the matching engine.
 * Decouples match scoring from raw Prisma UserProfile or MasterProfile models.
 */
export const matchCandidateLensSchema = z.object({
  /** Flattened candidate skill keywords */
  skills: z.array(z.string()),

  /** Recent role titles held by candidate */
  recentRoles: z.array(z.string()),

  /** Executive or professional summary text */
  summary: z.string().nullable(),

  /** Synthesized seniority tier (e.g., "Senior", "Lead", "Staff", "Early Career") */
  seniorityTier: z.string().nullable(),

  /** Estimated active years of relevant experience */
  inFieldYears: z.number(),

  /** Disciplinary archetype (e.g., "Generalist", "Domain Specialist") */
  archetype: z.string().nullable(),

  /** Trajectory / timeline summary (e.g., "8 years in Product") */
  timelineContext: z.string().nullish(),

  /** Canonical functional domain / discipline (e.g., "Product Management") */
  titleFamily: z.string().nullish(),
});
export type MatchCandidateLens = z.infer<typeof matchCandidateLensSchema>;
