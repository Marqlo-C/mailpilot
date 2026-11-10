"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import type { Subscription, SubscriptionHistory } from "@prisma/client";
import {
  CirclePlus,
  DatabaseX,
  Eye,
  Loader2,
  History,
  Mail,
  Trash2,
  UserRoundMinus,
} from "lucide-react";
import { toast } from "sonner";

import { SyncControls } from "@/components/opportunities/sync-controls";
import { SnapshotIcon } from "@/components/icons/snapshot-icon";
import { WavyDashedLine } from "@/components/ui/tactile/wavy-dashed-line";
import { SnapshotDialog } from "@/components/subscriptions/snapshot-dialog";
import { EmailPreviewDialog } from "@/components/subscriptions/email-preview-dialog";
import {
  formatPreviewDisplayDate,
  PreviewLoadChrome,
} from "@/components/subscriptions/preview-load-chrome";
import {
  DragGhost,
  type DragGhostStackItem,
} from "@/components/dnd/drag-ghost";
import { PageFlipBumpers } from "@/components/dnd/page-flip-bumpers";
import { SubscriptionsToolbar } from "@/components/subscriptions/subscriptions-toolbar";
import { ActionDialogShell } from "@/components/ui/composites/action-dialog-shell";
import { CreateSnapshotButton } from "@/components/ui/composites/create-snapshot-button";
import {
  BULK_ACTION_BTN_CLASSNAME,
  BULK_ACTION_COUNT_DISMISS_CLASSNAME,
  BULK_ACTION_DISMISS_BTN_CLASSNAME,
  BulkActionCount,
  BulkActionSection,
  BulkActionSeparator,
} from "@/components/ui/composites/bulk-actions-flyout";
import { BulkActionsWithClassifying } from "@/components/layout/bulk-actions-with-classifying";
import { ConfirmActionDialog } from "@/components/ui/composites/confirm-action-dialog";
import { RowMenuTrigger } from "@/components/ui/composites/row-menu-trigger";
import { CompanyLogo } from "@/components/ui/logo-frame";
import { DialogIdentityLogoStack } from "@/components/ui/composites/dialog-identity-header";
import {
  AppMenuContent,
  AppMenuItem,
} from "@/components/ui/app-menu";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PipelinePaginationFooter } from "@/components/ui/composites/pipeline-pagination";
import {
  CommandDeckFrame,
  tabRailRowClassName,
  TabCountBadge,
  useTabRailClasses,
} from "@/components/ui/tactile/segmented-tabs";
import {
  META_CHIP_ICON_CLASSNAME,
  MetaChip,
} from "@/components/ui/tactile/meta-chip";
import { selectCheckboxClassName } from "@/components/ui/styles/select-checkbox";
import { useSubscriptionsSelection } from "@/hooks/use-subscriptions-selection";
import { useSubscriptionsReorder } from "@/hooks/use-subscriptions-reorder";
import {
  getSelectionGroupEdges,
  selectHighlightCardGroupClassName,
  selectHighlightGroupClassName,
  type SelectionGroupEdges,
} from "@/components/ui/styles/select-highlight";
import {
  PRIMARY_ACTION_BTN_CLASSNAME,
  PRIMARY_ACTION_BTN_MUTED_CLASSNAME,
  PRIMARY_DESTRUCTIVE_ACTION_BTN_CLASSNAME,
} from "@/components/ui/styles/primary-action-btn";
import {
  SECONDARY_DESTRUCTIVE_ACTION_BTN_CLASSNAME,
} from "@/components/ui/styles/secondary-action-btn";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LabelTooltip } from "@/components/ui/tooltip";
import { useCardListGestures } from "@/hooks/use-card-list-gestures";
import { usePagination } from "@/hooks/use-pagination";
import { orderItemsByIds } from "@/lib/dnd/reorder";
import { faviconUrlForDomain, getCleanDomain } from "@/lib/utils/domain";
import { formatDistanceToNow } from "@/lib/utils/format-distance";
import {
  clearLocalBriefingsForSubscriptions,
  deleteLocalBriefings,
  listLocalBriefings,
  migrateDisplacedBriefingToLocal,
  type LocalBriefingRecord,
} from "@/lib/subscriptions/briefing-local";
import { constrainBriefingPreviewHtml } from "@/lib/subscriptions/digest-constants";
import {
  clutterScoreTier,
  compareSubscriptionsBySort,
  effectiveSubscriptionClutterScore,
  inferSubscriptionCategory,
  matchesSubscriptionSearch,
  subscriptionClutterScore,
  type ClutterScoreTier,
  type SubscriptionCategoryFilter,
  type SubscriptionSortOption,
} from "@/lib/subscriptions/filters";
import {
  getSubscriptionGestureRules,
  resolveSubscriptionCardAction,
  resolveSubscriptionMove,
  type SubscriptionTab,
} from "@/lib/subscriptions/movement-rules";
import {
  applyCustomOrder,
  persistClutterThreshold,
  readClutterThreshold,
} from "@/lib/subscriptions/preferences";
import { runSubscriptionMove } from "@/lib/subscriptions/run-subscription-move";
import {
  SUBSCRIPTION_PAGE_TABS,
  SUBSCRIPTION_TAB_LABEL,
  clearSidebarPageTab,
  peekSidebarPageTab,
  persistActivePageTab,
  readActivePageTab,
} from "@/lib/navigation/page-tabs";
import { cn } from "@/lib/utils";
import type { CleanupAction } from "@/lib/gmail/unsubscribe";

