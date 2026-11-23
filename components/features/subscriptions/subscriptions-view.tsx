"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useHydrated } from "@/hooks/use-hydrated";
import type { Subscription, SubscriptionHistory } from "@/lib/generated/prisma/client";

import { DragGhost } from "@/components/ui/dnd/drag-ghost";
import { PageFlipBumpers } from "@/components/ui/dnd/page-flip-bumpers";
import { SubscriptionTableHeader } from "@/components/features/subscriptions/subscription-table-header";
import { SubscriptionTableToolbar } from "@/components/features/subscriptions/subscription-table-toolbar";
import { SubscriptionBulkBar } from "@/components/features/subscriptions/subscription-bulk-dialog";
import { SubscriptionViewDialogs } from "@/components/features/subscriptions/subscription-view-dialogs";
import {
  SubscriptionActivePane,
  SubscriptionArchivePane,
} from "@/components/features/subscriptions/subscription-tab-panes";
import { CommandDeckFrame } from "@/components/ui/tactile/segmented-tabs";
import { useSubscriptionsSelection } from "@/hooks/use-subscriptions-selection";
import { useSubscriptionsReorder } from "@/hooks/use-subscriptions-reorder";
import { useSubscriptionsActions } from "@/hooks/use-subscriptions-actions";
import { useSubscriptionsData, useDragGhostData } from "@/hooks/use-subscriptions-data";
import { Tabs } from "@/components/ui/tabs";
import { useCardListGestures } from "@/hooks/use-card-list-gestures";
import { usePagination } from "@/hooks/use-pagination";
import { toast } from "sonner";
import type {
  SubscriptionCategoryFilter,
  SubscriptionSortOption,
} from "@/lib/subscriptions/filters";
import {
  getSubscriptionGestureRules,
  type SubscriptionTab,
} from "@/lib/subscriptions/movement-rules";
import {
  persistClutterThreshold,
  readClutterThreshold,
} from "@/lib/subscriptions/preferences";
import {
  SUBSCRIPTION_PAGE_TABS,
  clearSidebarPageTab,
  peekSidebarPageTab,
  persistActivePageTab,
  resolveInitialPageTab,
  subscribePageTabs,
} from "@/lib/utils/navigation/page-tabs";

const SUBSCRIPTIONS_PAGE_SIZE_KEY = "mailpilot_subscriptions_per_page";

import type { LatestBriefingProp } from "./parts";

type SubscriptionsViewProps = {
  accountId: string;
  subscriptions: Subscription[];
  history: SubscriptionHistory[];
  latestBriefing?: LatestBriefingProp | null;
  initialTab?: string;
};

