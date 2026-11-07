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
import type { ApplicationType } from "@/lib/opportunities/application-method";
import type {
  ClassificationMethod,
  ContextRichness,
  NormalizedJobOpportunity,
} from "./schema.ssot";
import { extractCleanSnippet, sanitizeJobDescription } from "./scrubber";
import { formatDistanceToNow, formatRelativeTime } from "@/lib/utils/format-distance";
import {
  normalizeSalaryDisplay,
  parseSalaryMax,
  sanitizeCompanyName,
} from "@/lib/ai/classifier";

export { sanitizeCompanyName } from "@/lib/ai/classifier";

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
 * Anchors a relative date expression (e.g. "3 weeks ago", "Posted 25 days ago", "yesterday", "today")
 * to an absolute ISO timestamp based on the scrape / received reference time.
 * Allows job cards to compute real-time relative distance dynamically.
 */
export function relativeTimeToIso(
  relativeStr: string | null | undefined,
  referenceDate: Date | string = new Date()
): string | null {
  if (!relativeStr) return null;
  const s = relativeStr.toLowerCase().trim();
  if (isUnspecifiedPostedAt(s)) return null;

  // If already an ISO string or valid date format
  const parsed = Date.parse(s);
  if (
    !isNaN(parsed) &&
    (/^\d{4}-\d{2}-\d{2}/.test(s) || /^[A-Za-z]{3,9}\s+\d{1,2},\s*\d{4}/.test(s))
  ) {
    return new Date(parsed).toISOString();
  }

  const ref =
    referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const refTime = isNaN(ref.getTime()) ? Date.now() : ref.getTime();

  if (/\b(?:today|just\s+now|just\s+posted|moments?\s+ago)\b/i.test(s)) {
    return new Date(refTime).toISOString();
  }
  if (/\byesterday\b/i.test(s)) {
    return new Date(refTime - 24 * 60 * 60 * 1000).toISOString();
  }

  const cleaned = s
    .replace(/^(?:reposted|posted)\s*[:\s-]*\s*/i, "")
    .replace(/\s*ago\s*$/i, "")
    .trim();

  const match =
    cleaned.match(
      /^(\d+)\+?\s*(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?|d|days?|w|wk|wks|weeks?|mo|mos|months?|y|yr|yrs|years?)$/i
    ) || cleaned.match(/^(\d+)\s*(s|m|h|d|w|mo|y)$/i);

  if (!match) return null;

  const count = parseInt(match[1], 10);
  const u = match[2].toLowerCase();

  let ms = 0;
  if (/^s/i.test(u)) ms = count * 1000;
  else if (/^(?:mo|month)/i.test(u)) ms = count * 30 * 24 * 60 * 60 * 1000;
  else if (/^m/i.test(u)) ms = count * 60 * 1000;
  else if (/^h/i.test(u)) ms = count * 60 * 60 * 1000;
  else if (/^d/i.test(u)) ms = count * 24 * 60 * 60 * 1000;
  else if (/^w/i.test(u)) ms = count * 7 * 24 * 60 * 60 * 1000;
  else if (/^y/i.test(u)) ms = count * 365 * 24 * 60 * 60 * 1000;

  return new Date(refTime - ms).toISOString();
}

/**
 * Normalizes a postedAt candidate string or extracts a posted/reposted relative date
 * from fallback spec text.
 * When referenceDate is provided, anchors relative dates (e.g. "5d", "3 days ago")
 * to the reference date (e.g. email receivedAt) rather than Date.now().
 */
export function normalizePostedAt(
  dateStr?: string | null,
  textFallback?: string | null,
  referenceDate?: Date | string | null
): string | null {
  // 1. Evaluate primary candidate date string
  if (dateStr && !isUnspecifiedPostedAt(dateStr)) {
    // If it's already an ISO string or absolute date, format it relative to now directly
    const parsed = Date.parse(dateStr);
    if (
      !isNaN(parsed) &&
      (/^\d{4}-\d{2}-\d{2}/.test(dateStr) ||
        /^[A-Za-z]{3,9}\s+\d{1,2},\s*\d{4}/.test(dateStr))
    ) {
      return formatRelativeTime(dateStr, { addSuffix: false });
    }

    if (referenceDate) {
      const iso = relativeTimeToIso(dateStr, referenceDate);
      if (iso) return formatRelativeTime(iso, { addSuffix: false });
    }

    const formatted = formatRelativeTime(dateStr, { addSuffix: false });
    if (formatted) return formatted;
  }

  // 2. Evaluate fallback spec / header text if dateStr was absent or unspecified
  if (textFallback && typeof textFallback === "string") {
    const match = textFallback.match(
      /\b(?:reposted|posted)\s*(?:on\s+|:\s*)?(\d+\+?\s*(?:s|sec|m|min|mins|minutes?|h|hr|hrs|hours?|d|days?|w|wk|wks|weeks?|mo|months?|y|years?)(?:\s+ago)?|yesterday|today|just\s+now|just\s+posted)\b/i
    );
    if (match) {
      if (referenceDate) {
        const iso = relativeTimeToIso(match[1], referenceDate);
        if (iso) return formatRelativeTime(iso, { addSuffix: false });
      }
      return formatRelativeTime(match[1], { addSuffix: false });
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
  const company = sanitizeCompanyName(opportunity.company) || "Unknown Company";
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

  const formattedPostedAt = normalizePostedAt(
    opportunity.postedAt,
    inboundRaw,
    opportunity.receivedAt
  );

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
