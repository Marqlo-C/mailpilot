"use client";

import { useMemo, useState } from "react";
import type { JobOpportunity } from "@prisma/client";
import { ArrowUpDown } from "lucide-react";

import { OpportunityCard } from "@/components/opportunities/opportunity-card";
import { Label } from "@/components/ui/label";

export type OpportunitySort = "best_match" | "newest" | "highest_pay";

type OpportunitiesViewProps = {
  opportunities: JobOpportunity[];
  matchThreshold: number;
  pending?: boolean;
  emptyText?: string;
  onReviewDraft?: (opp: JobOpportunity) => void;
  onSendNow?: (opp: JobOpportunity) => void;
  onMarkApplied?: (opp: JobOpportunity) => void;
  onDismiss?: (opp: JobOpportunity) => void;
};

function sortOpportunities(
  items: JobOpportunity[],
  sort: OpportunitySort
): JobOpportunity[] {
  const copy = [...items];
  switch (sort) {
    case "newest":
      return copy.sort(
        (a, b) =>
          new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
      );
    case "highest_pay":
      return copy.sort((a, b) => {
        const aPay = a.salaryMax ?? -1;
        const bPay = b.salaryMax ?? -1;
        if (aPay < 0 && bPay < 0) {
          return (b.matchScore ?? 0) - (a.matchScore ?? 0);
        }
        if (aPay < 0) return 1;
        if (bPay < 0) return -1;
        return bPay - aPay;
      });
    case "best_match":
    default:
      return copy.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
  }
}

/**
 * Opportunities grid with Best Match / Newest / Highest Pay sorting.
 */
export function OpportunitiesView({
  opportunities,
  matchThreshold,
  pending = false,
  emptyText = "No opportunities yet.",
  onReviewDraft,
  onSendNow,
  onMarkApplied,
  onDismiss,
}: OpportunitiesViewProps) {
  const [sort, setSort] = useState<OpportunitySort>("best_match");

  const sorted = useMemo(
    () => sortOpportunities(opportunities, sort),
    [opportunities, sort]
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
          <Label htmlFor="opp-sort" className="text-sm text-muted-foreground">
            Sort by
          </Label>
          <select
            id="opp-sort"
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            value={sort}
            onChange={(e) => setSort(e.target.value as OpportunitySort)}
          >
            <option value="best_match">Best Match</option>
            <option value="newest">Most Recent</option>
            <option value="highest_pay">Highest Compensation</option>
          </select>
        </div>
        <p className="text-xs text-muted-foreground">
          {sorted.length} listing{sorted.length === 1 ? "" : "s"}
        </p>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {sorted.map((opp) => (
            <OpportunityCard
              key={opp.id}
              opportunity={opp}
              matchThreshold={matchThreshold}
              pending={pending}
              onReviewDraft={() => onReviewDraft?.(opp)}
              onSendNow={() => onSendNow?.(opp)}
              onMarkApplied={() => onMarkApplied?.(opp)}
              onDismiss={() => onDismiss?.(opp)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
