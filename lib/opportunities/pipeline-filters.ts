import type { JobOpportunity } from "@prisma/client";

import { isUserArchived } from "@/lib/opportunities/lifecycle";

export type SourceFilter = "all" | "easy_apply" | "external" | "email_lead";

export type HistoryStatusFilter = "all" | "archived" | "dismissed";

export type PipelineTab =
  | "leads"
  | "applied"
  | "action_required"
  | "history";

export function matchesSourceFilter(
  opportunity: JobOpportunity,
  sourceFilter: SourceFilter
): boolean {
  if (sourceFilter === "all") return true;
  if (sourceFilter === "easy_apply") {
    return opportunity.applicationType === "QUICK_APPLY";
  }
  if (sourceFilter === "external") {
    return opportunity.applicationType === "EXTERNAL_LINK";
  }
  return opportunity.applicationType === "DIRECT_EMAIL";
}

export function matchesSearchQuery(
  opportunity: JobOpportunity,
  searchQuery: string
): boolean {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    opportunity.title,
    opportunity.company,
    opportunity.location ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function matchesHistoryStatusFilter(
  opportunity: JobOpportunity,
  statusFilter: HistoryStatusFilter
): boolean {
  if (statusFilter === "all") return true;
  if (statusFilter === "dismissed") {
    return opportunity.status === "DISMISSED";
  }
  return isUserArchived(opportunity);
}
