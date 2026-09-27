"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { JobOpportunity } from "@prisma/client";
import {
  Archive,
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

export type OpportunitySort = "best_match" | "newest" | "highest_pay";

type OpportunitiesViewProps = {
  opportunities: JobOpportunity[];
  matchThreshold: number;
  variant?: OpportunityCardVariant;
  pending?: boolean;
  emptyText?: string;
  showSort?: boolean;
  retentionDays?: number;
  /** When set, shows the matches-only toggle in the consolidated toolbar. */
  showMatchesOnly?: boolean;
  onShowMatchesOnlyChange?: (value: boolean) => void;
  hiddenCount?: number;
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
  showMatchesOnly,
  onShowMatchesOnlyChange,
  hiddenCount = 0,
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

  const showMatchesFilter =
    typeof showMatchesOnly === "boolean" &&
    typeof onShowMatchesOnlyChange === "function";

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
      {showSort || showMatchesFilter || sorted.length > 0 ? (
        <div className="mb-3 flex select-none flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-card px-3.5 py-2 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            {sorted.length > 0 ? (
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={handleSelectAll}
                  className="h-3.5 w-3.5 cursor-pointer rounded border-border text-[#3c837b] transition-colors focus:ring-[#3c837b]/30"
                />
                <span>
                  {isAllSelected
                    ? "Deselect All"
                    : `Select All (${sorted.length})`}
                </span>
              </label>
            ) : null}

            {sorted.length > 0 && showMatchesFilter ? (
              <div className="h-4 w-px bg-border/70" />
            ) : null}

            {showMatchesFilter ? (
              <>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={showMatchesOnly}
                    onChange={(e) =>
                      onShowMatchesOnlyChange?.(e.target.checked)
                    }
                    className="peer sr-only"
                  />
                  <div className="relative h-[18px] w-8 rounded-full bg-muted after:absolute after:top-[2px] after:left-[2px] after:h-3.5 after:w-3.5 after:rounded-full after:border after:border-border after:bg-white after:transition-all after:content-[''] peer-checked:bg-[#3c837b] peer-checked:after:translate-x-3.5 peer-checked:after:border-white peer-focus:outline-none" />
                  <span className="ml-2 text-xs font-medium text-foreground">
                    Show only matches (≥ {matchThreshold}%)
                  </span>
                </label>

                {hiddenCount > 0 && showMatchesOnly ? (
                  <span className="hidden text-[11px] text-muted-foreground/80 md:inline">
                    ({hiddenCount} hidden)
                  </span>
                ) : null}
              </>
            ) : null}

            {selectedIds.length > 0 ? (
              <span className="text-xs font-semibold text-primary">
                {selectedIds.length} selected
              </span>
            ) : null}
          </div>

          <div className="ml-auto flex items-center gap-3">
            {showSort ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>Sort by</span>
                <select
                  id="opp-sort"
                  value={sort}
                  onChange={(e) =>
                    setSort(e.target.value as OpportunitySort)
                  }
                  className="h-7 rounded-lg border border-border bg-background px-2 py-0.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-[#3c837b]"
                >
                  <option value="best_match">Best Match</option>
                  <option value="newest">Most Recent</option>
                  <option value="highest_pay">Highest Compensation</option>
                </select>
              </div>
            ) : null}

            {showSort ? <div className="h-4 w-px bg-border/70" /> : null}

            <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
              {sorted.length} listing{sorted.length === 1 ? "" : "s"}
            </span>
          </div>
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