/**
 * Clutter tier tints — same red / warm / teal roles, shaded to page tokens
 * (#c21f10 destructive, chart-2 warm, brand #1ab5af).
 */
const CLUTTER_VALUE_CLASSES: Record<ClutterScoreTier, string> = {
  high: "bg-[#c21f10]/10 text-[#c21f10] dark:bg-[#fb6230]/18 dark:text-[#fb6230]",
  mid: "bg-[hsl(28_70%_48%/0.14)] text-[hsl(28_62%_36%)] dark:bg-[hsl(28_70%_48%/0.2)] dark:text-[hsl(28_75%_68%)]",
  // Opaque but low-sat teal so it reads on the page without competing with brand mint.
  low: "bg-[hsl(174_22%_92%)] text-[#147a76] dark:bg-[hsl(174_28%_22%/0.55)] dark:text-[#5eead4]",
};

/** Gray mute for metric pills when the parent row/card is selected. */
const SELECT_MUTED_PILL_VALUE_CLASSNAME =
  "bg-muted/50 text-muted-foreground";

const UNSUBSCRIBE_OPTIONS: {
  value: CleanupAction;
  label: string;
  description: string;
}[] = [
  {
    value: "NONE",
    label: "Keep",
    description: "Leave your inbox alone.",
  },
  {
    value: "ARCHIVE",
    label: "Archive",
    description: "Remove them from Inbox; they stay in All Mail / Archive.",
  },
  {
    value: "TRASH",
    label: "Delete",
    description: "Move past mail from this sender to Trash.",
  },
];

const SUBSCRIPTIONS_PAGE_SIZE_KEY = "mailpilot_subscriptions_per_page";

import {
  ActiveDesktopTable,
  ActiveMobileCards,
  ArchiveDesktopTable,
  ArchiveMobileCards,
  EmptyState,
  SnapshotPreviewDialog,
  UnsubscribeCleanupDialog,
  clutterForSub,
  formatLastReceivedValue,
  senderLogoSrc,
  type ArchiveEntry,
  type LatestBriefingProp,
  type ResolvedBriefing,
} from "./parts";

type SubscriptionsViewProps = {
  accountId: string;
  subscriptions: Subscription[];
  history: SubscriptionHistory[];
  latestBriefing?: LatestBriefingProp | null;
  initialTab?: string;
};

const subscriptionTabDescriptions: Record<SubscriptionTab, string> = {
  active:
    "Detected newsletter and subscription lists eligible for one-click unsubscribe.",
  archive: "Archived senders and second-chance message batch cleanup.",
};