export function SubscriptionsView({
  accountId,
  subscriptions,
  history,
  latestBriefing = null,
  initialTab,
}: SubscriptionsViewProps) {
  const hydrated = useHydrated();
  const subscriptionTabValues = useMemo(
    () => SUBSCRIPTION_PAGE_TABS.map((item) => item.value),
    []
  );
  const fallbackTab = (initialTab as SubscriptionTab) ?? "active";
  const activeTab: SubscriptionTab = useSyncExternalStore(
    subscribePageTabs,
    () =>
      resolveInitialPageTab({
        href: "/subscriptions",
        allowed: subscriptionTabValues,
        fallback: fallbackTab,
        accountId,
      }),
    () => fallbackTab
  );
  const [customClutter, setCustomClutter] = useState<{
    accountId: string;
    value: number;
  } | null>(null);
  const clutterThreshold =
    customClutter?.accountId === accountId
      ? customClutter.value
      : (hydrated ? readClutterThreshold(accountId) : null) ?? 0;
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] =
    useState<SubscriptionCategoryFilter>("all");
  const [sortOption, setSortOption] =
    useState<SubscriptionSortOption>("clutter_desc");

  const filteredActiveIdsRef = useRef<string[]>([]);
  const requestUnsubscribeRef = useRef<(ids: string[]) => void>(() => {});

  const active = useMemo(
    () =>
      subscriptions.filter(
        (s) => s.status === "ACTIVE" || s.status === "FAILED"
      ),
    [subscriptions]
  );

  const {
    customOrder,
    suppressTabChangeRef,
    handleReorder,
    handleDropZone,
  } = useSubscriptionsReorder({
    accountId,
    filteredActiveIds: filteredActiveIdsRef,
    sortOption,
    onSortOptionChange: setSortOption,
    onRequestUnsubscribe: (ids) => requestUnsubscribeRef.current(ids),
  });

  const {
    archive,
    filteredActive,
    filteredArchive,
    filteredActiveIds,
  } = useSubscriptionsData({
    subscriptions,
    history,
    active,
    clutterThreshold,
    searchQuery,
    categoryFilter,
    sortOption,
    customOrder,
  });
  useLayoutEffect(() => {
    filteredActiveIdsRef.current = filteredActiveIds;
  }, [filteredActiveIds]);

  const {
    selectedIds,
    setSelectedIds,
    selectionMode,
    setSelectionMode,
    lastClickedId,
    clearSelection,
    toggleRow,
    enterSelectionMode,
    paintSelect,
    toggleSelectAll,
    isAllSelected: checkAllSelected,
    selectedSubscriptions,
  } = useSubscriptionsSelection({
    activeItems: active,
    filteredActiveIds,
  });

  const actions = useSubscriptionsActions({
    accountId,
    active,
    selectedIds,
    selectedSubscriptions,
    setSelectedIds,
    setSelectionMode,
    clearSelection,
    latestBriefing,
  });
  useLayoutEffect(() => {
    requestUnsubscribeRef.current = actions.requestUnsubscribe;
  }, [actions.requestUnsubscribe]);

  function setClutterThreshold(value: number) {
    const next = Math.max(0, Math.min(100, Math.round(value)));
    setCustomClutter({ accountId, value: next });
    persistClutterThreshold(accountId, next);
  }

  const [prevActiveTab, setPrevActiveTab] = useState(activeTab);
  if (prevActiveTab !== activeTab) {
    setPrevActiveTab(activeTab);
    setSelectedIds([]);
    setSelectionMode(false);
  }

  useEffect(() => {
    const pending = peekSidebarPageTab(
      "/subscriptions",
      subscriptionTabValues
    );
    if (!pending) return;
    persistActivePageTab("/subscriptions", pending, accountId);
    const clearId = window.setTimeout(() => clearSidebarPageTab(), 0);
    return () => window.clearTimeout(clearId);
  }, [accountId, subscriptionTabValues, activeTab]);

  const changeSortOption = useCallback(
    (sort: SubscriptionSortOption) => {
      clearSelection();
      setSortOption(sort);
    },
    [clearSelection]
  );

  const changeSearchQuery = useCallback(
    (query: string) => {
      clearSelection();
      setSearchQuery(query);
    },
    [clearSelection]
  );

  const changeCategoryFilter = useCallback(
    (filter: SubscriptionCategoryFilter) => {
      clearSelection();
      setCategoryFilter(filter);
    },
    [clearSelection]
  );

  const changeClutterThreshold = useCallback(
    (value: number) => {
      clearSelection();
      setClutterThreshold(value);
    },
    [clearSelection]
  );

  const toolbarTotal =
    activeTab === "active" ? active.length : history.length;
  const toolbarVisible =
    activeTab === "active" ? filteredActive.length : filteredArchive.length;

  const {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalPages,
    slice,
  } = usePagination({
    storageKey: SUBSCRIPTIONS_PAGE_SIZE_KEY,
    totalItems: toolbarVisible,
    resetDeps: [
      activeTab,
      searchQuery,
      clutterThreshold,
      categoryFilter,
      sortOption,
    ],
  });

  const paginatedActiveCommitted = slice(filteredActive);
  const paginatedArchive = slice(filteredArchive);

  const paginatedActiveIds = useMemo(
    () => paginatedActiveCommitted.map((s) => s.id),
    [paginatedActiveCommitted]
  );

  const gestureRules = getSubscriptionGestureRules({
    activeTab,
    sortIsCustom: sortOption === "custom",
    hasSavedCustomOrder: customOrder.length > 0,
  });

  const changePage = useCallback(
    (page: number) => {
      clearSelection();
      setCurrentPage(page);
    },
    [clearSelection, setCurrentPage]
  );

  const changePageSize = useCallback(
    (size: number) => {
      clearSelection();
      setPageSize(size);
    },
    [clearSelection, setPageSize]
  );

  const { drag, bindItem, onBackgroundPointerDown } = useCardListGestures({
    pageItemIds: paginatedActiveIds,
    fullItemIds: filteredActiveIds,
    selectedIds,
    selectionMode: selectionMode || selectedIds.length > 0,
    onEnterSelectionMode: enterSelectionMode,
    onToggleSelect: toggleRow,
    onPaintSelect: paintSelect,
    onClearSelection: clearSelection,
    rules: gestureRules,
    currentPage,
    totalPages,
    pageSize,
    onPageChange: setCurrentPage,
    onReorder: handleReorder,
    onDropZone: handleDropZone,
    onReorderBlocked: () => {
      toast.message("Switch to Custom to reorder", {
        action: {
          label: "Custom",
          onClick: () => changeSortOption("custom"),
        },
      });
    },
  });

  const { dragLabel, dragStackItems, displayActive } = useDragGhostData(
    drag,
    filteredActive,
    active
  );

  const paginatedActive = slice(displayActive);

  const defaultSort: SubscriptionSortOption = "clutter_desc";
  const hasActiveTransientFilters =
    clutterThreshold > 0 ||
    searchQuery.trim().length > 0 ||
    categoryFilter !== "all" ||
    sortOption !== defaultSort;

  function handleResetTransientFilters() {
    clearSelection();
    setClutterThreshold(0);
    setSearchQuery("");
    setCategoryFilter("all");
    setSortOption(defaultSort);
    setCurrentPage(1);
  }

  const pageSubscriptionIds = useMemo(
    () => paginatedActive.map((subscription) => subscription.id),
    [paginatedActive]
  );
  const isAllSelected = checkAllSelected(pageSubscriptionIds);

  function handleToggleSelectAll() {
    toggleSelectAll(pageSubscriptionIds);
  }

  return (
    <div onPointerDown={onBackgroundPointerDown}>
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
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (suppressTabChangeRef.current) return;
          persistActivePageTab("/subscriptions", value, accountId);
          clearSelection();
        }}
        className="w-full"
      >
        <CommandDeckFrame
          rail={
            <SubscriptionTableHeader
              accountId={accountId}
              activeCount={active.length}
              archiveCount={archive.length}
              dragDropZone={drag?.dropZone}
            />
          }
          toolbar={
            <SubscriptionTableToolbar
              totalCount={toolbarTotal}
              visibleCount={toolbarVisible}
              selectedCount={
                activeTab === "active" ? selectedIds.length : 0
              }
              isAllSelected={activeTab === "active" ? isAllSelected : false}
              onToggleSelectAll={
                activeTab === "active" ? handleToggleSelectAll : () => undefined
              }
              clutterThreshold={clutterThreshold}
              onClutterThresholdChange={changeClutterThreshold}
              searchQuery={searchQuery}
              onSearchQueryChange={changeSearchQuery}
              categoryFilter={categoryFilter}
              onCategoryFilterChange={changeCategoryFilter}
              sortOption={sortOption}
              onSortOptionChange={changeSortOption}
              showClutterSlider
              selectEnabled={activeTab === "active"}
              pageSize={pageSize}
              onPageSizeChange={changePageSize}
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={changePage}
              hasActiveTransientFilters={hasActiveTransientFilters}
              onResetTransientFilters={handleResetTransientFilters}
            />
          }
        >
          <SubscriptionActivePane
            activeCount={active.length}
            filteredCount={filteredActive.length}
            paginatedActive={paginatedActive}
            selectedIds={selectedIds}
            lastClickedId={lastClickedId}
            onToggleRow={toggleRow}
            bindItem={bindItem}
            onUnsubscribe={(sub) => actions.requestUnsubscribe([sub.id])}
            onBriefing={(sub) => actions.openBriefing([sub])}
            resolveBriefing={actions.resolveBriefingForSub}
            onViewLastBriefing={actions.setViewingBriefing}
            onViewLastEmail={actions.setSelectedEmailSub}
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageChange={changePage}
          />

          <SubscriptionArchivePane
            archiveCount={archive.length}
            filteredCount={filteredArchive.length}
            paginatedArchive={paginatedArchive}
            cleanupPendingKey={actions.cleanupPending}
            pending={actions.pending || actions.deleteRecordPending}
            onCleanup={actions.runBatchCleanup}
            onDeleteRecord={actions.setDeleteRecordTarget}
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageChange={changePage}
          />
        </CommandDeckFrame>
      </Tabs>

      {activeTab === "active" ? (
        <SubscriptionBulkBar
          selectedIds={selectedIds}
          selectedSubscriptions={selectedSubscriptions}
          selectedWithBriefingIds={actions.selectedWithBriefingIds}
          pending={actions.pending}
          briefingPending={actions.briefingPending}
          deletePending={actions.deletePending}
          onClearSelection={clearSelection}
          onRequestUnsubscribe={actions.requestUnsubscribe}
          onOpenBriefing={actions.openBriefing}
          onDeleteBriefings={(ids) =>
            void actions.deleteBriefingsForSubscriptions(ids)
          }
        />
      ) : null}

      <SubscriptionViewDialogs
        actions={actions}
        selectedIds={selectedIds}
        selectedSubscriptions={selectedSubscriptions}
        active={active}
      />
    </div>
  );
}
