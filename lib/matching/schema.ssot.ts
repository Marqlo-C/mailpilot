/**
 * ============================================================================
 * SINGLE SOURCE OF TRUTH (SSOT): MATCH SCORING DOMAIN CONTRACT
 * 
 * ATTENTION FUTURE DEVELOPERS:
 * This file is the canonical contract for match scoring and candidate
 * matching representations. If you need to add, rename, or change data shapes,
 * THIS IS THE FIRST AND ONLY CONTRACT FILE TO EDIT. Do NOT bypass this file
 * by importing raw Prisma models downstream.
 * ============================================================================
 */

/**
 * Three-tier match stratification:
 * - "HIGH": Score >= 75 (strong profile and skill alignment).
 * - "MID": Score between 50 and 74 (moderate alignment or adjacent background).
 * - "LOW": Score < 50 (below threshold / significant skill or level mismatch).
 */
export type MatchTier = "HIGH" | "MID" | "LOW";

/**
 * Relative seniority comparison between candidate and job posting:
 * - "ALIGNED": Candidate seniority tier matches role level expectations.
 * - "REACH": Role requires higher seniority or scope than candidate's current tier.
 * - "OVERQUALIFIED": Candidate is significantly more senior than role level.
 */
export type SeniorityFit = "ALIGNED" | "REACH" | "OVERQUALIFIED";

/**
 * Normalized result of a match evaluation.
 */
export interface MatchResult {
  /** Numeric fit score (0-100) */
  score: number;

  /** Stratified fit tier */
  tier: MatchTier;

  /** Human-readable explanation of alignment and gaps */
  reason: string;

  /** Candidate skills that explicitly match the job posting */
  matchedSkills: string[];

  /** Job requirements/skills that appear missing from candidate profile */
  missingRequirements: string[];

  /** Evaluated seniority alignment */
  seniorityFit: SeniorityFit;
}

/**
 * Standardized candidate facts consumed by the matching engine.
 * Decouples match scoring from raw Prisma UserProfile or MasterProfile models.
 */
export interface MatchCandidateLens {
  /** Flattened candidate skill keywords */
  skills: string[];

  /** Recent role titles held by candidate */
  recentRoles: string[];

  /** Executive or professional summary text */
  summary: string | null;

  /** Synthesized seniority tier (e.g., "Senior", "Lead", "Staff", "Early Career") */
  seniorityTier: string | null;

  /** Estimated active years of relevant experience */
  inFieldYears: number;

  /** Disciplinary archetype (e.g., "Generalist", "Domain Specialist") */
  archetype: string | null;

  /** Trajectory / timeline summary (e.g., "8 years in Product") */
  timelineContext?: string | null;

  /** Canonical functional domain / discipline (e.g., "Product Management") */
  titleFamily?: string | null;
}
