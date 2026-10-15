/**
 * ============================================================================
 * ANTI-CORRUPTION ADAPTER LENS: OPPORTUNITIES CONTEXT
 * 
 * ATTENTION FUTURE DEVELOPERS:
 * This is the SOLE adapter file permitted to map and translate raw database rows,
 * scraper outputs, or external payloads into the canonical NormalizedJobOpportunity.
 * All downstream matching and UI pipelines must consume the output of this lens.
 * ============================================================================
 */

import type { JobOpportunity } from "@prisma/client";
import type { ApplicationType } from "@/lib/application-method";
import type {
  ClassificationMethod,
  ContextRichness,
  NormalizedJobOpportunity,
} from "./schema.ssot";
import { extractCleanSnippet, sanitizeJobDescription } from "./scrubber";
import { formatDistanceToNow } from "@/lib/format-distance";
import { normalizeSalaryDisplay, parseSalaryMax } from "@/lib/ai/classifier";

/**
 * Checks whether a given posted date string is unspecified, placeholder, or empty.
 */
export function isUnspecifiedPostedAt(value: string | null | undefined): boolean {
  if (!value || !value.trim()) return true;
  const cleaned = value.trim().toLowerCase();
  return (
    cleaned === "not specified" ||
    cleaned === "posted: not specified" ||
    cleaned === "posted: unspecified" ||
    cleaned === "unspecified" ||
    cleaned === "unknown" ||
    cleaned === "n/a" ||
    cleaned === "none" ||
    cleaned === "tbd" ||
    /^posted:\s*(?:not\s*specified|unspecified|unknown|n\/?a|none|tbd)$/i.test(cleaned)
  );
}

/**
 * Normalizes a postedAt candidate string or extracts a posted/reposted relative date
 * from fallback spec text.
 */
export function normalizePostedAt(
  dateStr?: string | null,
  textFallback?: string | null
): string | null {
  // 1. Evaluate primary candidate date string
  if (dateStr && !isUnspecifiedPostedAt(dateStr)) {
    let trimmed = dateStr.trim();

    // Check if ISO date string (YYYY-MM-DD...)
    const parsedDate = Date.parse(trimmed);
    if (!isNaN(parsedDate) && /^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return formatDistanceToNow(new Date(parsedDate), { addSuffix: true });
    }

    // Clean leading "Posted: " or "Posted " if present
    if (/^posted\s*:\s*/i.test(trimmed)) {
      trimmed = trimmed.replace(/^posted\s*:\s*/i, "");
    } else if (/^posted\s+/i.test(trimmed)) {
      trimmed = trimmed.replace(/^posted\s+/i, "");
    }

    // Clean leading "Reposted: " if present
    if (/^reposted\s*:\s*/i.test(trimmed)) {
      trimmed = trimmed.replace(/^reposted\s*:\s*/i, "Reposted ");
    }

    if (trimmed && !isUnspecifiedPostedAt(trimmed)) {
      return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    }
  }

  // 2. Evaluate fallback spec / header text if dateStr was absent or unspecified
  if (textFallback && typeof textFallback === "string") {
    const match = textFallback.match(
      /\b(reposted|posted)\s*(?:on\s+|:\s*)?(\d+\+?\s+(?:minutes?|hours?|days?|weeks?|months?)\s+ago|yesterday|today|just\s+now|just\s+posted)\b/i
    );
    if (match) {
      const isReposted = match[1].toLowerCase() === "reposted";
      const timePart = match[2].trim();
      const formattedTime = timePart.charAt(0).toUpperCase() + timePart.slice(1);
      return isReposted ? `Reposted ${timePart}` : formattedTime;
    }
  }

  return null;
}

/**
 * Maps raw database records or partial scraper payloads into the canonical
 * NormalizedJobOpportunity contract.
 */
export function resolveJobOpportunity(
  opportunity: Partial<JobOpportunity>,
  inboundRaw?: string | null
): NormalizedJobOpportunity {
  const company = opportunity.company?.trim() || "Unknown Company";
  const rawTitle = opportunity.title?.trim() || "Role";
  const roleTitle =
    rawTitle
      .replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u00AD]/g, "")
      .replace(/\s+/g, " ")
      .trim() || "Role";

  const normalizedSalary = opportunity.salary
    ? normalizeSalaryDisplay(opportunity.salary)
    : null;

  const fallbackContext = {
    roleTitle,
    company,
    location: opportunity.location ?? null,
    salary: normalizedSalary,
  };

  const rawDesc = opportunity.description || inboundRaw || "";
  const scrubbedDescription = sanitizeJobDescription(rawDesc, 4000, fallbackContext);
  const snippet = extractCleanSnippet(
    inboundRaw || opportunity.description || "",
    500,
    1500,
    fallbackContext
  );

  const hasExplicitRequirements =
    /(?:requirements|qualifications|must\s+have|what\s+you(?:'ll|\s+will)\s+bring|what\s+we(?:'re|\s+are)\s+looking\s+for|preferred\s+skills|minimum\s+qualifications)/i.test(
      scrubbedDescription
    );

  const richness: ContextRichness =
    scrubbedDescription.length > 300 || hasExplicitRequirements
      ? "RICH_SPEC"
      : "MINIMAL_LEAD";


  const applicationType: ApplicationType =
    opportunity.applicationType === "DIRECT_EMAIL" ||
    opportunity.applicationType === "QUICK_APPLY" ||
    opportunity.applicationType === "EXTERNAL_LINK"
      ? opportunity.applicationType
      : "EXTERNAL_LINK";

  const classificationMethod: ClassificationMethod =
    opportunity.classificationMethod === "HEURISTIC" ||
    opportunity.classificationMethod === "HYBRID" ||
    opportunity.classificationMethod === "AI"
      ? opportunity.classificationMethod
      : "AI";

  const isDirectOutreach =
    applicationType === "DIRECT_EMAIL" ||
    Boolean(opportunity.recipientEmail?.trim());

  const formattedPostedAt = normalizePostedAt(opportunity.postedAt);

  const salaryMax =
    typeof opportunity.salaryMax === "number"
      ? opportunity.salaryMax
      : normalizedSalary
        ? parseSalaryMax(normalizedSalary)
        : null;

  const validApplyUrl =
    opportunity.applyUrl && /^https?:\/\//i.test(opportunity.applyUrl.trim())
      ? opportunity.applyUrl.trim()
      : null;

  return {
    id: opportunity.id,
    company,
    companyDomain: opportunity.companyDomain ?? null,
    logoUrl: opportunity.logoUrl ?? null,
    roleTitle,
    location: opportunity.location ?? null,
    salary: normalizedSalary,
    salaryMax,
    status: opportunity.status || "DISCOVERED",
    postedAt: formattedPostedAt,
    receivedAt: opportunity.receivedAt ?? new Date(),
    applyUrl: validApplyUrl,
    applicationType,
    classificationMethod,
    inboundSnippet: snippet,
    jobDescription: scrubbedDescription,
    contactEmail: opportunity.recipientEmail ?? null,
    contactName: opportunity.recipientName ?? null,
    isDirectOutreach,
    richness,
    hasExplicitRequirements,
    matchScore: opportunity.matchScore,
    matchReason: opportunity.matchReason ?? null,
  };
}
