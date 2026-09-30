import type { JobOpportunity } from "@prisma/client";

/**
 * User-initiated archive: isArchived + previousStatus set, still not DISMISSED.
 * Below-threshold visibility is evaluated at read time from matchScore vs
 * the live threshold — never persisted as isArchived.
 */
export function isUserArchived(
  opportunity: Pick<JobOpportunity, "status" | "isArchived" | "previousStatus">
): boolean {
  return (
    opportunity.status !== "DISMISSED" &&
    opportunity.isArchived &&
    opportunity.previousStatus != null
  );
}

/** Legacy score soft-hide rows (isArchived with no user previousStatus). */
export function isScoreSoftArchived(
  opportunity: Pick<JobOpportunity, "status" | "isArchived" | "previousStatus">
): boolean {
  return (
    opportunity.status !== "DISMISSED" &&
    opportunity.isArchived &&
    opportunity.previousStatus == null
  );
}

export function meetsMatchThreshold(
  matchScore: number | null | undefined,
  threshold: number
): boolean {
  return (matchScore ?? 0) >= threshold;
}

export function isInHistory(
  opportunity: Pick<JobOpportunity, "status" | "isArchived" | "previousStatus">
): boolean {
  return opportunity.status === "DISMISSED" || isUserArchived(opportunity);
}

export function daysRemainingUntilPurge(
  dismissedAt: Date | string | null | undefined,
  retentionDays: number
): number {
  if (!dismissedAt) return retentionDays;
  const dismissedMs = new Date(dismissedAt).getTime();
  const daysPassed = Math.floor(
    (Date.now() - dismissedMs) / (1000 * 60 * 60 * 24)
  );
  return Math.max(0, retentionDays - daysPassed);
}
