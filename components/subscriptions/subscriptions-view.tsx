"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { Subscription, SubscriptionHistory } from "@prisma/client";
import {
  BadgeInfo,
  CirclePlus,
  DatabaseX,
  Eye,
  Loader2,
  History,
  Mail,
  Summary,
  Trash2,
  UserRoundMinus,
} from "lucide-react";
import { toast } from "sonner";

import { SyncControls } from "@/components/opportunities/sync-controls";
import { BriefingDialog } from "@/components/subscriptions/briefing-dialog";
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
import { ActionDialogShell } from "@/components/ui/action-dialog-shell";
import {
  BULK_ACTION_BTN_CLASSNAME,
  BULK_ACTION_COUNT_DESTRUCTIVE_CLASSNAME,
  BULK_ACTION_DESTRUCTIVE_BTN_CLASSNAME,
  BulkActionCount,
  BulkActionDot,
  BulkActionSection,
  BulkActionsFlyout,
} from "@/components/ui/bulk-actions-flyout";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { RowMenuTrigger } from "@/components/ui/row-menu-trigger";
import { CompanyLogo } from "@/components/ui/company-logo";
import { DialogIdentityLogoStack } from "@/components/ui/dialog-identity-header";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PipelinePaginationFooter } from "@/components/ui/pipeline-pagination";
import {
  tabRailRowClassName,
  TabCountBadge,
  useTabRailClasses,
} from "@/components/ui/segmented-tabs";
import { SCORE_PERCENT_CLASSNAME } from "@/components/ui/score-percent";
import { selectCheckboxClassName } from "@/components/ui/select-checkbox";
import { useLastClickedId } from "@/components/ui/use-last-clicked-id";
import {
  getSelectionGroupEdges,
  selectHighlightGroupClassName,
  type SelectionGroupEdges,
} from "@/components/ui/select-highlight";
import {
  PRIMARY_ACTION_BTN_CLASSNAME,
  PRIMARY_ACTION_BTN_MUTED_CLASSNAME,
  PRIMARY_DESTRUCTIVE_ACTION_BTN_CLASSNAME,
} from "@/components/ui/primary-action-btn";
import {
  SECONDARY_ACTION_BTN_CLASSNAME,
  SECONDARY_ACTION_BTN_MUTED_CLASSNAME,
  SECONDARY_DESTRUCTIVE_ACTION_BTN_CLASSNAME,
} from "@/components/ui/secondary-action-btn";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCardListGestures } from "@/hooks/use-card-list-gestures";
import { usePagination } from "@/hooks/use-pagination";
import {
  mergeFilteredOrderIntoCustom,
  orderItemsByIds,
} from "@/lib/dnd/reorder";
import { faviconUrlForDomain, getCleanDomain } from "@/lib/domain";
import { formatDistanceToNow } from "@/lib/format-distance";
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
  persistCustomOrder,
  readClutterThreshold,
  readCustomOrder,
} from "@/lib/subscriptions/preferences";
import { runSubscriptionMove } from "@/lib/subscriptions/run-subscription-move";
import { cn } from "@/lib/utils";
import type { CleanupAction } from "@/lib/unsubscribe";

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

function senderLogoSrc(email: string): string | null {
  const domain = getCleanDomain(email);
  return domain ? faviconUrlForDomain(domain) : null;
}

type ArchiveEntry = {
  key: string;
  senderEmail: string;
  senderName: string | null;
  emailCount: number | null;
  lastReceivedAt: Date | null;
  subscriptionId: string | null;
  source: "subscription" | "history";
};

export type LatestBriefingProp = {
  id: string;
  subject?: string | null;
  htmlPreview: string;
  generatedAt: string;
  senderEmails: string[];
  subscriptionIds: string[];
};

type ResolvedBriefing = LatestBriefingProp & {
  subscriptionId: string;
  source: "db" | "local";
};

