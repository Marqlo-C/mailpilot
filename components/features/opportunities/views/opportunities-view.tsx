"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { JobOpportunity } from "@prisma/client";
import { toast } from "sonner";
import { formatToastError } from "@/lib/utils/ui/toast-format";

import { markLessLikeThis } from "@/app/actions/opportunities";
import { DragGhost } from "@/components/ui/dnd/drag-ghost";
import { PageFlipBumpers } from "@/components/ui/dnd/page-flip-bumpers";
import type { OpportunityCardVariant } from "@/components/features/opportunities/cards/opportunity-card";
import { PipelineToolbar } from "@/components/features/opportunities/toolbar/pipeline-toolbar";
import { PipelinePaginationFooter } from "@/components/ui/composites/pipeline-pagination";
import { OpportunitiesBulkBar } from "@/components/features/opportunities/views/subcomponents/opportunities-bulk-bar";
import { OpportunitiesGrid } from "@/components/features/opportunities/views/subcomponents/opportunities-grid";
import { useLastClickedId } from "@/hooks/use-last-clicked-id";
import { useCardListGestures } from "@/hooks/use-card-list-gestures";
import { JOBS_PAGE_SIZE_OPTIONS, usePagination } from "@/hooks/use-pagination";
import { getCompanyLogoUrl } from "@/lib/utils/company-logo";
import { insertBeforeIdForIndex } from "@/lib/utils/dnd/interactive";
import { orderItemsByIds } from "@/lib/utils/dnd/reorder";
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
import { runJobDrop } from "@/lib/opportunities/run-job-move";
import { TAB_SORT_CONFIG } from "@/lib/opportunities/sorting";

const JOBS_PAGE_SIZE_KEY = "mailpilot_jobs_per_page";

const MOVE_TOAST: Partial<Record<JobMoveKind, string>> = {
  mark_applied: "Marked as applied",
  unmark_applied: "Moved back to leads",
  dismiss: "Dismissed",
  archive: "Archived",
  restore: "Restored",
};

export type OpportunitiesViewProps = {
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
  /** Whether embedded vector AI scoring is active. */
  isEmbeddedAiEnabled?: boolean;
  /** Whether autonomous email dispatch is active. */
  isAutoDispatchEnabled?: boolean;
  onReviewDraft?: (opp: JobOpportunity) => void;
  onSendNow?: (opp: JobOpportunity) => void;
  onMarkApplied?: (opp: JobOpportunity) => void;
  onUnmarkApplied?: (opp: JobOpportunity) => void;
  onLessLikeThis?: (opp: JobOpportunity) => void;
  onViewOriginalEmail?: (opp: JobOpportunity) => void;
  /**
   * Places the toolbar in the sticky header during this render, including
   * server HTML. Avoids a portal that only appears after hydration.
   */
  children?: (toolbar: ReactNode, body: ReactNode) => ReactNode;
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
  isEmbeddedAiEnabled,
  isAutoDispatchEnabled,
  onReviewDraft,
  onSendNow,
  onMarkApplied,
  onUnmarkApplied,
  onLessLikeThis,
  onViewOriginalEmail,
  children,
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
        toast.error(formatToastError(result.error));
        return;
      }
      toast.success("Lead dismissed");
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
    defaultPageSize: 20,
    pageSizeOptions: JOBS_PAGE_SIZE_OPTIONS,
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
      const resolved = resolveJobMove(jobsTabKey, zoneId as JobDropZone);
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
        const result = await runJobDrop(
          jobsTabKey,
          zoneId as JobDropZone,
          movedIds
        );
        if (!result.ok) {
          toast.error(formatToastError(result.error));
          return;
        }
        const message =
          MOVE_TOAST[resolved.kind] ??
          `${resolved.label} (${result.data?.count ?? movedIds.length})`;
        afterBatch(message);
      });
    },
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
    [setCurrentPage]
  );

  const changePageSize = useCallback(
    (size: number) => {
      clearSelection();
      setPageSize(size);
    },
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
  const pageOpportunityIds = useMemo(
    () => paginatedJobs.map((opportunity) => opportunity.id),
    [paginatedJobs]
  );
  const isAllSelected =
    pageOpportunityIds.length > 0 &&
    pageOpportunityIds.every((id) => selectedIds.includes(id));

  function handleSelectAll() {
    markLastClicked(null);
    if (isAllSelected) {
      clearSelection();
      return;
    }
    setSelectionMode(true);
    setSelectedIds(pageOpportunityIds);
  }

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

  const dockedToolbar = (
    <PipelineToolbar
      activeTab={activeTab}
      totalCount={totalCount}
      visibleCount={visibleCount}
      selectedCount={selectedIds.length}
      isAllSelected={isAllSelected}
      onToggleSelectAll={handleSelectAll}
      minScore={matchThreshold}
      onMinScoreChange={showThresholdControl ? onThresholdChange : undefined}
      onMinScoreCommit={showThresholdControl ? onThresholdCommit : undefined}
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
      pageSizeOptions={JOBS_PAGE_SIZE_OPTIONS}
      onPageSizeChange={changePageSize}
      currentPage={currentPage}
      totalPages={totalPages}
      onPageChange={changePage}
      hasActiveTransientFilters={hasActiveTransientFilters}
      onResetTransientFilters={handleResetTransientFilters}
    />
  );

  const body = (
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

      <OpportunitiesGrid
        opportunities={orderedOpportunities}
        paginatedJobs={paginatedJobs}
        emptyText={emptyText}
        variant={variant}
        matchThreshold={matchThreshold}
        busy={busy}
        retentionDays={retentionDays}
        selectedIds={selectedIds}
        lastClickedId={lastClickedId}
        isEmbeddedAiEnabled={isEmbeddedAiEnabled}
        isAutoDispatchEnabled={isAutoDispatchEnabled}
        onToggleSelect={toggleSelect}
        bindItem={bindItem}
        marker={marker}
        previewFullIds={drag?.previewFullIds}
        onReviewDraft={onReviewDraft}
        onSendNow={onSendNow}
        onMarkApplied={onMarkApplied}
        onUnmarkApplied={onUnmarkApplied}
        onViewOriginalEmail={onViewOriginalEmail}
        onLessLikeThis={handleLessLikeThis}
      />

      <PipelinePaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        pageSize={pageSize}
        totalItems={visibleCount}
        onPageChange={changePage}
      />

      <OpportunitiesBulkBar
        variant={variant}
        selectedIds={selectedIds}
        archivedSelectedIds={archivedSelectedIds}
        dismissedSelectedIds={dismissedSelectedIds}
        busy={busy}
        onClearSelection={clearSelection}
        onAfterBatch={afterBatch}
        startBatch={startBatch}
      />
    </div>
  );

  if (children) return children(dockedToolbar, body);
  return (
    <>
      {dockedToolbar}
      {body}
    </>
  );
}
