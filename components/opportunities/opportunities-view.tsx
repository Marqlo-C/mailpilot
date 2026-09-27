"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { JobOpportunity } from "@prisma/client";
import {
  Archive,
  ArrowUpDown,
  CheckSquare,
  Square,
  Trash2,
  Undo2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import {
  archiveOpportunities,
  deleteDismissedPermanently,
  dismissOpportunities,
  restoreOpportunities,
} from "@/app/actions/opportunities";
import {
  OpportunityCard,
  type OpportunityCardVariant,
} from "@/components/opportunities/opportunity-card";
import { Label } from "@/components/ui/label";

export type OpportunitySort = "best_match" | "newest" | "highest_pay";

type OpportunitiesViewProps = {
  opportunities: JobOpportunity[];
  matchThreshold: number;
  variant?: OpportunityCardVariant;
  pending?: boolean;
  emptyText?: string;
  showSort?: boolean;
  retentionDays?: number;
  onReviewDraft?: (opp: JobOpportunity) => void;
  onSendNow?: (opp: JobOpportunity) => void;
  onMarkApplied?: (opp: JobOpportunity) => void;
  onUnmarkApplied?: (opp: JobOpportunity) => void;
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
 * Opportunities grid with sorting, multi-select, and bulk lifecycle actions.
 */
export function OpportunitiesView({
  opportunities,
  matchThreshold,
  variant = "leads",
  pending = false,
  emptyText = "No opportunities yet.",
  showSort = true,
  retentionDays = 30,
  onReviewDraft,
  onSendNow,
  onMarkApplied,
  onUnmarkApplied,
}: OpportunitiesViewProps) {
  const router = useRouter();
  const [sort, setSort] = useState<OpportunitySort>("best_match");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchPending, startBatch] = useTransition();
  const busy = pending || batchPending;

  const sorted = useMemo(
    () => sortOpportunities(opportunities, sort),
    [opportunities, sort]
  );

  const selectedRecords = useMemo(
    () => sorted.filter((o) => selectedIds.includes(o.id)),
    [sorted, selectedIds]
  );
  const archivedSelectedIds = useMemo(
    () =>
      selectedRecords
        .filter((o) => o.isArchived && o.status !== "DISMISSED")
        .map((o) => o.id),
    [selectedRecords]
  );
  const dismissedSelectedIds = useMemo(
    () =>
      selectedRecords
        .filter((o) => o.status === "DISMISSED")
        .map((o) => o.id),
    [selectedRecords]
  );
  const isAllSelected =
    sorted.length > 0 && selectedIds.length === sorted.length;

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }

  function handleSelectAll() {
    if (isAllSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(sorted.map((o) => o.id));
    }
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  function afterBatch(message: string) {
    toast.success(message);
    clearSelection();
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {showSort || sorted.length > 0 ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {showSort ? (
            <div className="flex items-center gap-2">
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
              <Label
                htmlFor="opp-sort"
                className="text-sm text-muted-foreground"
              >
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
          ) : (
            <div />
          )}
          <p className="text-xs text-muted-foreground">
            {sorted.length} listing{sorted.length === 1 ? "" : "s"}
          </p>
        </div>
      ) : null}

      {sorted.length > 0 ? (
        <div className="flex items-center justify-between px-0.5 text-sm text-muted-foreground">
          <button
            type="button"
            onClick={handleSelectAll}
            className="inline-flex items-center gap-1.5 font-medium transition-colors hover:text-foreground"
          >
            {isAllSelected ? (
              <CheckSquare className="h-4 w-4 text-primary" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            {isAllSelected
              ? "Deselect All"
              : `Select All (${sorted.length})`}
          </button>
          {selectedIds.length > 0 ? (
            <span className="text-xs font-semibold text-primary">
              {selectedIds.length} item
              {selectedIds.length > 1 ? "s" : ""} selected
            </span>
          ) : null}
        </div>
      ) : null}

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
              variant={variant}
              pending={busy}
              retentionDays={retentionDays}
              isSelected={selectedIds.includes(opp.id)}
              onToggleSelect={toggleSelect}
              onReviewDraft={() => onReviewDraft?.(opp)}
              onSendNow={() => onSendNow?.(opp)}
              onMarkApplied={() => onMarkApplied?.(opp)}
              onUnmarkApplied={() => onUnmarkApplied?.(opp)}
            />
          ))}
        </div>
      )}

      {selectedIds.length > 0 ? (
        <aside
          role="region"
          aria-label="Bulk actions toolbar"
          className="fixed bottom-6 left-1/2 z-40 flex max-w-[min(96vw,40rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-2xl border border-border bg-background/95 px-4 py-2.5 shadow-2xl backdrop-blur animate-in fade-in slide-in-from-bottom-3"
        >
          <span className="mr-1 border-r border-border pr-3 text-xs font-semibold text-muted-foreground">
            {selectedIds.length} Selected
          </span>

          {variant === "history" ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  startBatch(async () => {
                    await restoreOpportunities(selectedIds);
                    afterBatch("Restored");
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                <Undo2 className="h-3.5 w-3.5" />
                Restore ({selectedIds.length})
              </button>

              {archivedSelectedIds.length > 0 ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    startBatch(async () => {
                      await dismissOpportunities(archivedSelectedIds);
                      afterBatch("Dismissed — purge countdown started");
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Dismiss Archived ({archivedSelectedIds.length})
                </button>
              ) : null}

              {dismissedSelectedIds.length > 0 ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    startBatch(async () => {
                      await deleteDismissedPermanently(dismissedSelectedIds);
                      afterBatch("Deleted permanently");
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Permanently ({dismissedSelectedIds.length})
                </button>
              ) : null}
            </>
          ) : (
            <>
              {(variant === "leads" || variant === "applied") && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    startBatch(async () => {
                      await archiveOpportunities(selectedIds);
                      afterBatch("Archived");
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                  <Archive className="h-3.5 w-3.5" />
                  Archive ({selectedIds.length})
                </button>
              )}

              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  startBatch(async () => {
                    await dismissOpportunities(selectedIds);
                    afterBatch("Dismissed");
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
              >
                <XCircle className="h-3.5 w-3.5" />
                Dismiss ({selectedIds.length})
              </button>
            </>
          )}

          <button
            type="button"
            onClick={clearSelection}
            className="ml-1 text-xs text-muted-foreground underline hover:text-foreground"
          >
            Cancel
          </button>
        </aside>
      ) : null}
    </div>
  );
}