type SubscriptionsViewProps = {
  accountId: string;
  subscriptions: Subscription[];
  history: SubscriptionHistory[];
  defaultCleanup: CleanupAction;
  latestBriefing?: LatestBriefingProp | null;
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
  defaultCleanup,
  latestBriefing = null,
}: SubscriptionsViewProps) {
  const router = useRouter();
  const {
    listClassName: segmentedTabsListClassName,
    triggerClassName: segmentedTabsTriggerClassName,
  } = useTabRailClasses();
  const [activeTab, setActiveTab] = useState<SubscriptionTab>("active");
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
    useState<CleanupAction>(defaultCleanup);
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
  const [customOrder, setCustomOrder] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const suppressTabChangeRef = useRef(false);

  // Hydrate after mount to avoid SSR/localStorage mismatches.
  useEffect(() => {
    setLocalBriefings(listLocalBriefings(accountId));
    const stored = readClutterThreshold(accountId);
    if (stored != null) {
      setClutterThresholdState(stored);
    }
    setCustomOrder(readCustomOrder(accountId));
  }, [accountId]);

  useEffect(() => {
    if (unsubscribeDialogOpen) {
      setCleanupChoice(defaultCleanup);
      setError(null);
    }
  }, [unsubscribeDialogOpen, defaultCleanup]);

  function setClutterThreshold(value: number) {
    const next = Math.max(0, Math.min(100, Math.round(value)));
    setClutterThresholdState(next);
    persistClutterThreshold(accountId, next);
  }

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    setSelectionMode(false);
  }, []);

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

  const active = useMemo(
    () =>
      subscriptions.filter(
        (s) => s.status === "ACTIVE" || s.status === "FAILED"
      ),
    [subscriptions]
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
      const clutter =
        typeof sub.clutterScore === "number" && sub.clutterScore > 0
          ? sub.clutterScore
          : subscriptionClutterScore(sub);
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
  const { lastClickedId, markLastClicked } = useLastClickedId(
    selectedIds,
    filteredActiveIds
  );

  useEffect(() => {
    const visibleIds = new Set(filteredActiveIds);
    setSelectedIds((prev) => {
      const next = prev.filter((id) => visibleIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [filteredActiveIds]);

  const isAllSelected =
    filteredActive.length > 0 &&
    filteredActive.every((s) => selectedIds.includes(s.id));

  function toggleSelectAll() {
    markLastClicked(null);
    if (isAllSelected) {
      clearSelection();
      return;
    }
    setSelectionMode(true);
    setSelectedIds(filteredActive.map((s) => s.id));
  }

  function toggleRow(id: string) {
    markLastClicked(id);
    setSelectedIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((i) => i !== id)
        : [...prev, id];
      // Empty selection leaves multi-select entirely so the next long-press
      // re-enters select mode instead of attempting a Custom-only drag.
      setSelectionMode(next.length > 0);
      return next;
    });
  }

  // Belt-and-suspenders: never stay in selectionMode with zero ids.
  useEffect(() => {
    if (selectedIds.length === 0 && selectionMode) {
      setSelectionMode(false);
    }
  }, [selectedIds.length, selectionMode]);

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

  const selectedSubscriptions = useMemo(
    () => active.filter((s) => selectedIds.includes(s.id)),
    [active, selectedIds]
  );

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
      toast.error("Those senders are no longer in Active subscriptions");
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

  const handleReorder = useCallback(
    (nextFullIds: string[], _movedIds: string[]) => {
      const merged = mergeFilteredOrderIntoCustom(
        customOrder,
        filteredActiveIds,
        nextFullIds
      );
      setCustomOrder(merged);
      persistCustomOrder(accountId, merged);
      // Keep multi-select after reorder; only flip the sort label.
      if (sortOption !== "custom") {
        setSortOption("custom");
      }
    },
    [accountId, customOrder, filteredActiveIds, sortOption]
  );

  const handleDropZone = useCallback(
    (zoneId: string, movedIds: string[]) => {
      const resolved = resolveSubscriptionMove(
        "active",
        zoneId as "active" | "archive"
      );
      if (resolved.kind !== "unsubscribe" || movedIds.length === 0) return;
      // Prevent the Unsubscribed tab trigger from stealing this pointer-up as a click.
      suppressTabChangeRef.current = true;
      window.setTimeout(() => {
        suppressTabChangeRef.current = false;
      }, 0);
      requestUnsubscribe(movedIds);
    },
    // requestUnsubscribe closes over `active` — refresh when list changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
    [active]
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
    // Edge flips keep multi-select; toolbar/footer page changes clear it.
    onPageChange: setCurrentPage,
    onReorder: handleReorder,
    onDropZone: handleDropZone,
    onReorderBlocked: () => {
      toast.message("Switch to Custom sort to rearrange", {
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
          clearSelection();
        }}
        className="w-full"
      >
        <div className={tabRailRowClassName}>
          <div className="flex items-center gap-1.5">
            <TabsList className={segmentedTabsListClassName}>
              <TabsTrigger
                value="active"
                className={segmentedTabsTriggerClassName}
              >
                <span>Active Subscriptions</span>
                <TabCountBadge count={active.length} />
              </TabsTrigger>
              <TabsTrigger
                value="archive"
                data-dnd-drop-zone="archive"
                className={cn(
                  segmentedTabsTriggerClassName,
                  drag?.dropZone === "archive" &&
                    "ring-2 ring-[#c21f10]/70 ring-offset-2 ring-offset-background"
                )}
              >
                <span>Unsubscribed</span>
                <TabCountBadge count={archive.length} />
              </TabsTrigger>
            </TabsList>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex shrink-0 rounded-full p-0.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    aria-label="Tab description"
                  >
                    <BadgeInfo className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-left">
                  {subscriptionTabDescriptions[activeTab]}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <SyncControls accountId={accountId} />
          </div>
        </div>

        <SubscriptionsToolbar
          totalCount={toolbarTotal}
          visibleCount={toolbarVisible}
          selectedCount={
            activeTab === "active" ? selectedIds.length : 0
          }
          isAllSelected={activeTab === "active" ? isAllSelected : false}
          onToggleSelectAll={
            activeTab === "active" ? toggleSelectAll : () => undefined
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
          hasActiveTransientFilters={hasActiveTransientFilters}
          onResetTransientFilters={handleResetTransientFilters}
        />

        <TabsContent value="active" className="mt-0 space-y-3">
          {active.length === 0 ? (
            <EmptyState
              title="No active subscriptions"
              body="MailPilot will capture senders that advertise List-Unsubscribe headers."
            />
          ) : filteredActive.length === 0 ? (
            <EmptyState
              title="No matching subscriptions"
              body="Try lowering the clutter threshold or clearing search filters."
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

        <TabsContent value="archive" className="mt-0 space-y-3">
          {archive.length === 0 ? (
            <EmptyState
              title="Archive is empty"
              body="Unsubscribed senders appear here so you can purge past mail later."
            />
          ) : filteredArchive.length === 0 ? (
            <EmptyState
              title="No matching archived senders"
              body="Try lowering the clutter threshold or clearing search filters."
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
      </Tabs>

      {activeTab === "active" ? (
        <BulkActionsFlyout
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
              <Summary
                className="h-4 w-4 text-[hsl(var(--sidebar-foreground))]/65"
                aria-hidden
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
              Create
              <BulkActionCount count={selectedIds.length} />
            </button>

            {selectedWithBriefingIds.length > 0 ? (
              <>
                <BulkActionDot />
                <button
                  type="button"
                  disabled={pending || briefingPending || deletePending}
                  onClick={() =>
                    void deleteBriefingsForSubscriptions(
                      selectedWithBriefingIds
                    )
                  }
                  className={BULK_ACTION_DESTRUCTIVE_BTN_CLASSNAME}
                >
                  {deletePending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Delete
                  <BulkActionCount
                    count={selectedWithBriefingIds.length}
                    className={BULK_ACTION_COUNT_DESTRUCTIVE_CLASSNAME}
                  />
                </button>
              </>
            ) : null}
          </BulkActionSection>
        </BulkActionsFlyout>
      ) : null}

      <BriefingDialog
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

      <ActionDialogShell
        open={Boolean(viewingBriefing)}
        onOpenChange={(open) => {
          if (!open) setViewingBriefing(null);
        }}
        pending={deletePending}
        size="xl"
        identity={(() => {
          if (!viewingBriefing) {
            return {
              title: "Viewing snap for:",
              primary: "No snapshot available",
            };
          }
          const emails = viewingBriefing.senderEmails;
          const firstEmail = emails[0] ?? "";
          const firstName =
            active.find(
              (s) =>
                s.senderEmail.toLowerCase() === firstEmail.toLowerCase()
            )?.senderName ?? null;
          const multi = emails.length > 1;
          return {
            title: "Viewing snap for:",
            primary: multi ? `${emails.length} senders` : firstEmail,
            secondary: multi
              ? new Date(viewingBriefing.generatedAt).toLocaleString()
              : firstName,
            logo: (
              <DialogIdentityLogoStack
                size="lg"
                items={emails.map((email) => ({
                  key: email,
                  src: senderLogoSrc(email),
                  name:
                    active.find(
                      (s) =>
                        s.senderEmail.toLowerCase() === email.toLowerCase()
                    )?.senderName ?? email,
                }))}
              />
            ),
          };
        })()}
        cancelLabel="Close"
        secondaryAction={
          <button
            type="button"
            disabled={deletePending || !viewingBriefing}
            onClick={() => {
              if (!viewingBriefing) return;
              void deleteBriefingsForSubscriptions([
                viewingBriefing.subscriptionId,
              ]);
            }}
            className={cn(
              SECONDARY_DESTRUCTIVE_ACTION_BTN_CLASSNAME,
              "h-9 px-3.5"
            )}
          >
            {deletePending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            <span>Delete</span>
          </button>
        }
        primaryAction={
          <button
            type="button"
            disabled={!viewingBriefing || briefingPending}
            onClick={openBriefingFromViewing}
            className={cn(PRIMARY_ACTION_BTN_CLASSNAME, "h-9 px-3.5")}
          >
            <CirclePlus className="h-3.5 w-3.5" />
            <span>New</span>
          </button>
        }
      >
        {viewingBriefing ? (
          <PreviewLoadChrome
            loading={briefingPreviewLoading}
            subject={
              viewingBriefing.subject?.trim() ||
              (viewingBriefing.senderEmails.length > 1
                ? `Snapshot · ${viewingBriefing.senderEmails.length} senders`
                : `Snapshot · ${viewingBriefing.senderEmails[0] ?? "sender"}`)
            }
            dateLabel={formatPreviewDisplayDate(viewingBriefing.generatedAt)}
            loadingMessage="Loading snapshot…"
          >
            <div className="max-w-full overflow-x-hidden rounded-lg border border-border/60 bg-muted/20">
              <iframe
                key={viewingBriefing.id}
                title="Snapshot preview"
                className="h-[65vh] max-h-[70vh] w-full max-w-full border-0 bg-slate-950"
                srcDoc={constrainBriefingPreviewHtml(viewingBriefing.htmlPreview)}
                // allow-same-origin so inlined @font-face / relative assets can apply
                sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                onLoad={() => setBriefingPreviewLoading(false)}
              />
            </div>
          </PreviewLoadChrome>
        ) : null}
      </ActionDialogShell>

      <ActionDialogShell
        open={unsubscribeDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeUnsubscribeDialog();
        }}
        pending={pending}
        size="md"
        identity={{
          title: "Unsubscribing from:",
          primary: batchConfirmOpen
            ? `${selectedIds.length} selected sender${selectedIds.length === 1 ? "" : "s"}`
            : (selected?.senderEmail ?? "sender"),
          secondary: batchConfirmOpen ? null : (selected?.senderName ?? null),
          logo: batchConfirmOpen ? (
            <DialogIdentityLogoStack
              size="lg"
              items={selectedSubscriptions.map((sub) => ({
                key: sub.id,
                src: senderLogoSrc(sub.senderEmail),
                name: sub.senderName ?? sub.senderEmail,
              }))}
            />
          ) : selected ? (
            <CompanyLogo
              src={senderLogoSrc(selected.senderEmail)}
              name={selected.senderName ?? selected.senderEmail}
              size="lg"
            />
          ) : undefined,
        }}
        onCancel={closeUnsubscribeDialog}
        primaryAction={
          <button
            type="button"
            disabled={pending}
            onClick={() => runUnsubscribe(cleanupChoice)}
            className={cn(PRIMARY_ACTION_BTN_CLASSNAME, "h-9 px-3.5")}
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <UserRoundMinus className="h-3.5 w-3.5" />
            )}
            <span>{pending ? "Working…" : "Unsubscribe"}</span>
          </button>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {batchConfirmOpen
              ? "Future emails from these senders will be blocked."
              : "Future emails from this sender will be blocked."}
          </p>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              What would you like to do with past emails?
            </p>
            <div
              className="overflow-hidden rounded-lg border border-border/60 bg-muted/20"
              role="radiogroup"
              aria-label="Past email cleanup"
            >
              {UNSUBSCRIBE_OPTIONS.map((option, index) => {
                const selectedOption = cleanupChoice === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selectedOption}
                    disabled={pending}
                    onClick={() => setCleanupChoice(option.value)}
                    className={cn(
                      "flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors disabled:opacity-50",
                      index > 0 && "border-t border-border/50",
                      selectedOption
                        ? "bg-background"
                        : "hover:bg-background/70"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                        selectedOption
                          ? "border-[#1ab5af] bg-[#1ab5af]"
                          : "border-muted-foreground/40"
                      )}
                      aria-hidden
                    >
                      {selectedOption ? (
                        <span className="size-1.5 rounded-full bg-white" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">
                        {option.label}
                      </span>
                      {option.description ? (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </ActionDialogShell>

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

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function IconStatBadge({
  icon,
  value,
  valueClassName,
  className,
  width,
  truncateValue = false,
  title,
  selected = false,
}: {
  icon?: ReactNode;
  value: string;
  valueClassName?: string;
  className?: string;
  /** Fixed width so the same badge type aligns across rows. */
  width?: string;
  /** Ellipsis overflow when the value exceeds the pill width (Last received). */
  truncateValue?: boolean;
  title?: string;
  /** Let row/card select fill show through opaque pill surfaces. */
  selected?: boolean;
}) {
  const badge = (
    <div
      className={cn(
        "inline-flex h-[30px] shrink-0 cursor-default items-stretch overflow-hidden rounded-md border border-border/40",
        width ? null : "min-w-[54px]",
        className
      )}
      style={width ? { width } : undefined}
    >
      {icon ? (
        <div
          className={cn(
            "flex w-7 shrink-0 items-center justify-center border-r border-border/40 text-muted-foreground/75",
            selected ? "bg-muted/50" : "bg-muted/40"
          )}
        >
          {icon}
        </div>
      ) : null}
      <div
        className={cn(
          "flex min-w-0 flex-1 items-center justify-center px-1.5",
          SCORE_PERCENT_CLASSNAME,
          valueClassName ?? "bg-card text-foreground",
          selected && SELECT_MUTED_PILL_VALUE_CLASSNAME
        )}
      >
        <span
          className={cn(truncateValue && "w-full min-w-0 truncate text-center")}
        >
          {value}
        </span>
      </div>
    </div>
  );

  if (!title) return badge;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="top">{title}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function formatLastReceivedValue(
  date: Date | string | null | undefined
): string {
  if (!date || !Number.isFinite(new Date(date).getTime())) return "—";
  return formatDistanceToNow(new Date(date), { addSuffix: false });
}

type MetricColumnWidths = {
  clutter: string;
  emails: string;
  received: string;
};

/** Width each badge type to the widest value on the current page for vertical alignment. */
function computeMetricColumnWidths(
  items: { emailCount: number }[]
): MetricColumnWidths {
  let maxEmailChars = 1;
  for (const item of items) {
    maxEmailChars = Math.max(maxEmailChars, String(item.emailCount).length);
  }
  // Value-only clutter; icon rail (~2.5ch) + value for the others. Received capped.
  const clutterCh = 4.5;
  const emailsCh = Math.max(6.5, maxEmailChars + 3.5);
  // Fits short labels like "11mo" (+ icon rail); no "ago" suffix. Longer values ellipsis.
  const receivedCh = 7.5;
  return {
    clutter: `${clutterCh}ch`,
    emails: `${emailsCh}ch`,
    received: `${receivedCh}ch`,
  };
}

function ClutterStatBadge({
  score,
  width,
  selected = false,
}: {
  score: number;
  width?: string;
  selected?: boolean;
}) {
  const tier = clutterScoreTier(score);
  return (
    <IconStatBadge
      title="Clutter score"
      value={`${score}%`}
      valueClassName={
        selected
          ? SELECT_MUTED_PILL_VALUE_CLASSNAME
          : CLUTTER_VALUE_CLASSES[tier]
      }
      className="border-transparent"
      width={width}
      selected={selected}
    />
  );
}

function EmailsStatBadge({
  count,
  width,
  selected = false,
}: {
  count: number;
  width?: string;
  selected?: boolean;
}) {
  return (
    <IconStatBadge
      title="Email volume"
      icon={<Mail className="size-3.5" aria-hidden />}
      value={String(count)}
      valueClassName="bg-card text-muted-foreground"
      width={width}
      selected={selected}
    />
  );
}

function LastReceivedStatBadge({
  date,
  width,
  selected = false,
}: {
  date: Date | string | null | undefined;
  width?: string;
  selected?: boolean;
}) {
  const value = formatLastReceivedValue(date);
  return (
    <IconStatBadge
      title="Last received"
      icon={<History className="size-3.5" aria-hidden />}
      value={value}
      valueClassName="bg-card font-medium tracking-normal text-muted-foreground/70"
      width={width ?? "9.5ch"}
      truncateValue
      selected={selected}
    />
  );
}

/** Same gap as Create Snapshot ↔ Unsubscribe (`gap-2.5`). */
const METRICS_GAP_CLASS = "gap-2.5";

/** Job Radar card hover — border lift + shadow (mobile cards). */
const SUBSCRIPTION_CARD_SURFACE_CLASS =
  "rounded-xl border border-border/80 bg-card p-4 shadow-md transition-all duration-200 hover:border-border hover:shadow-lg";

/** Desktop table row hover — same family, background tint instead of shadow. */
const SUBSCRIPTION_ROW_HOVER_CLASS =
  "transition-colors duration-200 hover:bg-muted/30";

function AnalyticsMetrics({
  clutter,
  emailCount,
  lastReceivedAt,
  widths,
  selected = false,
}: {
  clutter: number;
  emailCount: number;
  lastReceivedAt: Date | string | null | undefined;
  widths?: MetricColumnWidths;
  selected?: boolean;
}) {
  return (
    <div className={cn("flex items-center", METRICS_GAP_CLASS)}>
      <LastReceivedStatBadge
        date={lastReceivedAt}
        width={widths?.received}
        selected={selected}
      />
      <EmailsStatBadge
        count={emailCount}
        width={widths?.emails}
        selected={selected}
      />
      <ClutterStatBadge
        score={clutter}
        width={widths?.clutter}
        selected={selected}
      />
    </div>
  );
}

function LastBriefingIconButton({
  briefing,
  onView,
  disabled = false,
}: {
  briefing: ResolvedBriefing;
  onView: (briefing: ResolvedBriefing) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onView(briefing)}
      title={
        briefing.source === "db"
          ? "View snap (cloud)"
          : "View snap (this device)"
      }
      aria-label="View snap"
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold transition-colors",
        disabled
          ? "pointer-events-none text-muted-foreground"
          : "text-teal-700 hover:bg-teal-700/10 dark:text-teal-400"
      )}
    >
      <Eye className="size-3" />
      View Snapshot
    </button>
  );
}

function SubscriptionRowActions({
  sub,
  onBriefing,
  onUnsubscribe,
  onViewLastEmail,
  disabled = false,
}: {
  sub: Subscription;
  onBriefing: (sub: Subscription) => void;
  onUnsubscribe: (sub: Subscription) => void;
  onViewLastEmail: (sub: Subscription) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onBriefing(sub)}
        className={
          disabled
            ? SECONDARY_ACTION_BTN_MUTED_CLASSNAME
            : SECONDARY_ACTION_BTN_CLASSNAME
        }
      >
        <Summary className="h-3.5 w-3.5" />
        <span>Create Snapshot</span>
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onUnsubscribe(sub)}
        className={
          disabled
            ? PRIMARY_ACTION_BTN_MUTED_CLASSNAME
            : PRIMARY_ACTION_BTN_CLASSNAME
        }
      >
        <UserRoundMinus className="h-3.5 w-3.5" />
        <span>Unsubscribe</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <RowMenuTrigger
            label="Subscription actions"
            disabled={disabled}
            className={
              disabled
                ? "bg-muted text-muted-foreground hover:bg-muted hover:text-muted-foreground"
                : undefined
            }
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            className="cursor-pointer gap-2"
            disabled={disabled}
            onClick={() => onViewLastEmail(sub)}
          >
            <Mail className="size-4 text-muted-foreground" />
            <span>View last received email</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/** Desktop row: three zones separated by subtle vertical dividers. */
type BindItem = ReturnType<typeof useCardListGestures>["bindItem"];

function InsertMarker({ className }: { className?: string }) {
  return (
    <div
      className={cn("pointer-events-none h-0.5 w-full bg-[#1ab5af]", className)}
      aria-hidden
    />
  );
}

function SubscriptionDesktopRow({
  sub,
  selected,
  selectionGroup,
  selectionStartRadius,
  selectionEndRadius,
  lastClicked,
  onToggleRow,
  itemProps,
  showInsertBefore,
  clutter,
  briefing,
  metricWidths,
  onBriefing,
  onUnsubscribe,
  onViewLastBriefing,
  onViewLastEmail,
}: {
  sub: Subscription;
  selected: boolean;
  selectionGroup: SelectionGroupEdges;
  /** `xl` when this row is the list’s top edge so it matches the card shell. */
  selectionStartRadius: "sm" | "xl";
  /** `xl` when this row is the list’s bottom edge so it matches the card shell. */
  selectionEndRadius: "sm" | "xl";
  lastClicked: boolean;
  onToggleRow: (id: string) => void;
  itemProps: ReturnType<BindItem>;
  showInsertBefore: boolean;
  clutter: number;
  briefing: ResolvedBriefing | null;
  metricWidths: MetricColumnWidths;
  onBriefing: (sub: Subscription) => void;
  onUnsubscribe: (sub: Subscription) => void;
  onViewLastBriefing: (briefing: ResolvedBriefing) => void;
  onViewLastEmail: (sub: Subscription) => void;
}) {
  const { style: itemStyle, ...itemRest } = itemProps;
  return (
    <div
      {...itemRest}
      style={itemStyle}
      className={cn(
        "relative flex h-16 cursor-default items-center pl-3 pr-4 select-none",
        SUBSCRIPTION_ROW_HOVER_CLASS,
        selected
          ? selectHighlightGroupClassName(selectionGroup, {
              startRadius: selectionStartRadius,
              endRadius: selectionEndRadius,
            })
          : "border-b border-[hsl(220_16%_88%)] last:border-b-0"
      )}
    >
      {showInsertBefore ? (
        <div className="absolute inset-x-0 top-0 z-10">
          <InsertMarker />
        </div>
      ) : null}
      {/* Zone 1: Contact & Identity — grows so the first divider sits closer to metrics */}
      <div className="flex min-w-0 flex-1 items-center gap-3 border-r border-border/40 pr-5">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleRow(sub.id)}
          className={selectCheckboxClassName({
            lastClicked,
            className: "m-0 h-3.5 w-3.5 shrink-0 cursor-pointer",
          })}
          aria-label={`Select ${sub.senderEmail}`}
        />
        <CompanyLogo
          src={senderLogoSrc(sub.senderEmail)}
          name={sub.senderName ?? sub.senderEmail}
          size="md"
        />
        <div
          className={cn("min-w-0", selected && "text-muted-foreground")}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <p
              className={cn(
                "truncate text-sm font-medium",
                selected ? "text-muted-foreground" : "text-foreground"
              )}
            >
              {sub.senderName ?? "—"}
            </p>
            {briefing ? (
              <LastBriefingIconButton
                briefing={briefing}
                onView={onViewLastBriefing}
                disabled={selected}
              />
            ) : null}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {sub.senderEmail}
          </p>
        </div>
      </div>

      {/* Zone 2: Analytics — shrink-wrapped to the pills (no flex grow) */}
      <div
        className={cn(
          "flex shrink-0 items-center border-r border-border/40 px-3",
          METRICS_GAP_CLASS
        )}
      >
        <LastReceivedStatBadge
          date={sub.lastReceivedAt}
          width={metricWidths.received}
          selected={selected}
        />
        <EmailsStatBadge
          count={sub.emailCount}
          width={metricWidths.emails}
          selected={selected}
        />
        <ClutterStatBadge
          score={clutter}
          width={metricWidths.clutter}
          selected={selected}
        />
      </div>

      {/* Zone 3: Actions */}
      <div className="-mr-4 flex h-16 shrink-0 items-center justify-end gap-2.5 self-stretch bg-muted/[0.12] py-0 pl-4 pr-1">
        <SubscriptionRowActions
          sub={sub}
          onBriefing={onBriefing}
          onUnsubscribe={onUnsubscribe}
          onViewLastEmail={onViewLastEmail}
          disabled={selected}
        />
      </div>
    </div>
  );
}

function clutterForSub(sub: Subscription): number {
  if (typeof sub.clutterScore === "number" && sub.clutterScore > 0) {
    return sub.clutterScore;
  }
  return subscriptionClutterScore(sub);
}

function ActiveDesktopTable({
  subscriptions,
  selectedIds,
  lastClickedId,
  onToggleRow,
  bindItem,
  insertBeforeId,
  insertAfterLast,
  onUnsubscribe,
  onBriefing,
  resolveBriefing,
  onViewLastBriefing,
  onViewLastEmail,
}: {
  subscriptions: Subscription[];
  selectedIds: string[];
  lastClickedId: string | null;
  onToggleRow: (id: string) => void;
  bindItem: BindItem;
  insertBeforeId: string | null;
  insertAfterLast: boolean;
  onUnsubscribe: (sub: Subscription) => void;
  onBriefing: (sub: Subscription) => void;
  resolveBriefing: (sub: Subscription) => ResolvedBriefing | null;
  onViewLastBriefing: (briefing: ResolvedBriefing) => void;
  onViewLastEmail: (sub: Subscription) => void;
}) {
  const metricWidths = useMemo(
    () => computeMetricColumnWidths(subscriptions),
    [subscriptions]
  );

  const orderedIds = useMemo(
    () => subscriptions.map((sub) => sub.id),
    [subscriptions]
  );

  const firstId = subscriptions[0]?.id;
  const lastId = subscriptions[subscriptions.length - 1]?.id;
  const selectionTouchesShell =
    (firstId != null && selectedIds.includes(firstId)) ||
    (lastId != null && selectedIds.includes(lastId));

  return (
    <div
      data-dnd-list
      className={cn(
        "relative hidden w-full overflow-hidden rounded-xl bg-card shadow-md transition-shadow duration-200 hover:shadow-lg md:block",
        // Drop the shell stroke when selection paints the list edge — avoids a
        // double border that makes the teal look inset/off at the corners.
        selectionTouchesShell ? "border-0" : "border border-border/80"
      )}
    >
      {subscriptions.map((sub, index) => {
        const clutter = clutterForSub(sub);
        const briefing = resolveBriefing(sub);
        const selectionGroup = getSelectionGroupEdges(
          orderedIds,
          selectedIds,
          index
        );
        return (
          <SubscriptionDesktopRow
            key={sub.id}
            sub={sub}
            selected={selectionGroup.selected}
            selectionGroup={selectionGroup}
            selectionStartRadius={index === 0 ? "xl" : "sm"}
            selectionEndRadius={
              index === subscriptions.length - 1 ? "xl" : "sm"
            }
            lastClicked={lastClickedId === sub.id}
            onToggleRow={onToggleRow}
            itemProps={bindItem(sub.id)}
            showInsertBefore={insertBeforeId === sub.id}
            clutter={clutter}
            briefing={briefing}
            metricWidths={metricWidths}
            onBriefing={onBriefing}
            onUnsubscribe={onUnsubscribe}
            onViewLastBriefing={onViewLastBriefing}
            onViewLastEmail={onViewLastEmail}
          />
        );
      })}
      {insertAfterLast ? (
        <div className="absolute inset-x-0 bottom-0 z-10">
          <InsertMarker />
        </div>
      ) : null}
    </div>
  );
}

function ActiveMobileCards({
  subscriptions,
  selectedIds,
  lastClickedId,
  onToggleRow,
  bindItem,
  insertBeforeId,
  insertAfterLast,
  onUnsubscribe,
  onBriefing,
  resolveBriefing,
  onViewLastBriefing,
  onViewLastEmail,
}: {
  subscriptions: Subscription[];
  selectedIds: string[];
  lastClickedId: string | null;
  onToggleRow: (id: string) => void;
  bindItem: BindItem;
  insertBeforeId: string | null;
  insertAfterLast: boolean;
  onUnsubscribe: (sub: Subscription) => void;
  onBriefing: (sub: Subscription) => void;
  resolveBriefing: (sub: Subscription) => ResolvedBriefing | null;
  onViewLastBriefing: (briefing: ResolvedBriefing) => void;
  onViewLastEmail: (sub: Subscription) => void;
}) {
  const metricWidths = useMemo(
    () => computeMetricColumnWidths(subscriptions),
    [subscriptions]
  );

  const orderedIds = useMemo(
    () => subscriptions.map((sub) => sub.id),
    [subscriptions]
  );

  return (
    <ul className="md:hidden" data-dnd-list>
      {subscriptions.map((sub, index) => {
        const clutter = clutterForSub(sub);
        const briefing = resolveBriefing(sub);
        const selectionGroup = getSelectionGroupEdges(
          orderedIds,
          selectedIds,
          index
        );
        const selected = selectionGroup.selected;
        const nextSelected =
          selected && !selectionGroup.isGroupEnd;
        const itemProps = bindItem(sub.id);
        const { style: itemStyle, ...itemRest } = itemProps;
        return (
          <li
            key={sub.id}
            {...itemRest}
            style={itemStyle}
            className={cn(
              "relative select-none",
              selected
                ? cn(
                    // No default `border` — highlight stroke owns the perimeter.
                    "bg-card p-4 transition-all duration-200",
                    selectHighlightGroupClassName(selectionGroup, {
                      radius: "xl",
                    }),
                    // Collapse gaps inside a selected run so the perimeter reads as one block.
                    nextSelected ? "mb-0" : "mb-3"
                  )
                : cn(SUBSCRIPTION_CARD_SURFACE_CLASS, "mb-3")
            )}
          >
            {insertBeforeId === sub.id ? (
              <div className="absolute inset-x-2 top-0 z-10">
                <InsertMarker />
              </div>
            ) : null}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggleRow(sub.id)}
                className={selectCheckboxClassName({
                  lastClicked: lastClickedId === sub.id,
                  className: "m-0 h-3.5 w-3.5 shrink-0 cursor-pointer",
                })}
                aria-label={`Select ${sub.senderEmail}`}
              />
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <CompanyLogo
                  src={senderLogoSrc(sub.senderEmail)}
                  name={sub.senderName ?? sub.senderEmail}
                  size="md"
                />
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <p
                      className={cn(
                        "truncate text-sm font-medium",
                        selected ? "text-muted-foreground" : "text-foreground"
                      )}
                    >
                      {sub.senderName ?? sub.senderEmail}
                    </p>
                    {briefing ? (
                      <LastBriefingIconButton
                        briefing={briefing}
                        onView={onViewLastBriefing}
                        disabled={selected}
                      />
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {sub.senderEmail}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <AnalyticsMetrics
                clutter={clutter}
                emailCount={sub.emailCount}
                lastReceivedAt={sub.lastReceivedAt}
                widths={metricWidths}
                selected={selected}
              />
              <div className="-mr-1.5 flex shrink-0 items-center justify-end gap-2.5">
                <SubscriptionRowActions
                  sub={sub}
                  onBriefing={onBriefing}
                  onUnsubscribe={onUnsubscribe}
                  onViewLastEmail={onViewLastEmail}
                  disabled={selected}
                />
              </div>
            </div>
          </li>
        );
      })}
      {insertAfterLast ? (
        <li className="list-none px-2" aria-hidden>
          <InsertMarker />
        </li>
      ) : null}
    </ul>
  );
}

function clutterForArchiveEntry(entry: ArchiveEntry): number {
  return subscriptionClutterScore({
    emailCount: entry.emailCount ?? 0,
    lastReceivedAt: entry.lastReceivedAt,
  });
}

function ArchiveCleanupButton({
  pending,
  onCleanup,
}: {
  pending: boolean;
  onCleanup: () => void;
}) {
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onCleanup}
      className={PRIMARY_DESTRUCTIVE_ACTION_BTN_CLASSNAME}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Trash2 className="h-3.5 w-3.5" />
      )}
      <span>Delete Emails</span>
    </button>
  );
}

function ArchiveRowActions({
  entry,
  pending,
  onCleanup,
  onDeleteRecord,
}: {
  entry: ArchiveEntry;
  pending: boolean;
  onCleanup: (entry: ArchiveEntry) => void;
  onDeleteRecord: (entry: ArchiveEntry) => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <ArchiveCleanupButton
        pending={pending}
        onCleanup={() => onCleanup(entry)}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <RowMenuTrigger label="Archive actions" disabled={pending} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            className="cursor-pointer gap-2 text-[#c21f10] focus:bg-[#c21f10]/10 focus:text-[#c21f10] dark:text-[#fb6230] dark:focus:bg-[#fb6230]/10 dark:focus:text-[#fb6230]"
            onClick={() => onDeleteRecord(entry)}
          >
            <DatabaseX className="size-4" />
            <span>Delete Record</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ArchiveDesktopRow({
  entry,
  pending,
  metricWidths,
  onCleanup,
  onDeleteRecord,
}: {
  entry: ArchiveEntry;
  pending: boolean;
  metricWidths: MetricColumnWidths;
  onCleanup: (entry: ArchiveEntry) => void;
  onDeleteRecord: (entry: ArchiveEntry) => void;
}) {
  const clutter = clutterForArchiveEntry(entry);
  const emailCount = entry.emailCount ?? 0;

  return (
    <div
      className={cn(
        "flex h-16 items-center border-b border-[hsl(220_16%_88%)] pl-3 pr-4 last:border-b-0",
        SUBSCRIPTION_ROW_HOVER_CLASS
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 border-r border-border/40 pr-5">
        <CompanyLogo
          src={senderLogoSrc(entry.senderEmail)}
          name={entry.senderName ?? entry.senderEmail}
          size="md"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {entry.senderName ?? "—"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {entry.senderEmail}
          </p>
        </div>
      </div>

      <div
        className={cn(
          "flex shrink-0 items-center border-r border-border/40 px-3",
          METRICS_GAP_CLASS
        )}
      >
        <LastReceivedStatBadge
          date={entry.lastReceivedAt}
          width={metricWidths.received}
        />
        <EmailsStatBadge count={emailCount} width={metricWidths.emails} />
        <ClutterStatBadge score={clutter} width={metricWidths.clutter} />
      </div>

      <div className="-mr-4 flex h-16 shrink-0 items-center justify-end gap-2.5 self-stretch bg-muted/[0.12] py-0 pl-4 pr-1">
        <ArchiveRowActions
          entry={entry}
          pending={pending}
          onCleanup={onCleanup}
          onDeleteRecord={onDeleteRecord}
        />
      </div>
    </div>
  );
}

function ArchiveDesktopTable({
  entries,
  cleanupPendingKey,
  pending,
  onCleanup,
  onDeleteRecord,
}: {
  entries: ArchiveEntry[];
  cleanupPendingKey: string | null;
  pending: boolean;
  onCleanup: (entry: ArchiveEntry) => void;
  onDeleteRecord: (entry: ArchiveEntry) => void;
}) {
  const metricWidths = useMemo(
    () =>
      computeMetricColumnWidths(
        entries.map((entry) => ({ emailCount: entry.emailCount ?? 0 }))
      ),
    [entries]
  );

  return (
    <div className="hidden w-full overflow-hidden rounded-xl border border-border/80 bg-card shadow-md transition-shadow duration-200 hover:shadow-lg md:block">
      {entries.map((entry) => (
        <ArchiveDesktopRow
          key={entry.key}
          entry={entry}
          pending={cleanupPendingKey === entry.key || pending}
          metricWidths={metricWidths}
          onCleanup={onCleanup}
          onDeleteRecord={onDeleteRecord}
        />
      ))}
    </div>
  );
}

function ArchiveMobileCards({
  entries,
  cleanupPendingKey,
  pending,
  onCleanup,
  onDeleteRecord,
}: {
  entries: ArchiveEntry[];
  cleanupPendingKey: string | null;
  pending: boolean;
  onCleanup: (entry: ArchiveEntry) => void;
  onDeleteRecord: (entry: ArchiveEntry) => void;
}) {
  const metricWidths = useMemo(
    () =>
      computeMetricColumnWidths(
        entries.map((entry) => ({ emailCount: entry.emailCount ?? 0 }))
      ),
    [entries]
  );

  return (
    <ul className="space-y-3 md:hidden">
      {entries.map((entry) => {
        const clutter = clutterForArchiveEntry(entry);
        return (
          <li key={entry.key} className={SUBSCRIPTION_CARD_SURFACE_CLASS}>
            <div className="flex min-w-0 items-center gap-3">
              <CompanyLogo
                src={senderLogoSrc(entry.senderEmail)}
                name={entry.senderName ?? entry.senderEmail}
                size="md"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {entry.senderName ?? entry.senderEmail}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {entry.senderEmail}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <AnalyticsMetrics
                clutter={clutter}
                emailCount={entry.emailCount ?? 0}
                lastReceivedAt={entry.lastReceivedAt}
                widths={metricWidths}
              />
              <div className="-mr-1.5">
                <ArchiveRowActions
                  entry={entry}
                  pending={cleanupPendingKey === entry.key || pending}
                  onCleanup={onCleanup}
                  onDeleteRecord={onDeleteRecord}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
