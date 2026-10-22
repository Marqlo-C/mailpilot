/**
 * ============================================================================
 * SINGLE SOURCE OF TRUTH (SSOT): OPPORTUNITIES CONTEXT DOMAIN
 * 
 * ATTENTION FUTURE DEVELOPERS:
 * This file is the canonical contract for NormalizedJobOpportunity.
 * If you need to add, rename, or change data shapes, THIS IS THE FIRST AND
 * ONLY CONTRACT FILE TO EDIT. Do NOT bypass this file by importing raw
 * Prisma models downstream.
 * ============================================================================
 */

import type { ApplicationType } from "@/lib/opportunities/application-method";

/**
 * How this opportunity was classified:
 * - "AI": Full LLM inference completed successfully.
 * - "HEURISTIC": Classified via deterministic rules / Grand Heuristic engine.
 * - "HYBRID": Heuristic confirmation combined with AI attribute enrichment.
 */
export type ClassificationMethod = "AI" | "HEURISTIC" | "HYBRID";

/**
 * Context density of the posting:
 * - "RICH_SPEC": Full job description with detailed requirements, duties, and qualifications.
 * - "MINIMAL_LEAD": Brief outreach note, digest row, or notification without a full spec.
 */
export type ContextRichness = "RICH_SPEC" | "MINIMAL_LEAD";

/**
 * Canonical normalized job opportunity.
 * Downstream components (matchers, UI cards, tailor, draft generators) consume
 * strictly this structure, shielding downstream logic from raw database shifts.
 */
export interface NormalizedJobOpportunity {
  /* ------------------------------------------------------------------------ */
  /*                      1. IDENTITY & CARD METADATA                         */
  /* ------------------------------------------------------------------------ */

  /** Database ID if persisted; optional for transient evaluations */
  id?: string;

  /** Canonical hiring organization or company name */
  company: string;

  /** Website domain inferred for zero-token logo lookup (e.g. "stripe.com") */
  companyDomain?: string | null;

  /** Resolved logo URL or Google S2/Unavatar favicon */
  logoUrl?: string | null;

  /** Standardized role or position title */
  roleTitle: string;

  /** Normalized location (e.g., "Remote", "San Francisco, CA", "Hybrid") */
  location?: string | null;

  /** Human-readable salary display string (e.g., "$120,000 - $150,000/yr") */
  salary?: string | null;

  /** Annualized maximum numeric salary for sorting and filtering */
  salaryMax?: number | null;

  /** Lifecycle status (DISCOVERED, REVIEW_READY, APPLIED, DISMISSED) */
  status: string;

  /** Listing age or post date string (e.g., "2 days ago", "Just posted") */
  postedAt?: string | null;

  /** Timestamp when the source email was received in Gmail */
  receivedAt?: Date;

  /** Destination application URL (portal, ATS, or job board link) */
  applyUrl?: string | null;

  /** Direct email, external ATS portal, or quick apply */
  applicationType: ApplicationType;

  /** Classification mechanism: AI, HEURISTIC, or HYBRID */
  classificationMethod: ClassificationMethod;

  /* ------------------------------------------------------------------------ */
  /*                             2. TEXT BUFFERS                              */
  /* ------------------------------------------------------------------------ */

  /**
   * Smart preview snippet derived from the inbound email message.
   * Ramped up to natural sentence boundaries (max 1,500 characters).
   */
  inboundSnippet: string;

  /**
   * Sanitized job description.
   * Stripped of EEO statements, perks/benefits fluff, and culture boilerplate.
   * Clamped to 4,000–6,000 characters.
   */
  jobDescription: string;

  /* ------------------------------------------------------------------------ */
  /*                           3. OUTREACH CONTEXT                            */
  /* ------------------------------------------------------------------------ */

  /** Direct recruiter or hiring manager contact email */
  contactEmail?: string | null;

  /** Direct recruiter or hiring manager name */
  contactName?: string | null;

  /** True if this was an inbound direct outreach to the candidate */
  isDirectOutreach: boolean;

  /** Qualitative richness assessment of the job content */
  richness: ContextRichness;

  /** True if explicit requirements/qualifications bullets are detected */
  hasExplicitRequirements: boolean;

  /** Optional match fit score (0-100) vs candidate profile */
  matchScore?: number;

  /** Optional one-sentence fit/mismatch explanation */
  matchReason?: string | null;
}
