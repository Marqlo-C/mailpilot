"use client";

import {
  ToolbarDivider,
  ToolbarHalf,
  ToolbarMetaRow,
  ToolbarNativeSelect,
  ToolbarRoot,
  ToolbarScoreSlider,
  ToolbarSearch,
  ToolbarSearchAddon,
  ToolbarSelectAll,
  ToolbarTelemetry,
} from "@/components/opportunities/toolbar/pipeline-toolbar-primitives";
import { ToolbarPageNav, ToolbarPageSizeSelect } from "@/components/ui/composites/pipeline-pagination";
import {
  SUBSCRIPTION_SORT_OPTIONS,
  type SubscriptionCategoryFilter,
  type SubscriptionSortOption,
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
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  hasActiveTransientFilters?: boolean;
  onResetTransientFilters?: () => void;
};

/**
 * Two-row Subscriptions filter chrome:
 * 1) Filter card — Select All, Noise Filter, Search (+ Category/Sort addons)
 * 2) Meta bar — result counts (left) + page readout and page size (right)
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
  currentPage,
  totalPages,
  onPageChange,
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
        {showClutterSlider ? (
          <>
            <ToolbarHalf>
              {/* 12px each side — same as subscription row checkboxes (pl-3 / gap-3).
                  pl-1 + ToolbarRoot px-2 = 12px from the plate edge. */}
              <div className="flex shrink-0 items-center gap-3 pl-1">
                <ToolbarSelectAll
                  checked={isAllSelected}
                  indeterminate={isIndeterminate}
                  onToggle={onToggleSelectAll}
                  label={selectLabel}
                  disabled={!canSelect}
                />
                <ToolbarDivider className="mx-0" />
              </div>
              <ToolbarScoreSlider
                value={clutterThreshold}
                onChange={onClutterThresholdChange}
                onCommit={onClutterThresholdChange}
                label="Noise Filter:"
                labelTooltip="Hides quieter senders. Noise rises with mail volume and how recently they emailed. Raise it to keep only the noisiest lists."
                inputId="clutter-score-threshold-input"
                ariaLabel="Noise filter"
              />
            </ToolbarHalf>
            <ToolbarDivider />
            <ToolbarHalf>
              <ToolbarSearch
                searchQuery={searchQuery}
                onSearchChange={onSearchQueryChange}
                placeholder="Looking for a sender or newsletter? Find it here..."
                ariaLabel="Search subscriptions by sender or newsletter"
              >
                <ToolbarSearchAddon label="Filter · Category">
                  <ToolbarNativeSelect
                    value={categoryFilter}
                    onChange={(next) =>
                      onCategoryFilterChange(
                        next as SubscriptionCategoryFilter
                      )
                    }
                    aria-label="Filter by category"
                    options={[
                      { value: "all", label: "All Categories" },
                      { value: "promotions", label: "Promotions" },
                      { value: "newsletters", label: "Newsletters" },
                      { value: "alerts", label: "Alerts" },
                    ]}
                  />
                </ToolbarSearchAddon>

                <ToolbarSearchAddon label="Sort">
                  <ToolbarNativeSelect
                    value={sortOption}
                    onChange={(next) =>
                      onSortOptionChange(next as SubscriptionSortOption)
                    }
                    aria-label="Sort subscriptions"
                    options={SUBSCRIPTION_SORT_OPTIONS}
                  />
                </ToolbarSearchAddon>
              </ToolbarSearch>
            </ToolbarHalf>
          </>
        ) : (
          <>
            <div className="flex shrink-0 items-center gap-3 pl-1">
              <ToolbarSelectAll
                checked={isAllSelected}
                indeterminate={isIndeterminate}
                onToggle={onToggleSelectAll}
                label={selectLabel}
                disabled={!canSelect}
              />
              <ToolbarDivider className="mx-0" />
            </div>
            <ToolbarSearch
              searchQuery={searchQuery}
              onSearchChange={onSearchQueryChange}
              placeholder="Looking for a sender or newsletter? Find it here..."
              ariaLabel="Search subscriptions by sender or newsletter"
            >
              <ToolbarSearchAddon label="Filter · Category">
                <ToolbarNativeSelect
                  value={categoryFilter}
                  onChange={(next) =>
                    onCategoryFilterChange(
                      next as SubscriptionCategoryFilter
                    )
                  }
                  aria-label="Filter by category"
                  options={[
                    { value: "all", label: "All Categories" },
                    { value: "promotions", label: "Promotions" },
                    { value: "newsletters", label: "Newsletters" },
                    { value: "alerts", label: "Alerts" },
                  ]}
                />
              </ToolbarSearchAddon>

              <ToolbarSearchAddon label="Sort">
                <ToolbarNativeSelect
                  value={sortOption}
                  onChange={(next) =>
                    onSortOptionChange(next as SubscriptionSortOption)
                  }
                  aria-label="Sort subscriptions"
                  options={SUBSCRIPTION_SORT_OPTIONS}
                />
              </ToolbarSearchAddon>
            </ToolbarSearch>
          </>
        )}
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
        <div className="flex shrink-0 items-center gap-2">
          <ToolbarPageNav
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
          <ToolbarPageSizeSelect
            value={pageSize}
            onChange={onPageSizeChange}
          />
        </div>
      </ToolbarMetaRow>
    </div>
  );
}
