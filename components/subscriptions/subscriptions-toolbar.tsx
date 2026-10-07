"use client";

import {
  ToolbarDivider,
  ToolbarMetaRow,
  ToolbarNativeSelect,
  ToolbarRoot,
  ToolbarScoreSlider,
  ToolbarSearch,
  ToolbarSearchAddon,
  ToolbarSelectAll,
  ToolbarTelemetry,
} from "@/components/jobs/pipeline-toolbar-primitives";
import { ToolbarPageSizeSelect } from "@/components/ui/pipeline-pagination";
import type {
  SubscriptionCategoryFilter,
  SubscriptionSortOption,
} from "@/lib/subscriptions/filters";

export type SubscriptionsToolbarProps = {
  totalCount: number;
  visibleCount: number;
  selectedCount: number;
  isAllSelected: boolean;
  onToggleSelectAll: () => void;
  clutterThreshold: number;
  onClutterThresholdChange: (score: number) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  categoryFilter: SubscriptionCategoryFilter;
  onCategoryFilterChange: (filter: SubscriptionCategoryFilter) => void;
  sortOption: SubscriptionSortOption;
  onSortOptionChange: (sort: SubscriptionSortOption) => void;
  showClutterSlider?: boolean;
  selectEnabled?: boolean;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  hasActiveTransientFilters?: boolean;
  onResetTransientFilters?: () => void;
};

/**
 * Two-row Subscriptions filter chrome:
 * 1) Filter card — Select All, Clutter, Search (+ Category/Sort addons)
 * 2) Meta bar — result counts (left) + page size (right)
 */
export function SubscriptionsToolbar({
  totalCount,
  visibleCount,
  selectedCount,
  isAllSelected,
  onToggleSelectAll,
  clutterThreshold,
  onClutterThresholdChange,
  searchQuery,
  onSearchQueryChange,
  categoryFilter,
  onCategoryFilterChange,
  sortOption,
  onSortOptionChange,
  showClutterSlider = true,
  selectEnabled = true,
  pageSize,
  onPageSizeChange,
  hasActiveTransientFilters = false,
  onResetTransientFilters,
}: SubscriptionsToolbarProps) {
  const canSelect = selectEnabled && visibleCount > 0;
  const isIndeterminate =
    selectedCount > 0 && selectedCount < visibleCount && !isAllSelected;
  const selectLabel = isAllSelected ? "Deselect All" : "Select All";
  const hiddenCount = Math.max(0, totalCount - visibleCount);

  return (
    // Above the listing grid so the search filters panel isn't painted under cards.
    <div className="relative z-20 mb-0">
      <ToolbarRoot className="mb-1.5">
        <ToolbarSelectAll
          checked={isAllSelected}
          indeterminate={isIndeterminate}
          onToggle={onToggleSelectAll}
          label={selectLabel}
          disabled={!canSelect}
        />

        {showClutterSlider ? (
          <>
            <ToolbarDivider />
            <ToolbarScoreSlider
              value={clutterThreshold}
              onChange={onClutterThresholdChange}
              onCommit={onClutterThresholdChange}
              label="Clutter Threshold:"
              inputId="clutter-score-threshold-input"
              ariaLabel="Clutter score threshold"
            />
          </>
        ) : null}

        <ToolbarDivider />

        <ToolbarSearch
          searchQuery={searchQuery}
          onSearchChange={onSearchQueryChange}
          placeholder="Looking for a sender or newsletter? Find it here..."
          ariaLabel="Search subscriptions by sender or newsletter"
        >
          <ToolbarSearchAddon label="Filter · Category">
            <ToolbarNativeSelect
              value={categoryFilter}
              onChange={(e) =>
                onCategoryFilterChange(
                  e.target.value as SubscriptionCategoryFilter
                )
              }
              aria-label="Filter by category"
            >
              <option value="all">All Categories</option>
              <option value="promotions">Promotions</option>
              <option value="newsletters">Newsletters</option>
              <option value="alerts">Alerts</option>
            </ToolbarNativeSelect>
          </ToolbarSearchAddon>

          <ToolbarSearchAddon label="Sort">
            <ToolbarNativeSelect
              value={sortOption}
              onChange={(e) =>
                onSortOptionChange(e.target.value as SubscriptionSortOption)
              }
              aria-label="Sort subscriptions"
            >
              <option value="clutter_desc">Highest Clutter</option>
              <option value="freq_desc">Most Frequent</option>
              <option value="freq_asc">Least Frequent</option>
              <option value="alpha">Alphabetical</option>
              <option value="custom">Custom</option>
            </ToolbarNativeSelect>
          </ToolbarSearchAddon>
        </ToolbarSearch>
      </ToolbarRoot>

      <ToolbarMetaRow>
        <ToolbarTelemetry
          visibleCount={visibleCount}
          totalCount={totalCount}
          hiddenCount={hiddenCount}
          itemLabel="subscriptions"
          onResetFilters={
            hasActiveTransientFilters
              ? onResetTransientFilters
              : undefined
          }
        />
        <ToolbarPageSizeSelect
          value={pageSize}
          onChange={onPageSizeChange}
        />
      </ToolbarMetaRow>
    </div>
  );
}
