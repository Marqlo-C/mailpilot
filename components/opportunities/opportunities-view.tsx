"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type MutableRefObject,
} from "react";
import { useRouter } from "next/navigation";
import type { JobOpportunity } from "@prisma/client";
import { Archive, CheckCircle2, Trash2, Undo2, XCircle } from "lucide-react";
import { toast } from "sonner";

import {
  deleteDismissedPermanently,
  markLessLikeThis,
} from "@/app/actions/opportunities";
import { DragGhost } from "@/components/dnd/drag-ghost";
import { PageFlipBumpers } from "@/components/dnd/page-flip-bumpers";
import {
  OpportunityCard,
  type OpportunityCardVariant,
} from "@/components/opportunities/opportunity-card";
import { PipelineToolbar } from "@/components/jobs/pipeline-toolbar";
import {
  BULK_ACTION_BTN_CLASSNAME,
  BULK_ACTION_COUNT_DESTRUCTIVE_CLASSNAME,
  BULK_ACTION_COUNT_DISMISS_CLASSNAME,
  BULK_ACTION_DESTRUCTIVE_BTN_CLASSNAME,
  BULK_ACTION_DISMISS_BTN_CLASSNAME,
  BulkActionCount,
  BulkActionDot,
  BulkActionsFlyout,
} from "@/components/ui/bulk-actions-flyout";
import { PipelinePaginationFooter } from "@/components/ui/pipeline-pagination";
import { useLastClickedId } from "@/components/ui/use-last-clicked-id";
import { useCardListGestures } from "@/hooks/use-card-list-gestures";
import { usePagination } from "@/hooks/use-pagination";
import { getCompanyLogoUrl } from "@/lib/company-logo";
import { insertBeforeIdForIndex } from "@/lib/dnd/interactive";
import { orderItemsByIds } from "@/lib/dnd/reorder";
import { isUserArchived } from "@/lib/opportunities/lifecycle";
import {
  getJobGestureRules,
  resolveJobMove,
  variantToJobsTabKey,
  type JobDropZone,
  type JobMoveKind,
} from "@/lib/opportunities/movement-rules";
import {
  matchesHistoryStatusFilter,
  matchesSearchQuery,
  matchesSourceFilter,
  type HistoryStatusFilter,
  type PipelineTab,
  type SourceFilter,
} from "@/lib/opportunities/pipeline-filters";
import {
  runJobCardAction,
  runJobDrop,
} from "@/lib/opportunities/run-job-move";
import { TAB_SORT_CONFIG } from "@/lib/opportunities/sorting";

const JOBS_PAGE_SIZE_KEY = "mailpilot_jobs_per_page";

const MOVE_TOAST: Partial<Record<JobMoveKind, string>> = {
  mark_applied: "Marked as applied",
  unmark_applied: "Moved back to leads",
  dismiss: "Dismissed",
  archive: "Archived",
  restore: "Restored",
};

