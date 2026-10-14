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

  let formattedPostedAt = opportunity.postedAt?.trim() || null;
  if (formattedPostedAt) {
    const parsedDate = Date.parse(formattedPostedAt);
    if (!isNaN(parsedDate) && /^\d{4}-\d{2}-\d{2}/.test(formattedPostedAt)) {
      formattedPostedAt = formatDistanceToNow(new Date(parsedDate), { addSuffix: true });
    }
  }

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
