"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { JobOpportunity } from "@prisma/client";
import { Archive, CheckCircle2, Trash2, Undo2, XCircle } from "lucide-react";
import { toast } from "sonner";

import {
  archiveOpportunities,
  deleteDismissedPermanently,
  dismissOpportunities,
  markLessLikeThis,
  markOpportunitiesExternalApplied,
  restoreOpportunities,
} from "@/app/actions/opportunities";
import {
  OpportunityCard,
  type OpportunityCardVariant,
} from "@/components/opportunities/opportunity-card";
import { PipelineToolbar } from "@/components/jobs/pipeline-toolbar";
import {
  BULK_ACTION_BTN_CLASSNAME,
  BULK_ACTION_COUNT_DESTRUCTIVE_CLASSNAME,
  BULK_ACTION_DESTRUCTIVE_BTN_CLASSNAME,
  BulkActionCount,
  BulkActionsFlyout,
} from "@/components/ui/bulk-actions-flyout";
import { PipelinePaginationFooter } from "@/components/ui/pipeline-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { isUserArchived } from "@/lib/opportunities/lifecycle";
import {
  matchesHistoryStatusFilter,
  matchesSearchQuery,
  matchesSourceFilter,
  type HistoryStatusFilter,
  type PipelineTab,
  type SourceFilter,
} from "@/lib/opportunities/pipeline-filters";
import { TAB_SORT_CONFIG } from "@/lib/opportunities/sorting";

const JOBS_PAGE_SIZE_KEY = "mailpilot_jobs_per_page";

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
  /** Controlled sort from JobsRadar (TAB_SORT_CONFIG). */
  sortOption: string;
  onSortOptionChange: (sort: string) => void;
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
  sortOption,
  onSortOptionChange,
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
        if (activeTab === "leads" || activeTab === "applied") {
          return matchesSourceFilter(o, sourceFilter);
        }
        return true;
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

  const visibleCount = filteredOpportunities.length;
  const totalCount = opportunities.length + hiddenCount;
  const defaultSort = TAB_SORT_CONFIG[activeTab].defaultSort;

  const {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalPages,
    slice,
  } = usePagination({
    storageKey: JOBS_PAGE_SIZE_KEY,
    totalItems: visibleCount,
    resetDeps: [
      activeTab,
      searchQuery,
      sourceFilter,
      historyStatusFilter,
      sortOption,
      matchThreshold,
    ],
  });

  const hasActiveTransientFilters =
    searchQuery.trim().length > 0 ||
    sourceFilter !== "all" ||
    historyStatusFilter !== "all" ||
    sortOption !== defaultSort;

  function handleResetTransientFilters() {
    setSearchQuery("");
    setSourceFilter("all");
    setHistoryStatusFilter("all");
    onSortOptionChange(defaultSort);
    setCurrentPage(1);
  }

  const paginatedJobs = slice(filteredOpportunities);

  return (
    <div className="mt-0">
      <PipelineToolbar
        activeTab={activeTab}
        totalCount={totalCount}
        visibleCount={visibleCount}
        selectedCount={selectedIds.length}
        isAllSelected={isAllSelected}
        onToggleSelectAll={handleSelectAll}
        minScore={matchThreshold}
        onMinScoreChange={
          showThresholdControl ? onThresholdChange : undefined
        }
        onMinScoreCommit={
          showThresholdControl ? onThresholdCommit : undefined
        }
        scoreDisabled={busy || !onThresholdCommit}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        sourceFilter={sourceFilter}
        onSourceFilterChange={
          activeTab === "leads" || activeTab === "applied"
            ? setSourceFilter
            : undefined
        }
        historyFilter={historyStatusFilter}
        onHistoryFilterChange={
          activeTab === "history" ? setHistoryStatusFilter : undefined
        }
        sortOption={sortOption}
        onSortOptionChange={onSortOptionChange}
        showTelemetry={showListingCount}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        hasActiveTransientFilters={hasActiveTransientFilters}
        onResetTransientFilters={handleResetTransientFilters}
      />

      {filteredOpportunities.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <div className="grid min-w-0 gap-3 md:grid-cols-2">
          {paginatedJobs.map((opp) => (
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

      <PipelinePaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        pageSize={pageSize}
        totalItems={visibleCount}
        onPageChange={setCurrentPage}
      />

      <BulkActionsFlyout
        selectedCount={selectedIds.length}
        onCancel={clearSelection}
      >
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
              className={BULK_ACTION_BTN_CLASSNAME}
            >
              <Undo2 className="h-3.5 w-3.5" />
              Restore
              <BulkActionCount count={selectedIds.length} />
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
                className={BULK_ACTION_DESTRUCTIVE_BTN_CLASSNAME}
              >
                <XCircle className="h-3.5 w-3.5" />
                Dismiss Archived
                <BulkActionCount
                  count={archivedSelectedIds.length}
                  className={BULK_ACTION_COUNT_DESTRUCTIVE_CLASSNAME}
                />
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
                className={BULK_ACTION_DESTRUCTIVE_BTN_CLASSNAME}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Permanently
                <BulkActionCount
                  count={dismissedSelectedIds.length}
                  className={BULK_ACTION_COUNT_DESTRUCTIVE_CLASSNAME}
                />
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
                className={BULK_ACTION_BTN_CLASSNAME}
              >
                <Archive className="h-3.5 w-3.5" />
                Archive
                <BulkActionCount count={selectedIds.length} />
              </button>
            )}

            {variant === "leads" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  startBatch(async () => {
                    await markOpportunitiesExternalApplied(selectedIds);
                    afterBatch("Marked as applied");
                  })
                }
                className={BULK_ACTION_BTN_CLASSNAME}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Mark Applied
                <BulkActionCount count={selectedIds.length} />
              </button>
            ) : null}

            <button
              type="button"
              disabled={busy}
              onClick={() =>
                startBatch(async () => {
                  await dismissOpportunities(selectedIds);
                  afterBatch("Dismissed");
                })
              }
              className={BULK_ACTION_DESTRUCTIVE_BTN_CLASSNAME}
            >
              <XCircle className="h-3.5 w-3.5" />
              Dismiss
              <BulkActionCount
                count={selectedIds.length}
                className={BULK_ACTION_COUNT_DESTRUCTIVE_CLASSNAME}
              />
            </button>
          </>
        )}
      </BulkActionsFlyout>
    </div>
  );
}