type OpportunitiesViewProps = {
  accountId: string;
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
  /** Suppress tab switch when a drop lands on a tab trigger. */
  suppressTabChangeRef?: MutableRefObject<boolean>;
  /** Hovered drop-zone id while dragging (for tab ring highlight). */
  onDragZoneChange?: (zoneId: string | null) => void;
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
 * Opportunities grid with multi-select, bulk lifecycle actions, and DnD
 * (Custom reorder + tab drops via movement-rules / runJobMove).
 */
export function OpportunitiesView({
  accountId,
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
  suppressTabChangeRef,
  onDragZoneChange,
  onReviewDraft,
  onSendNow,
  onMarkApplied,
  onUnmarkApplied,
  onLessLikeThis,
}: OpportunitiesViewProps) {
  const router = useRouter();
  const activeTab = variantToPipelineTab(variant);
  const jobsTabKey = variantToJobsTabKey(variant);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
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

  const orderedOpportunities = filteredOpportunities;

  const filteredOpportunityIds = useMemo(
    () => orderedOpportunities.map((o) => o.id),
    [orderedOpportunities]
  );
  const { lastClickedId, markLastClicked } = useLastClickedId(
    selectedIds,
    filteredOpportunityIds
  );

  useEffect(() => {
    const visibleIds = new Set(filteredOpportunityIds);
    setSelectedIds((prev) => {
      const next = prev.filter((id) => visibleIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [filteredOpportunityIds]);

  useEffect(() => {
    if (selectedIds.length === 0 && selectionMode) {
      setSelectionMode(false);
    }
  }, [selectedIds.length, selectionMode]);

  const selectedRecords = useMemo(
    () => orderedOpportunities.filter((o) => selectedIds.includes(o.id)),
    [orderedOpportunities, selectedIds]
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
    orderedOpportunities.length > 0 &&
    orderedOpportunities.every((o) => selectedIds.includes(o.id));

  function toggleSelect(id: string) {
    markLastClicked(id);
    setSelectedIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((i) => i !== id)
        : [...prev, id];
      setSelectionMode(next.length > 0);
      return next;
    });
  }

  function handleSelectAll() {
    markLastClicked(null);
    if (isAllSelected) {
      clearSelection();
    } else {
      setSelectionMode(true);
      setSelectedIds(orderedOpportunities.map((o) => o.id));
    }
  }

  function clearSelection() {
    markLastClicked(null);
    setSelectionMode(false);
    setSelectedIds([]);
  }

  const enterSelectionMode = useCallback(
    (id: string) => {
      markLastClicked(id);
      setSelectionMode(true);
      setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    },
    [markLastClicked]
  );

  const paintSelect = useCallback(
    (id: string, mode: "add" | "remove") => {
      markLastClicked(id);
      setSelectedIds((prev) => {
        if (mode === "add") {
          if (prev.includes(id)) return prev;
          setSelectionMode(true);
          return [...prev, id];
        }
        const next = prev.filter((i) => i !== id);
        setSelectionMode(next.length > 0);
        return next;
      });
    },
    [markLastClicked]
  );

  function afterBatch(message: string) {
    toast.success(message);
    clearSelection();
    router.refresh();
  }

  const visibleCount = orderedOpportunities.length;
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

  const paginatedCommitted = slice(orderedOpportunities);
  const paginatedIds = useMemo(
    () => paginatedCommitted.map((o) => o.id),
    [paginatedCommitted]
  );

  const gestureRules = getJobGestureRules({
    activeTab: jobsTabKey,
  });

  const handleReorder = useCallback(
    (_nextFullIds: string[], _movedIds: string[]) => {
      // Job Radar cycles pages and moves across tabs; it does not save a custom order.
    },
    []
  );

  const handleDropZone = useCallback(
    (zoneId: string, movedIds: string[]) => {
      const resolved = resolveJobMove(
        jobsTabKey,
        zoneId as JobDropZone
      );
      if (
        resolved.kind === "forbidden" ||
        resolved.kind === "reorder" ||
        movedIds.length === 0
      ) {
        return;
      }
      if (suppressTabChangeRef) {
        suppressTabChangeRef.current = true;
        window.setTimeout(() => {
          suppressTabChangeRef.current = false;
        }, 0);
      }
      startBatch(async () => {
        const result = await runJobDrop(jobsTabKey, zoneId as JobDropZone, movedIds);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        const message =
          MOVE_TOAST[resolved.kind] ??
          `${resolved.label} (${result.data?.count ?? movedIds.length})`;
        afterBatch(message);
      });
    },
    // afterBatch / startBatch close over latest selection helpers
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
    [jobsTabKey, suppressTabChangeRef]
  );

  const { drag, bindItem, onBackgroundPointerDown } = useCardListGestures({
    pageItemIds: paginatedIds,
    fullItemIds: filteredOpportunityIds,
    selectedIds,
    selectionMode: selectionMode || selectedIds.length > 0,
    onEnterSelectionMode: enterSelectionMode,
    onToggleSelect: toggleSelect,
    onPaintSelect: paintSelect,
    onClearSelection: clearSelection,
    rules: gestureRules,
    currentPage,
    totalPages,
    pageSize,
    onPageChange: setCurrentPage,
    onReorder: handleReorder,
    onDropZone: handleDropZone,
  });

  useEffect(() => {
    onDragZoneChange?.(drag?.active ? drag.dropZone : null);
  }, [drag?.active, drag?.dropZone, onDragZoneChange]);

  const changePage = useCallback(
    (page: number) => {
      clearSelection();
      setCurrentPage(page);
    },
    // clearSelection is stable enough for page chrome
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
    [setCurrentPage]
  );

  const changePageSize = useCallback(
    (size: number) => {
      clearSelection();
      setPageSize(size);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
    [setPageSize]
  );

  const dragLabel = useMemo(() => {
    if (!drag?.active || drag.movedIds.length === 0) return null;
    const origin =
      orderedOpportunities.find((o) => o.id === drag.originId) ??
      orderedOpportunities.find((o) => o.id === drag.movedIds[0]);
    if (!origin) return `${drag.movedIds.length} job(s)`;
    return `${origin.company} — ${origin.title}`;
  }, [drag, orderedOpportunities]);

  const dragStackItems = useMemo(() => {
    if (!drag?.active) return [];
    // Grabbed card first so front name + icon match; others fill the peek stack.
    const orderedIds = [
      drag.originId,
      ...drag.movedIds.filter((id) => id !== drag.originId),
    ].slice(0, 4);
    return orderedIds.map((id) => {
      const o = orderedOpportunities.find((item) => item.id === id);
      const name = o?.company ?? "Job";
      return {
        name,
        subtitle: o?.title ?? null,
        logoSrc: o
          ? o.logoUrl || getCompanyLogoUrl(o.company, o.companyDomain)
          : null,
        score: o?.matchScore ?? null,
        scoreKind: "match" as const,
      };
    });
  }, [drag, orderedOpportunities]);

  const displayOpportunities = useMemo(() => {
    if (drag?.previewFullIds) {
      return orderItemsByIds(orderedOpportunities, drag.previewFullIds);
    }
    return orderedOpportunities;
  }, [drag?.previewFullIds, orderedOpportunities]);

  const paginatedJobs = slice(displayOpportunities);

  // Multi-column grids skip live reorder — show a stable insert marker instead.
  const marker =
    drag?.active &&
    !drag.previewFullIds &&
    drag.insertIndex != null &&
    !drag.dropZone
      ? insertBeforeIdForIndex(
          filteredOpportunityIds,
          drag.movedIds,
          drag.insertIndex
        )
      : { insertBeforeId: null as string | null, insertAfterLast: false };

  return (
    <div className="mt-0" onPointerDown={onBackgroundPointerDown}>
      <DragGhost
        active={Boolean(drag?.active)}
        pointerX={drag?.pointerX ?? 0}
        pointerY={drag?.pointerY ?? 0}
        grab={drag?.grab ?? null}
        count={drag?.movedIds.length ?? 0}
        label={dragLabel}
        dropZone={drag?.dropZone ?? null}
        pageFlipDir={drag?.pageFlipDir ?? null}
        outsideList={drag?.outsideList ?? false}
        stackItems={dragStackItems}
      />
      <PageFlipBumpers
        active={Boolean(drag?.active)}
        pageFlipDir={drag?.pageFlipDir ?? null}
        currentPage={currentPage}
        totalPages={totalPages}
        dropZone={drag?.dropZone ?? null}
      />

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
        onPageSizeChange={changePageSize}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={changePage}
        hasActiveTransientFilters={hasActiveTransientFilters}
        onResetTransientFilters={handleResetTransientFilters}
      />

      {orderedOpportunities.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <div
          className="grid min-w-0 gap-3 md:grid-cols-2"
          data-dnd-list
          data-dnd-previewing={drag?.previewFullIds ? "true" : undefined}
        >
          {paginatedJobs.map((opp) => (
            <OpportunityCard
              key={opp.id}
              opportunity={opp}
              matchThreshold={matchThreshold}
              variant={variant}
              pending={busy}
              retentionDays={retentionDays}
              isSelected={selectedIds.includes(opp.id)}
              isLastClicked={lastClickedId === opp.id}
              onToggleSelect={toggleSelect}
              itemProps={bindItem(opp.id)}
              showInsertBefore={marker.insertBeforeId === opp.id}
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
          {marker.insertAfterLast ? (
            <div
              className="pointer-events-none col-span-full h-0.5 bg-[#1ab5af]"
              aria-hidden
            />
          ) : null}
        </div>
      )}

      <PipelinePaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        pageSize={pageSize}
        totalItems={visibleCount}
        onPageChange={changePage}
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
                  const result = await runJobCardAction(
                    "history",
                    "restore",
                    selectedIds
                  );
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
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
              <>
                <BulkActionDot />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    startBatch(async () => {
                      const result = await runJobCardAction(
                        "history",
                        "dismiss",
                        archivedSelectedIds
                      );
                      if (!result.ok) {
                        toast.error(result.error);
                        return;
                      }
                      afterBatch("Dismissed — purge countdown started");
                    })
                  }
                  className={BULK_ACTION_DISMISS_BTN_CLASSNAME}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Dismiss Archived
                  <BulkActionCount
                    count={archivedSelectedIds.length}
                    className={BULK_ACTION_COUNT_DISMISS_CLASSNAME}
                  />
                </button>
              </>
            ) : null}

            {dismissedSelectedIds.length > 0 ? (
              <>
                <BulkActionDot />
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
              </>
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
                    const result = await runJobCardAction(
                      variantToJobsTabKey(variant),
                      "archive",
                      selectedIds
                    );
                    if (!result.ok) {
                      toast.error(result.error);
                      return;
                    }
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
              <>
                <BulkActionDot />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    startBatch(async () => {
                      const result = await runJobCardAction(
                        "leads",
                        "mark_applied",
                        selectedIds
                      );
                      if (!result.ok) {
                        toast.error(result.error);
                        return;
                      }
                      afterBatch("Marked as applied");
                    })
                  }
                  className={BULK_ACTION_BTN_CLASSNAME}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Mark Applied
                  <BulkActionCount count={selectedIds.length} />
                </button>
              </>
            ) : null}

            <BulkActionDot />
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                startBatch(async () => {
                  const result = await runJobCardAction(
                    variantToJobsTabKey(variant),
                    "dismiss",
                    selectedIds
                  );
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  afterBatch("Dismissed");
                })
              }
              className={BULK_ACTION_DISMISS_BTN_CLASSNAME}
            >
              <XCircle className="h-3.5 w-3.5" />
              Dismiss
              <BulkActionCount
                count={selectedIds.length}
                className={BULK_ACTION_COUNT_DISMISS_CLASSNAME}
              />
            </button>
          </>
        )}
      </BulkActionsFlyout>
    </div>
  );
}
