"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { JobOpportunity } from "@prisma/client";
import { Archive, Trash2, Undo2, XCircle } from "lucide-react";
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
import { PipelineToolbar } from "@/components/opportunities/pipeline-toolbar";
import { isUserArchived } from "@/lib/opportunities/lifecycle";
import {
  matchesHistoryStatusFilter,
  matchesSearchQuery,
  matchesSourceFilter,
  type HistoryStatusFilter,
  type PipelineTab,
  type SourceFilter,
} from "@/lib/opportunities/pipeline-filters";

type OpportunitiesViewProps = {
  opportunities: JobOpportunity[];
  matchThreshold: number;
  variant?: OpportunityCardVariant;
  pending?: boolean;
  emptyText?: string;
  /** When false, hides the canvas listings telemetry beside the toolbar. */
  showListingCount?: boolean;
  retentionDays?: number;
  /** When true, shows Minimum Score (Leads). Ignored on other variants. */
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

function variantToPipelineTab(variant: OpportunityCardVariant): PipelineTab {
  if (variant === "action") return "action_required";
  return variant;
}

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
  const activeTab = variantToPipelineTab(variant);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [historyStatusFilter, setHistoryStatusFilter] =
    useState<HistoryStatusFilter>("all");
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

  /** Parent list (threshold-gated on leads) → search / source / history filters. */
  const filteredOpportunities = useMemo(
    () =>
      opportunities.filter((o) => {
        if (!matchesSearchQuery(o, searchQuery)) return false;
        if (activeTab === "history") {
          return matchesHistoryStatusFilter(o, historyStatusFilter);
        }
        return matchesSourceFilter(o, sourceFilter);
      }),
    [
      opportunities,
      searchQuery,
      sourceFilter,
      historyStatusFilter,
      activeTab,
    ]
  );

  useEffect(() => {
    const visibleIds = new Set(filteredOpportunities.map((o) => o.id));
    setSelectedIds((prev) => {
      const next = prev.filter((id) => visibleIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [filteredOpportunities]);

  const selectedRecords = useMemo(
    () => filteredOpportunities.filter((o) => selectedIds.includes(o.id)),
    [filteredOpportunities, selectedIds]
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
    filteredOpportunities.length > 0 &&
    filteredOpportunities.every((o) => selectedIds.includes(o.id));

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }

  function handleSelectAll() {
    if (isAllSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredOpportunities.map((o) => o.id));
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

  const canSelectAll = filteredOpportunities.length > 0;
  const visibleCount = filteredOpportunities.length;
  const totalCount = opportunities.length + hiddenCount;
  const pipelineHiddenCount = totalCount - visibleCount;

  return (
    <div className="space-y-3">
      <PipelineToolbar
        activeTab={activeTab}
        canSelectAll={canSelectAll}
        isAllSelected={isAllSelected}
        onSelectAllToggle={handleSelectAll}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        sourceFilter={sourceFilter}
        onSourceFilterChange={setSourceFilter}
        historyStatusFilter={historyStatusFilter}
        onHistoryStatusFilterChange={setHistoryStatusFilter}
        matchThreshold={matchThreshold}
        onThresholdChange={onThresholdChange}
        onThresholdCommit={
          showThresholdControl ? onThresholdCommit : undefined
        }
        scoreDisabled={busy || !onThresholdCommit}
        visibleCount={visibleCount}
        totalCount={totalCount}
        hiddenCount={pipelineHiddenCount}
        showTelemetry={showListingCount}
      />

      {filteredOpportunities.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <div className="grid min-w-0 gap-3 md:grid-cols-2">
          {filteredOpportunities.map((opp) => (
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