export function SubscriptionsView({
  accountId,
  subscriptions,
  history,
  latestBriefing = null,
  initialTab,
}: SubscriptionsViewProps) {
  const router = useRouter();
  const {
    listClassName: segmentedTabsListClassName,
    triggerClassName: segmentedTabsTriggerClassName,
  } = useTabRailClasses();
  const [activeTab, setActiveTab] = useState<SubscriptionTab>(
    () => (initialTab as SubscriptionTab) ?? "active"
  );
  const [selected, setSelected] = useState<Subscription | null>(null);
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [briefingTargets, setBriefingTargets] = useState<Subscription[]>([]);
  const [briefingPending, setBriefingPending] = useState(false);
  const [viewingBriefing, setViewingBriefing] =
    useState<ResolvedBriefing | null>(null);
  const [briefingPreviewLoading, setBriefingPreviewLoading] = useState(false);
  const [selectedEmailSub, setSelectedEmailSub] =
    useState<Subscription | null>(null);
  const [localBriefings, setLocalBriefings] = useState<
    Record<string, LocalBriefingRecord>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [cleanupPending, setCleanupPending] = useState<string | null>(null);
  const [cleanupChoice, setCleanupChoice] =
    useState<CleanupAction>("NONE");
  const [deleteRecordTarget, setDeleteRecordTarget] =
    useState<ArchiveEntry | null>(null);
  const [deleteRecordPending, setDeleteRecordPending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);

  const unsubscribeDialogOpen = Boolean(selected) || batchConfirmOpen;

  const [clutterThreshold, setClutterThresholdState] = useState(0);
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
    setCustomOrder,
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
    selectedIds,
    setSelectedIds,
    selectionMode,
    setSelectionMode,
    lastClickedId,
    markLastClicked,
    clearSelection,
    toggleRow,
    enterSelectionMode,
    paintSelect,
    toggleSelectAll,
    isAllSelected: checkAllSelected,
    selectedSubscriptions,
  } = useSubscriptionsSelection({
    activeItems: active,
    filteredActiveIds: filteredActiveIdsRef,
  });

  // Hydrate before paint so the clutter slider thumb isn't at 0 on first frame.
  useLayoutEffect(() => {
    setLocalBriefings(listLocalBriefings(accountId));
    const stored = readClutterThreshold(accountId);
    if (stored != null) {
      setClutterThresholdState(stored);
    }
  }, [accountId]);

  useEffect(() => {
    if (unsubscribeDialogOpen) {
      setCleanupChoice("NONE");
      setError(null);
    }
  }, [unsubscribeDialogOpen]);

  function setClutterThreshold(value: number) {
    const next = Math.max(0, Math.min(100, Math.round(value)));
    setClutterThresholdState(next);
    persistClutterThreshold(accountId, next);
  }

  useLayoutEffect(() => {
    const pending = peekSidebarPageTab(
      "/subscriptions",
      SUBSCRIPTION_PAGE_TABS.map((item) => item.value)
    );
    if (pending) {
      setActiveTab(pending);
      persistActivePageTab("/subscriptions", pending, accountId);
      clearSelection();
      const clearId = window.setTimeout(() => clearSidebarPageTab(), 0);
      return () => window.clearTimeout(clearId);
    }

    const saved = readActivePageTab(
      "/subscriptions",
      SUBSCRIPTION_PAGE_TABS.map((item) => item.value),
      accountId
    );
    if (saved && saved !== activeTab) {
      setActiveTab(saved);
      clearSelection();
    }
  }, [accountId, activeTab, clearSelection]);

  /** User-driven view changes leave multi-select; drag page-flips use setCurrentPage directly. */
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

  const archive = useMemo(() => {
    const map = new Map<string, ArchiveEntry>();

    for (const sub of subscriptions) {
      if (sub.status !== "UNSUBSCRIBED") continue;
      const key = sub.senderEmail.toLowerCase();
      map.set(key, {
        key,
        senderEmail: sub.senderEmail,
        senderName: sub.senderName,
        emailCount: sub.emailCount,
        lastReceivedAt: sub.lastReceivedAt,
        subscriptionId: sub.id,
        source: "subscription",
      });
    }

    for (const row of history) {
      if (row.status !== "UNSUBSCRIBED") continue;
      const key = row.senderEmail.toLowerCase();
      if (map.has(key)) continue;
      map.set(key, {
        key,
        senderEmail: row.senderEmail,
        senderName: row.senderName,
        emailCount: null,
        lastReceivedAt: null,
        subscriptionId: null,
        source: "history",
      });
    }

    return [...map.values()];
  }, [subscriptions, history]);

  const filteredActive = useMemo(() => {
    const filtered = active.filter((sub) => {
      const clutter = effectiveSubscriptionClutterScore(sub);
      if (clutter < clutterThreshold) return false;
      if (!matchesSubscriptionSearch(sub, searchQuery)) return false;
      if (
        categoryFilter !== "all" &&
        inferSubscriptionCategory(sub) !== categoryFilter
      ) {
        return false;
      }
      return true;
    });

    if (sortOption === "custom") {
      return applyCustomOrder(filtered, customOrder);
    }

    return [...filtered].sort((a, b) =>
      compareSubscriptionsBySort(a, b, sortOption)
    );
  }, [
    active,
    clutterThreshold,
    searchQuery,
    categoryFilter,
    sortOption,
    customOrder,
  ]);

  const filteredArchive = useMemo(() => {
    // Custom order is Active-only; Unsubscribed falls back to clutter.
    const archiveSort: SubscriptionSortOption =
      sortOption === "custom" ? "clutter_desc" : sortOption;

    return archive
      .filter((entry) => {
        const score = subscriptionClutterScore({
          emailCount: entry.emailCount ?? 0,
          lastReceivedAt: entry.lastReceivedAt,
        });
        if (score < clutterThreshold) return false;
        if (!matchesSubscriptionSearch(entry, searchQuery)) return false;
        if (
          categoryFilter !== "all" &&
          inferSubscriptionCategory(entry) !== categoryFilter
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) =>
        compareSubscriptionsBySort(
          {
            senderEmail: a.senderEmail,
            senderName: a.senderName,
            emailCount: a.emailCount ?? 0,
            lastReceivedAt: a.lastReceivedAt,
          },
          {
            senderEmail: b.senderEmail,
            senderName: b.senderName,
            emailCount: b.emailCount ?? 0,
            lastReceivedAt: b.lastReceivedAt,
          },
          archiveSort
        )
      );
  }, [archive, clutterThreshold, searchQuery, categoryFilter, sortOption]);

  const filteredActiveIds = useMemo(
    () => filteredActive.map((s) => s.id),
    [filteredActive]
  );
  filteredActiveIdsRef.current = filteredActiveIds;

  function resolveBriefingForSub(sub: Subscription): ResolvedBriefing | null {
    if (
      latestBriefing &&
      latestBriefing.subscriptionIds.includes(sub.id)
    ) {
      return {
        ...latestBriefing,
        subscriptionId: sub.id,
        source: "db",
      };
    }
    const local = localBriefings[sub.id];
    if (!local) return null;
    return {
      id: local.id,
      subject: local.subject ?? null,
      htmlPreview: local.htmlPreview,
      generatedAt: local.generatedAt,
      senderEmails: local.senderEmails,
      subscriptionIds: local.subscriptionIds,
      subscriptionId: sub.id,
      source: "local",
    };
  }

  const selectedWithBriefingIds = useMemo(
    () =>
      selectedSubscriptions
        .filter((s) => {
          if (latestBriefing?.subscriptionIds.includes(s.id)) return true;
          return Boolean(localBriefings[s.id]);
        })
        .map((s) => s.id),
    [selectedSubscriptions, latestBriefing, localBriefings]
  );

  function openBriefing(targets: Subscription[]) {
    if (targets.length === 0) return;
    setBriefingTargets(targets);
    setBriefingOpen(true);
  }

  useEffect(() => {
    if (!viewingBriefing) {
      setBriefingPreviewLoading(false);
      return;
    }
    setBriefingPreviewLoading(true);
    // Fallback if iframe onLoad is skipped (e.g. empty/cached srcDoc edge cases).
    const fallback = window.setTimeout(() => {
      setBriefingPreviewLoading(false);
    }, 2000);
    return () => window.clearTimeout(fallback);
  }, [viewingBriefing?.id]);

  function openBriefingFromViewing() {
    if (!viewingBriefing) return;
    const idSet = new Set(viewingBriefing.subscriptionIds);
    const emailSet = new Set(
      viewingBriefing.senderEmails.map((e) => e.toLowerCase())
    );
    let targets = active.filter((s) => idSet.has(s.id));
    if (targets.length === 0) {
      targets = active.filter((s) =>
        emailSet.has(s.senderEmail.toLowerCase())
      );
    }
    if (targets.length === 0) {
      const one = active.find((s) => s.id === viewingBriefing.subscriptionId);
      if (one) targets = [one];
    }
    if (targets.length === 0) {
      toast.error("Those senders are no longer in Subscribed");
      return;
    }
    setViewingBriefing(null);
    openBriefing(targets);
  }

  async function runBriefingDigest(range: {
    startDate: string;
    endDate: string;
  }) {
    if (briefingTargets.length === 0 || briefingPending) return;
    setBriefingPending(true);
    const toastId = toast.loading("Generating snapshot…");
    const newSubIds = briefingTargets.map((s) => s.id);
    try {
      const response = await fetch("/api/subscriptions/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderEmails: briefingTargets.map((s) => s.senderEmail),
          startDate: range.startDate,
          endDate: range.endDate,
        }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        processedCount?: number;
        digestSentTo?: string;
        error?: string;
        displacedBriefing?: LatestBriefingProp | null;
        briefing?: LatestBriefingProp;
      };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Failed to create snapshot");
      }

      if (payload.displacedBriefing) {
        migrateDisplacedBriefingToLocal(
          accountId,
          payload.displacedBriefing,
          newSubIds
        );
      }
      clearLocalBriefingsForSubscriptions(accountId, newSubIds);
      setLocalBriefings(listLocalBriefings(accountId));

      toast.success(
        `Snapshot sent to ${payload.digestSentTo ?? "your inbox"} · ${payload.processedCount ?? 0} cleaned`,
        { id: toastId }
      );
      setBriefingOpen(false);
      setBriefingTargets([]);
      setSelectedIds([]);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create snapshot",
        { id: toastId }
      );
    } finally {
      setBriefingPending(false);
    }
  }

  async function deleteBriefingsForSubscriptions(subscriptionIds: string[]) {
    if (subscriptionIds.length === 0 || deletePending) return;
    setDeletePending(true);
    const toastId = toast.loading(
      subscriptionIds.length === 1
        ? "Deleting snapshot…"
        : `Deleting ${subscriptionIds.length} snapshots…`
    );
    try {
      const response = await fetch("/api/subscriptions/digest/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionIds }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Failed to delete snapshot");
      }
      deleteLocalBriefings(accountId, subscriptionIds);
      setLocalBriefings(listLocalBriefings(accountId));
      toast.success(
        subscriptionIds.length === 1
          ? "Snapshot deleted"
          : `${subscriptionIds.length} snapshots deleted`,
        { id: toastId }
      );
      setViewingBriefing(null);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete snapshot",
        { id: toastId }
      );
    } finally {
      setDeletePending(false);
    }
  }

  function closeUnsubscribeDialog() {
    setSelected(null);
    setBatchConfirmOpen(false);
    setError(null);
  }

  /** Shared entry for card, bulk, and DnD → unsubscribe confirm. */
  function requestUnsubscribe(ids: string[]) {
    const resolved = resolveSubscriptionCardAction("active", "unsubscribe");
    if (resolved.kind === "forbidden") {
      toast.error(resolved.description);
      return;
    }
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return;

    if (unique.length === 1) {
      const sub = active.find((s) => s.id === unique[0]) ?? null;
      if (sub) {
        setSelected(sub);
        setBatchConfirmOpen(false);
        setError(null);
        return;
      }
    }

    setSelectionMode(true);
    setSelectedIds(unique);
    setSelected(null);
    setError(null);
    setBatchConfirmOpen(true);
  }
  requestUnsubscribeRef.current = requestUnsubscribe;

  function runUnsubscribe(cleanup: CleanupAction) {
    const ids = batchConfirmOpen
      ? selectedIds
      : selected
        ? [selected.id]
        : [];
    if (ids.length === 0) return;
    setError(null);
    startTransition(async () => {
      const toastId =
        ids.length > 1
          ? toast.loading(`Unsubscribing ${ids.length} sender(s)…`)
          : undefined;
      const result = await runSubscriptionMove("unsubscribe", {
        subscriptionIds: ids,
        cleanup,
      });
      if (!result.ok) {
        if (toastId) toast.error(result.error, { id: toastId });
        else setError(result.error);
        return;
      }
      const okCount = result.data?.count ?? 0;
      const failCount = result.data?.failed ?? 0;
      if (toastId) {
        if (failCount === 0) {
          toast.success(`Unsubscribed ${okCount} sender(s)`, { id: toastId });
        } else {
          toast.error(`Unsubscribed ${okCount}, failed ${failCount}`, {
            id: toastId,
          });
        }
      }
      clearSelection();
      closeUnsubscribeDialog();
      router.refresh();
    });
  }

  function runBatchCleanup(entry: ArchiveEntry) {
    const resolved = resolveSubscriptionCardAction("archive", "cleanup");
    if (resolved.kind === "forbidden") {
      toast.error(resolved.description);
      return;
    }
    setCleanupPending(entry.key);
    startTransition(async () => {
      const result = await runSubscriptionMove("cleanup", {
        accountId,
        senderEmail: entry.senderEmail,
      });
      setCleanupPending(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Moved ${result.data?.count ?? 0} past email(s) to Trash`
      );
      router.refresh();
    });
  }

  function runDeleteUnsubscribedRecord() {
    if (!deleteRecordTarget) return;
    const resolved = resolveSubscriptionCardAction("archive", "delete_record");
    if (resolved.kind === "forbidden") {
      toast.error(resolved.description);
      return;
    }
    const entry = deleteRecordTarget;
    setDeleteRecordPending(true);
    startTransition(async () => {
      const result = await runSubscriptionMove("delete_record", {
        accountId,
        senderEmail: entry.senderEmail,
      });
      setDeleteRecordPending(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (entry.subscriptionId) {
        deleteLocalBriefings(accountId, [entry.subscriptionId]);
        setLocalBriefings(listLocalBriefings(accountId));
      }
      setDeleteRecordTarget(null);
      toast.success("Record deleted");
      router.refresh();
    });
  }

  const toolbarTotal =
    activeTab === "active" ? active.length : archive.length;
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
    // Edge flips keep multi-select; toolbar/footer page changes clear it.
    onPageChange: setCurrentPage,
    onReorder: handleReorder,
    onDropZone: handleDropZone,
    onReorderBlocked: () => {
      toast.message("Switch to Custom order to rearrange", {
        action: {
          label: "Custom",
          onClick: () => changeSortOption("custom"),
        },
      });
    },
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

  const dragLabel = useMemo(() => {
    if (!drag?.active) return null;
    const primary =
      filteredActive.find((s) => s.id === drag.originId) ??
      active.find((s) => s.id === drag.originId);
    return primary?.senderName ?? primary?.senderEmail ?? "Subscription";
  }, [drag, filteredActive, active]);

  const dragStackItems = useMemo(() => {
    if (!drag?.active) return [];
    // Grabbed card first so front name + icon match; others fill the peek stack.
    const orderedIds = [
      drag.originId,
      ...drag.movedIds.filter((id) => id !== drag.originId),
    ].slice(0, 4);
    return orderedIds.map((id) => {
      const sub =
        filteredActive.find((s) => s.id === id) ??
        active.find((s) => s.id === id);
      const name = sub?.senderName ?? sub?.senderEmail ?? "Subscription";
      const email = sub?.senderEmail ?? null;
      const item: DragGhostStackItem = {
        name,
        subtitle: email && name !== email ? email : null,
        logoSrc: email ? senderLogoSrc(email) : null,
        score: sub ? clutterForSub(sub) : null,
        scoreKind: "clutter",
        emailCount: sub?.emailCount ?? null,
        lastReceivedLabel: sub
          ? formatLastReceivedValue(sub.lastReceivedAt)
          : null,
        actions: ["snapshot", "unsubscribe"],
      };
      return item;
    });
  }, [drag, filteredActive, active]);

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

  const displayActive = useMemo(() => {
    if (drag?.previewFullIds) {
      return orderItemsByIds(filteredActive, drag.previewFullIds);
    }
    return filteredActive;
  }, [drag?.previewFullIds, filteredActive]);

  const paginatedActive = slice(displayActive);
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
          setActiveTab(value as SubscriptionTab);
          persistActivePageTab("/subscriptions", value, accountId);
          clearSelection();
        }}
        className="w-full"
      >
        <CommandDeckFrame
          rail={
            <div className={cn(tabRailRowClassName, "mb-0")}>
              <div className="flex items-center gap-1.5">
                <TabsList className={segmentedTabsListClassName} data-mp-tab-rail="">
                  {/*
                    Tip wraps a span — not TabsTrigger. Tooltip asChild would
                    overwrite data-state and kill the teal active edge indicator.
                  */}
                  <LabelTooltip
                    label={subscriptionTabDescriptions.active}
                    side="bottom"
                    contentClassName="text-left"
                  >
                    <span className="inline-flex">
                      <TabsTrigger
                        value="active"
                        className={segmentedTabsTriggerClassName}
                      >
                        <span>{SUBSCRIPTION_TAB_LABEL.active}</span>
                        <TabCountBadge count={active.length} />
                      </TabsTrigger>
                    </span>
                  </LabelTooltip>
                  <LabelTooltip
                    label={subscriptionTabDescriptions.archive}
                    side="bottom"
                    contentClassName="text-left"
                  >
                    <span className="inline-flex">
                      <TabsTrigger
                        value="archive"
                        data-dnd-drop-zone="archive"
                        className={cn(
                          segmentedTabsTriggerClassName,
                          drag?.dropZone === "archive" &&
                            "ring-2 ring-[#c21f10]/70 ring-offset-2 ring-offset-background"
                        )}
                      >
                        <span>{SUBSCRIPTION_TAB_LABEL.archive}</span>
                        <TabCountBadge count={archive.length} />
                      </TabsTrigger>
                    </span>
                  </LabelTooltip>
                </TabsList>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <SyncControls accountId={accountId} />
              </div>
            </div>
          }
          toolbar={
            <SubscriptionsToolbar
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

        {/* Near full column (job two-up span), inset 7px/side. */}
        <TabsContent value="active" className="relative z-0 mt-0 space-y-3 px-[7px]">
          {active.length === 0 ? (
            <EmptyState
              title="No subscribed senders"
              body="MailPilot will capture senders that advertise List-Unsubscribe headers."
            />
          ) : filteredActive.length === 0 ? (
            <EmptyState
              title="No matching subscriptions"
              body="Try lowering the noise filter or clearing search filters."
            />
          ) : (
            <>
              <ActiveDesktopTable
                subscriptions={paginatedActive}
                selectedIds={selectedIds}
                lastClickedId={lastClickedId}
                onToggleRow={toggleRow}
                bindItem={bindItem}
                insertBeforeId={null}
                insertAfterLast={false}
                onUnsubscribe={(sub) => requestUnsubscribe([sub.id])}
                onBriefing={(sub) => openBriefing([sub])}
                resolveBriefing={resolveBriefingForSub}
                onViewLastBriefing={setViewingBriefing}
                onViewLastEmail={setSelectedEmailSub}
              />
              <ActiveMobileCards
                subscriptions={paginatedActive}
                selectedIds={selectedIds}
                lastClickedId={lastClickedId}
                onToggleRow={toggleRow}
                bindItem={bindItem}
                insertBeforeId={null}
                insertAfterLast={false}
                onUnsubscribe={(sub) => requestUnsubscribe([sub.id])}
                onBriefing={(sub) => openBriefing([sub])}
                resolveBriefing={resolveBriefingForSub}
                onViewLastBriefing={setViewingBriefing}
                onViewLastEmail={setSelectedEmailSub}
              />
              <PipelinePaginationFooter
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalItems={filteredActive.length}
                onPageChange={changePage}
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="archive" className="relative z-0 mt-0 space-y-3 px-[7px]">
          {archive.length === 0 ? (
            <EmptyState
              title="Archive is empty"
              body="Unsubscribed senders appear here so you can purge past mail later."
            />
          ) : filteredArchive.length === 0 ? (
            <EmptyState
              title="No matching archived senders"
              body="Try lowering the noise filter or clearing search filters."
            />
          ) : (
            <>
              <ArchiveDesktopTable
                entries={paginatedArchive}
                cleanupPendingKey={cleanupPending}
                pending={pending || deleteRecordPending}
                onCleanup={runBatchCleanup}
                onDeleteRecord={setDeleteRecordTarget}
              />
              <ArchiveMobileCards
                entries={paginatedArchive}
                cleanupPendingKey={cleanupPending}
                pending={pending || deleteRecordPending}
                onCleanup={runBatchCleanup}
                onDeleteRecord={setDeleteRecordTarget}
              />
              <PipelinePaginationFooter
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalItems={filteredArchive.length}
                onPageChange={changePage}
              />
            </>
          )}
        </TabsContent>
        </CommandDeckFrame>
      </Tabs>

      {activeTab === "active" ? (
        <BulkActionsWithClassifying
          selectedCount={selectedIds.length}
          onCancel={clearSelection}
          trailing={
            <button
              type="button"
              disabled={pending || briefingPending || deletePending}
              onClick={() => requestUnsubscribe(selectedIds)}
              className={BULK_ACTION_BTN_CLASSNAME}
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UserRoundMinus className="h-3.5 w-3.5" />
              )}
              Unsubscribe
              <BulkActionCount count={selectedIds.length} />
            </button>
          }
        >
          <BulkActionSection
            labelText="Snapshot"
            label={
              <SnapshotIcon
                width={14}
                height={14}
                className="text-[#e4f7f3]/60"
              />
            }
          >
            <button
              type="button"
              disabled={pending || briefingPending || deletePending}
              onClick={() => openBriefing(selectedSubscriptions)}
              className={BULK_ACTION_BTN_CLASSNAME}
            >
              {briefingPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              Send
              <BulkActionCount count={selectedIds.length} />
            </button>

            {selectedWithBriefingIds.length > 0 ? (
              <>
                <BulkActionSeparator />
                <button
                  type="button"
                  disabled={pending || briefingPending || deletePending}
                  onClick={() =>
                    void deleteBriefingsForSubscriptions(
                      selectedWithBriefingIds
                    )
                  }
                  className={BULK_ACTION_DISMISS_BTN_CLASSNAME}
                >
                  {deletePending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Delete
                  <BulkActionCount
                    count={selectedWithBriefingIds.length}
                    className={BULK_ACTION_COUNT_DISMISS_CLASSNAME}
                  />
                </button>
              </>
            ) : null}
          </BulkActionSection>
        </BulkActionsWithClassifying>
      ) : null}

      <SnapshotDialog
        open={briefingOpen}
        onOpenChange={setBriefingOpen}
        senders={briefingTargets}
        pending={briefingPending}
        onGenerate={(range) => void runBriefingDigest(range)}
      />

      <EmailPreviewDialog
        open={Boolean(selectedEmailSub)}
        onOpenChange={(open) => {
          if (!open) setSelectedEmailSub(null);
        }}
        senderName={selectedEmailSub?.senderName ?? null}
        senderEmail={selectedEmailSub?.senderEmail ?? ""}
      />

      <SnapshotPreviewDialog
        viewingBriefing={viewingBriefing}
        onClose={() => setViewingBriefing(null)}
        deletePending={deletePending}
        onDelete={(briefing) => {
          void deleteBriefingsForSubscriptions([briefing.subscriptionId]);
        }}
        briefingPending={briefingPending}
        onNewBriefing={openBriefingFromViewing}
        briefingPreviewLoading={briefingPreviewLoading}
        onIframeLoad={() => setBriefingPreviewLoading(false)}
        active={active}
      />

      <UnsubscribeCleanupDialog
        open={unsubscribeDialogOpen}
        onClose={closeUnsubscribeDialog}
        pending={pending}
        batchConfirmOpen={batchConfirmOpen}
        selectedIds={selectedIds}
        selectedSubscriptions={selectedSubscriptions}
        selected={selected}
        cleanupChoice={cleanupChoice}
        onCleanupChoiceChange={setCleanupChoice}
        onConfirm={() => runUnsubscribe(cleanupChoice)}
        error={error}
      />

      <ConfirmActionDialog
        open={Boolean(deleteRecordTarget)}
        onOpenChange={(open) => {
          if (!open && !deleteRecordPending) setDeleteRecordTarget(null);
        }}
        title="Deleting record for:"
        primary={deleteRecordTarget?.senderEmail ?? "sender"}
        secondary={deleteRecordTarget?.senderName ?? null}
        logoSrc={
          deleteRecordTarget
            ? senderLogoSrc(deleteRecordTarget.senderEmail)
            : null
        }
        logoName={
          deleteRecordTarget?.senderName ??
          deleteRecordTarget?.senderEmail ??
          "sender"
        }
        description="Past history for this sender will be deleted."
        emphasis="Are you sure? This can't be undone."
        confirmLabel="Delete"
        pending={deleteRecordPending}
        onConfirm={runDeleteUnsubscribedRecord}
      />
    </div>
  );
}

