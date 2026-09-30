"use client";

import {
  ToolbarDivider,
  ToolbarHistoryStatusFilter,
  ToolbarRoot,
  ToolbarScoreSlider,
  ToolbarSearch,
  ToolbarSelectAll,
  ToolbarSortSelect,
  ToolbarSourceFilter,
  ToolbarTelemetry,
} from "@/components/jobs/pipeline-toolbar-primitives";
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
};

/**
 * Context-aware Job Radar filter toolbar.
 * Tab layouts:
 * - leads: SelectAll | Score | Search | Source | Sort → Telemetry
 * - applied: SelectAll | Search | Source | Sort → Telemetry
 * - action_required: SelectAll | Search | Sort → Telemetry
 * - history: SelectAll | Search | HistoryStatus | Sort → Telemetry
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
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <ToolbarRoot>
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

      {showTelemetry ? (
        <ToolbarTelemetry
          visibleCount={visibleCount}
          totalCount={totalCount}
          hiddenCount={hiddenCount}
        />
      ) : null}
    </div>
  );
}
