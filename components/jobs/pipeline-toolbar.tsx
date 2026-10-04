"use client";

import {
  ToolbarDivider,
  ToolbarHistoryStatusFilter,
  ToolbarMetaRow,
  ToolbarRoot,
  ToolbarScoreSlider,
  ToolbarSearch,
  ToolbarSelectAll,
  ToolbarSortSelect,
  ToolbarSourceFilter,
  ToolbarTelemetry,
} from "@/components/jobs/pipeline-toolbar-primitives";
import { ToolbarPageSizeSelect } from "@/components/ui/pipeline-pagination";
import type {
  HistoryStatusFilter,
  PipelineTab,
  SourceFilter,
} from "@/lib/opportunities/pipeline-filters";

export type PipelineToolbarProps = {
  activeTab: PipelineTab;
  totalCount: number;
  visibleCount: number;
  selectedCount: number;
  isAllSelected: boolean;
  onToggleSelectAll: () => void;
  minScore?: number;
  onMinScoreChange?: (score: number) => void;
  onMinScoreCommit?: (score: number) => void;
  scoreDisabled?: boolean;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  sourceFilter?: SourceFilter;
  onSourceFilterChange?: (filter: SourceFilter) => void;
  historyFilter?: HistoryStatusFilter;
  onHistoryFilterChange?: (filter: HistoryStatusFilter) => void;
  sortOption: string;
  onSortOptionChange: (sort: string) => void;
  showTelemetry?: boolean;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  hasActiveTransientFilters?: boolean;
  onResetTransientFilters?: () => void;
};

/**
 * Two-row Job Radar filter chrome:
 * 1) Filter card — Select All, Score, Search, Source/History, Sort
 * 2) Meta bar — result counts (left) + page size (right)
 */
export function PipelineToolbar({
  activeTab,
  totalCount,
  visibleCount,
  selectedCount,
  isAllSelected,
  onToggleSelectAll,
  minScore = 0,
  onMinScoreChange,
  onMinScoreCommit,
  scoreDisabled = false,
  searchQuery,
  onSearchQueryChange,
  sourceFilter = "all",
  onSourceFilterChange,
  historyFilter = "all",
  onHistoryFilterChange,
  sortOption,
  onSortOptionChange,
  showTelemetry = true,
  pageSize,
  onPageSizeChange,
  hasActiveTransientFilters = false,
  onResetTransientFilters,
}: PipelineToolbarProps) {
  const showScore = activeTab === "leads" && Boolean(onMinScoreChange);
  const showSource =
    (activeTab === "leads" || activeTab === "applied") &&
    Boolean(onSourceFilterChange);
  const showHistoryStatus =
    activeTab === "history" && Boolean(onHistoryFilterChange);
  const canSelect = visibleCount > 0;
  const isIndeterminate =
    selectedCount > 0 && selectedCount < visibleCount && !isAllSelected;
  const selectLabel = isAllSelected ? "Deselect All" : "Select All";
  const hiddenCount = Math.max(0, totalCount - visibleCount);

  return (
    <div className="mb-0">
      <ToolbarRoot className="mb-1.5">
        <ToolbarSelectAll
          checked={isAllSelected}
          indeterminate={isIndeterminate}
          onToggle={onToggleSelectAll}
          label={selectLabel}
          disabled={!canSelect}
        />

        {showScore ? (
          <>
            <ToolbarDivider />
            <ToolbarScoreSlider
              value={minScore}
              disabled={scoreDisabled}
              onChange={onMinScoreChange}
              onCommit={onMinScoreCommit}
            />
          </>
        ) : null}

        <ToolbarDivider />

        <ToolbarSearch
          searchQuery={searchQuery}
          onSearchChange={onSearchQueryChange}
        />

        {showSource ? (
          <ToolbarSourceFilter
            value={sourceFilter}
            onChange={onSourceFilterChange!}
          />
        ) : null}

        {showHistoryStatus ? (
          <ToolbarHistoryStatusFilter
            value={historyFilter}
            onChange={onHistoryFilterChange!}
          />
        ) : null}

        <ToolbarSortSelect
          activeTab={activeTab}
          sortOption={sortOption}
          onSortOptionChange={onSortOptionChange}
        />
      </ToolbarRoot>

      <ToolbarMetaRow>
        <div className="min-w-0">
          {showTelemetry ? (
            <ToolbarTelemetry
              visibleCount={visibleCount}
              totalCount={totalCount}
              hiddenCount={hiddenCount}
              onResetFilters={
                hasActiveTransientFilters
                  ? onResetTransientFilters
                  : undefined
              }
            />
          ) : null}
        </div>
        {typeof pageSize === "number" && onPageSizeChange ? (
          <ToolbarPageSizeSelect
            value={pageSize}
            onChange={onPageSizeChange}
          />
        ) : null}
      </ToolbarMetaRow>
    </div>
  );
}
