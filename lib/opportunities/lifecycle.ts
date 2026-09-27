import type { JobOpportunity } from "@prisma/client";

/**
 * User-initiated archive: isArchived + previousStatus set, still not DISMISSED.
 * Distinct from below-threshold soft-hide (isArchived with previousStatus null).
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
