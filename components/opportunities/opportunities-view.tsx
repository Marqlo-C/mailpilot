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
  markLessLikeThis,
  restoreOpportunities,
} from "@/app/actions/opportunities";
import {
  OpportunityCard,
  type OpportunityCardVariant,
} from "@/components/opportunities/opportunity-card";
import { WavySlider } from "@/components/ui/wavy-slider";
import { isUserArchived } from "@/lib/opportunities/lifecycle";
import { cn } from "@/lib/utils";

type OpportunitiesViewProps = {
  opportunities: JobOpportunity[];
  matchThreshold: number;
  variant?: OpportunityCardVariant;
  pending?: boolean;
  emptyText?: string;
  /** When false, hides the listing count in the toolbar. */
  showListingCount?: boolean;
  retentionDays?: number;
  /** When true, shows the live match-threshold slider in the toolbar. */
  showThresholdControl?: boolean;
  onThresholdChange?: (value: number) => void;
  onThresholdCommit?: (value: number) => void;
  hiddenCount?: number;
  onReviewDraft?: (opp: JobOpportunity) => void;
  onSendNow?: (opp: JobOpportunity) => void;
  onMarkApplied?: (opp: JobOpportunity) => void;
  onUnmarkApplied?: (opp: JobOpportunity) => void;
  onLessLikeThis?: (opp: JobOpportunity) => void;
};

/**
 * Opportunities grid with multi-select and bulk lifecycle actions.
 * Sorting is owned by the parent tab (see lib/opportunities/sorting.ts).
 */
export function OpportunitiesView({
  opportunities,
  matchThreshold,
  variant = "leads",
  pending = false,
  emptyText = "No opportunities yet.",
  showListingCount = true,
  retentionDays = 30,
  showThresholdControl = false,
  onThresholdChange,
  onThresholdCommit,
  hiddenCount = 0,
  onReviewDraft,
  onSendNow,
  onMarkApplied,
  onUnmarkApplied,
  onLessLikeThis,
}: OpportunitiesViewProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchPending, startBatch] = useTransition();
  const busy = pending || batchPending;

  function handleLessLikeThis(opp: JobOpportunity) {
    if (onLessLikeThis) {
      onLessLikeThis(opp);
      return;
    }
    startBatch(async () => {
      const result = await markLessLikeThis(opp.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Less like “${opp.title}” — dismissed`);
      router.refresh();
    });
  }

  const selectedRecords = useMemo(
    () => opportunities.filter((o) => selectedIds.includes(o.id)),
    [opportunities, selectedIds]
  );
  const archivedSelectedIds = useMemo(
    () => selectedRecords.filter((o) => isUserArchived(o)).map((o) => o.id),
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
    opportunities.length > 0 && selectedIds.length === opportunities.length;

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }

  function handleSelectAll() {
    if (isAllSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(opportunities.map((o) => o.id));
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

  const showToolbar =
    showThresholdControl || opportunities.length > 0 || showListingCount;
  const canSelectAll = opportunities.length > 0;

  return (
    <div className="space-y-3">
      {showToolbar ? (
        <div className="mb-3 flex select-none flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-card px-3.5 py-2 shadow-sm">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <label
              className={cn(
                "inline-flex items-center gap-2 text-xs font-medium transition-colors",
                canSelectAll
                  ? "cursor-pointer text-muted-foreground hover:text-foreground"
                  : "cursor-not-allowed text-muted-foreground/40"
              )}
            >
              <input
                type="checkbox"
                checked={isAllSelected}
                disabled={!canSelectAll}
                onChange={handleSelectAll}
                className={cn(
                  "h-3.5 w-3.5 shrink-0 rounded border-border text-[#3c837b] transition-colors focus:ring-[#3c837b]/30",
                  canSelectAll ? "cursor-pointer" : "cursor-not-allowed opacity-40"
                )}
              />
              <span>
                {isAllSelected ? "Deselect All" : "Select All"}
              </span>
            </label>

            {showThresholdControl ? (
              <div className="h-4 w-px bg-border/70" />
            ) : null}

            {showThresholdControl ? (
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <label
                  htmlFor="fit-score-threshold-input"
                  className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Minimum Score:
                </label>
                <div className="relative inline-flex items-center">
                  <input
                    id="fit-score-threshold-input"
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    disabled={busy || !onThresholdCommit}
                    value={matchThreshold}
                    onChange={(e) => {
                      const val =
                        e.target.value === ""
                          ? 0
                          : Math.max(
                              0,
                              Math.min(100, parseInt(e.target.value, 10) || 0)
                            );
                      onThresholdChange?.(val);
                    }}
                    onBlur={() => onThresholdCommit?.(matchThreshold)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.currentTarget.blur();
                      }
                    }}
                    className="h-7 w-12 rounded-md border border-input/60 bg-background/50 pr-3 text-center font-mono text-xs font-medium text-foreground transition-colors [appearance:textfield] hover:bg-background focus:bg-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    aria-label="Minimum fit score percent"
                  />
                  <span className="pointer-events-none absolute right-1 font-mono text-[10px] font-bold leading-none text-muted-foreground">
                    %
                  </span>
                </div>
                <WavySlider
                  value={matchThreshold}
                  disabled={busy || !onThresholdCommit}
                  onChange={(val) => onThresholdChange?.(val)}
                  onCommit={(val) => onThresholdCommit?.(val)}
                  className="ml-2.5 w-28 sm:ml-3 sm:w-36"
                  aria-label="Minimum fit score"
                />
                {hiddenCount > 0 ? (
                  <span className="hidden shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground/70 md:inline">
                    ({hiddenCount} hidden)
                  </span>
                ) : null}
              </div>
            ) : null}

            {selectedIds.length > 0 ? (
              <span className="text-xs font-semibold text-primary">
                {selectedIds.length} selected
              </span>
            ) : null}
          </div>

          {showListingCount ? (
            <div className="ml-auto flex items-center gap-3">
              <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
                {opportunities.length} listing
                {opportunities.length === 1 ? "" : "s"}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {opportunities.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <div className="grid min-w-0 gap-3 md:grid-cols-2">
          {opportunities.map((opp) => (
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
              onLessLikeThis={
                variant === "history"
                  ? undefined
                  : () => handleLessLikeThis(opp)
              }
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
