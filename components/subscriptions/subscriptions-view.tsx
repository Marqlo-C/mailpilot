"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { Subscription, SubscriptionHistory } from "@prisma/client";
import {
  Archive,
  BadgeInfo,
  DatabaseX,
  Eye,
  Loader2,
  Mail,
  Send,
  Summary,
  Trash2,
  UserRoundMinus,
} from "lucide-react";
import { toast } from "sonner";

import {
  batchCleanupSender,
  deleteUnsubscribedRecord,
  unsubscribeSender,
} from "@/app/actions/subscriptions";
import { SyncControls } from "@/components/opportunities/sync-controls";
import { BriefingDialog } from "@/components/subscriptions/briefing-dialog";
import { EmailPreviewDialog } from "@/components/subscriptions/email-preview-dialog";
import { SubscriptionsToolbar } from "@/components/subscriptions/subscriptions-toolbar";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { RowMenuTrigger } from "@/components/ui/row-menu-trigger";
import { CompanyLogo } from "@/components/ui/company-logo";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PipelinePaginationFooter } from "@/components/ui/pipeline-pagination";
import {
  segmentedTabsListClassName,
  segmentedTabsTriggerClassName,
  TabCountBadge,
} from "@/components/ui/segmented-tabs";
import { SCORE_PERCENT_CLASSNAME } from "@/components/ui/score-percent";
import { SECONDARY_ACTION_BTN_CLASSNAME } from "@/components/ui/secondary-action-btn";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePagination } from "@/hooks/use-pagination";
import { faviconUrlForDomain, getCleanDomain } from "@/lib/domain";
import { formatDistanceToNow } from "@/lib/format-distance";
import {
  clearLocalBriefingsForSubscriptions,
  deleteLocalBriefings,
  listLocalBriefings,
  migrateDisplacedBriefingToLocal,
  type LocalBriefingRecord,
} from "@/lib/subscriptions/briefing-local";
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
import { cn } from "@/lib/utils";
import type { CleanupAction } from "@/lib/unsubscribe";

/**
 * Class literals must live in components/ so Tailwind content scan picks them up.
 * (lib/ is not in tailwind.config content — orange utilities were never emitted.)
 */
/** Bottom-value tints for stacked CLUTTER badges. */
const CLUTTER_VALUE_CLASSES: Record<ClutterScoreTier, string> = {
  high: "bg-orange-600/15 text-orange-700 dark:bg-orange-500/25 dark:text-orange-400",
  mid: "bg-amber-500/10 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  low: "border-transparent bg-emerald-500/10 text-emerald-600 dark:bg-teal-950/40 dark:text-emerald-400",
};

/** Matches the row Unsubscribe CTA (dark shell + mint text). */
const UNSUBSCRIBE_CTA_CLASSNAME =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-[#e4f7f3] bg-[#181e26]/85 px-3 py-1.5 text-xs font-medium text-[#e4f7f3] transition-colors hover:bg-[#181e26] hover:text-[#e4f7f3] disabled:pointer-events-none disabled:opacity-50";

const UNSUBSCRIBE_OPTIONS: {
  value: CleanupAction;
  label: string;
  description: string;
  icon: typeof UserRoundMinus;
}[] = [
  {
    value: "NONE",
    label: "Unsubscribe only",
    description: "Leave the list. Past mail stays where it is.",
    icon: UserRoundMinus,
  },
  {
    value: "TRASH",
    label: "Unsubscribe and delete emails",
    description: "Also move past mail from this sender to Trash.",
    icon: Trash2,
  },
  {
    value: "ARCHIVE",
    label: "Unsubscribe and archive emails",
    description: "Also archive past mail from this sender in Gmail.",
    icon: Archive,
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

type SubscriptionTab = "active" | "archive";

const CLUTTER_STORAGE_KEY = "mailpilot_subscriptions_min_clutter";

const subscriptionTabDescriptions: Record<SubscriptionTab, string> = {
  active:
    "Detected newsletter and subscription lists eligible for one-click unsubscribe.",
  archive: "Archived senders and second-chance message batch cleanup.",
};

function readStoredClutterThreshold(): number | null {
  try {
    const raw = localStorage.getItem(CLUTTER_STORAGE_KEY);
    if (raw == null) return null;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return null;
    return Math.max(0, Math.min(100, Math.round(parsed)));
  } catch {
    return null;
  }
}

function persistClutterThreshold(value: number) {
  try {
    localStorage.setItem(CLUTTER_STORAGE_KEY, String(value));
  } catch {
    // Ignore quota / private-mode write failures.
  }
}

export function SubscriptionsView({
  accountId,
  subscriptions,
  history,
  defaultCleanup,
  latestBriefing = null,
}: SubscriptionsViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SubscriptionTab>("active");
  const [selected, setSelected] = useState<Subscription | null>(null);
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [briefingTargets, setBriefingTargets] = useState<Subscription[]>([]);
  const [briefingPending, setBriefingPending] = useState(false);
  const [viewingBriefing, setViewingBriefing] =
    useState<ResolvedBriefing | null>(null);
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Hydrate after mount to avoid SSR/localStorage mismatches.
  useEffect(() => {
    setLocalBriefings(listLocalBriefings(accountId));
    const stored = readStoredClutterThreshold();
    if (stored != null) {
      setClutterThresholdState(stored);
    }
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
    persistClutterThreshold(next);
  }

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
    return active
      .filter((sub) => {
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
      })
      .sort((a, b) => compareSubscriptionsBySort(a, b, sortOption));
  }, [active, clutterThreshold, searchQuery, categoryFilter, sortOption]);

  const filteredArchive = useMemo(() => {
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
          sortOption
        )
      );
  }, [archive, clutterThreshold, searchQuery, categoryFilter, sortOption]);

  useEffect(() => {
    const visibleIds = new Set(filteredActive.map((s) => s.id));
    setSelectedIds((prev) => {
      const next = prev.filter((id) => visibleIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [filteredActive]);

  const isAllSelected =
    filteredActive.length > 0 &&
    filteredActive.every((s) => selectedIds.includes(s.id));

  function toggleSelectAll() {
    if (isAllSelected) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(filteredActive.map((s) => s.id));
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }

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

  async function runBriefingDigest(range: {
    startDate: string;
    endDate: string;
  }) {
    if (briefingTargets.length === 0 || briefingPending) return;
    setBriefingPending(true);
    const toastId = toast.loading("Generating briefing…");
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
        throw new Error(payload.error ?? "Failed to create briefing");
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
        `Briefing sent to ${payload.digestSentTo ?? "your inbox"} · ${payload.processedCount ?? 0} cleaned`,
        { id: toastId }
      );
      setBriefingOpen(false);
      setBriefingTargets([]);
      setSelectedIds([]);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create briefing",
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
        ? "Deleting briefing…"
        : `Deleting ${subscriptionIds.length} briefings…`
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
        throw new Error(payload.error ?? "Failed to delete briefing");
      }
      deleteLocalBriefings(accountId, subscriptionIds);
      setLocalBriefings(listLocalBriefings(accountId));
      toast.success(
        subscriptionIds.length === 1
          ? "Briefing deleted"
          : `${subscriptionIds.length} briefings deleted`,
        { id: toastId }
      );
      setViewingBriefing(null);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete briefing",
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

  function runUnsubscribe(cleanup: CleanupAction) {
    if (batchConfirmOpen) {
      runBatchUnsubscribe(cleanup);
      return;
    }
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const result = await unsubscribeSender(selected.id, cleanup);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      closeUnsubscribeDialog();
      router.refresh();
    });
  }

  function runBatchUnsubscribe(cleanup: CleanupAction) {
    if (selectedIds.length === 0) return;
    setError(null);
    startTransition(async () => {
      const toastId = toast.loading(
        `Unsubscribing ${selectedIds.length} sender(s)…`
      );
      let okCount = 0;
      let failCount = 0;
      for (const id of selectedIds) {
        const result = await unsubscribeSender(id, cleanup);
        if (result.ok) okCount += 1;
        else failCount += 1;
      }
      if (failCount === 0) {
        toast.success(`Unsubscribed ${okCount} sender(s)`, { id: toastId });
      } else {
        toast.error(
          `Unsubscribed ${okCount}, failed ${failCount}`,
          { id: toastId }
        );
      }
      setSelectedIds([]);
      closeUnsubscribeDialog();
      router.refresh();
    });
  }

  function runBatchCleanup(entry: ArchiveEntry) {
    setCleanupPending(entry.key);
    startTransition(async () => {
      const result = await batchCleanupSender(accountId, entry.senderEmail);
      setCleanupPending(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Moved ${result.data?.cleaned ?? 0} past email(s) to Trash`
      );
      router.refresh();
    });
  }

  function runDeleteUnsubscribedRecord() {
    if (!deleteRecordTarget) return;
    const entry = deleteRecordTarget;
    setDeleteRecordPending(true);
    startTransition(async () => {
      const result = await deleteUnsubscribedRecord(
        accountId,
        entry.senderEmail
      );
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

  const paginatedActive = slice(filteredActive);
  const paginatedArchive = slice(filteredArchive);

  const defaultSort: SubscriptionSortOption = "clutter_desc";
  const hasActiveTransientFilters =
    searchQuery.trim().length > 0 ||
    categoryFilter !== "all" ||
    sortOption !== defaultSort;

  function handleResetTransientFilters() {
    setSearchQuery("");
    setCategoryFilter("all");
    setSortOption(defaultSort);
    setCurrentPage(1);
  }

  return (
    <div>
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value as SubscriptionTab);
          setSelectedIds([]);
        }}
        className="w-full"
      >
        <div className="mb-3 flex flex-col justify-between gap-3 pt-2 sm:flex-row sm:items-center">
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
                className={segmentedTabsTriggerClassName}
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
            {activeTab === "active" && selectedIds.length > 0 ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending || briefingPending || deletePending}
                  className="px-3 py-1.5 text-xs font-semibold"
                  onClick={() => openBriefing(selectedSubscriptions)}
                >
                  Batch Briefing ({selectedIds.length})
                </Button>
                {selectedWithBriefingIds.length > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending || briefingPending || deletePending}
                    className="px-3 py-1.5 text-xs font-semibold"
                    onClick={() =>
                      void deleteBriefingsForSubscriptions(
                        selectedWithBriefingIds
                      )
                    }
                  >
                    {deletePending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Delete Briefings ({selectedWithBriefingIds.length})
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  disabled={pending || briefingPending || deletePending}
                  className="bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:pointer-events-none disabled:opacity-40"
                  onClick={() => {
                    setSelected(null);
                    setError(null);
                    setBatchConfirmOpen(true);
                  }}
                >
                  {pending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Unsubscribe Selected ({selectedIds.length})
                </Button>
              </>
            ) : null}
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
          onClutterThresholdChange={setClutterThreshold}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={setCategoryFilter}
          sortOption={sortOption}
          onSortOptionChange={setSortOption}
          showClutterSlider
          selectEnabled={activeTab === "active"}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
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
                onToggleRow={toggleRow}
                onUnsubscribe={setSelected}
                onBriefing={(sub) => openBriefing([sub])}
                resolveBriefing={resolveBriefingForSub}
                onViewLastBriefing={setViewingBriefing}
                onViewLastEmail={setSelectedEmailSub}
              />
              <ActiveMobileCards
                subscriptions={paginatedActive}
                selectedIds={selectedIds}
                onToggleRow={toggleRow}
                onUnsubscribe={setSelected}
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
                onPageChange={setCurrentPage}
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
                onPageChange={setCurrentPage}
              />
            </>
          )}
        </TabsContent>
      </Tabs>

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

      <Dialog
        open={Boolean(viewingBriefing)}
        onOpenChange={(open) => {
          if (!open) setViewingBriefing(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Last Briefing</DialogTitle>
            <DialogDescription>
              {viewingBriefing
                ? `Generated ${new Date(viewingBriefing.generatedAt).toLocaleString()}${
                    viewingBriefing.senderEmails.length > 1
                      ? ` · ${viewingBriefing.senderEmails.length} senders`
                      : ""
                  } · stored ${viewingBriefing.source === "db" ? "in cloud" : "on this device"}`
                : "No briefing available"}
            </DialogDescription>
          </DialogHeader>
          {viewingBriefing ? (
            <div className="max-h-[70vh] overflow-auto rounded-lg border border-border/60 bg-slate-950">
              <iframe
                title="Last briefing preview"
                className="h-[65vh] w-full border-0"
                srcDoc={viewingBriefing.htmlPreview}
                sandbox=""
              />
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="destructive"
              disabled={deletePending || !viewingBriefing}
              onClick={() => {
                if (!viewingBriefing) return;
                void deleteBriefingsForSubscriptions([
                  viewingBriefing.subscriptionId,
                ]);
              }}
            >
              {deletePending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Delete Briefing
            </Button>
            <Button variant="ghost" onClick={() => setViewingBriefing(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={unsubscribeDialogOpen}
        onOpenChange={(open) => {
          if (!open && !pending) closeUnsubscribeDialog();
        }}
      >
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="space-y-1 border-b border-border/60 px-6 pb-3 pt-5 pr-12 text-left">
            <DialogTitle className="text-lg font-semibold leading-tight tracking-tight">
              Unsubscribe
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {batchConfirmOpen ? (
                <>
                  Choose how to leave{" "}
                  <span className="font-medium text-foreground">
                    {selectedIds.length} selected sender
                    {selectedIds.length === 1 ? "" : "s"}
                  </span>
                  .
                </>
              ) : (
                <>
                  Choose how to leave{" "}
                  <span className="font-medium text-foreground">
                    {selected?.senderName ?? selected?.senderEmail}
                  </span>
                  {selected?.senderName ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · {selected.senderEmail}
                    </span>
                  ) : null}
                  .
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 px-6 py-4">
            <div
              className="overflow-hidden rounded-lg border border-border/60 bg-muted/20"
              role="radiogroup"
              aria-label="Unsubscribe options"
            >
              {UNSUBSCRIBE_OPTIONS.map((option, index) => {
                const selectedOption = cleanupChoice === option.value;
                const Icon = option.icon;
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
                      <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {error ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter className="gap-2 border-t border-border/60 bg-muted/20 px-6 py-3 sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9"
              disabled={pending}
              onClick={closeUnsubscribeDialog}
            >
              Cancel
            </Button>
            <button
              type="button"
              disabled={pending}
              onClick={() => runUnsubscribe(cleanupChoice)}
              className={cn(UNSUBSCRIBE_CTA_CLASSNAME, "h-9 px-3.5")}
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UserRoundMinus className="h-3.5 w-3.5" />
              )}
              <span>{pending ? "Working…" : "Unsubscribe"}</span>
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={Boolean(deleteRecordTarget)}
        onOpenChange={(open) => {
          if (!open && !deleteRecordPending) setDeleteRecordTarget(null);
        }}
        title="Delete record"
        description="Are you sure? This can't be undone."
        confirmLabel="Delete Record"
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
        <div className="flex w-7 shrink-0 items-center justify-center border-r border-border/40 bg-muted/40 text-muted-foreground/75">
          {icon}
        </div>
      ) : null}
      <div
        className={cn(
          "flex min-w-0 flex-1 items-center justify-center px-1.5",
          SCORE_PERCENT_CLASSNAME,
          valueClassName ?? "bg-background text-foreground"
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
  return formatDistanceToNow(new Date(date), { addSuffix: true });
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
  // Fits short labels like "11mo ago" (+ icon rail); longer values ellipsis.
  const receivedCh = 9.5;
  return {
    clutter: `${clutterCh}ch`,
    emails: `${emailsCh}ch`,
    received: `${receivedCh}ch`,
  };
}

function ClutterStatBadge({
  score,
  width,
}: {
  score: number;
  width?: string;
}) {
  const tier = clutterScoreTier(score);
  return (
    <IconStatBadge
      title="Clutter score"
      value={`${score}%`}
      valueClassName={CLUTTER_VALUE_CLASSES[tier]}
      width={width}
    />
  );
}

function EmailsStatBadge({
  count,
  width,
}: {
  count: number;
  width?: string;
}) {
  return (
    <IconStatBadge
      title="Email volume"
      icon={<Mail className="size-3.5" aria-hidden />}
      value={String(count)}
      valueClassName="bg-background text-muted-foreground"
      width={width}
    />
  );
}

function LastReceivedStatBadge({
  date,
  width,
}: {
  date: Date | string | null | undefined;
  width?: string;
}) {
  const value = formatLastReceivedValue(date);
  return (
    <IconStatBadge
      title="Last received"
      icon={<Send className="size-3.5" aria-hidden />}
      value={value}
      valueClassName="bg-background font-medium tracking-normal text-muted-foreground/70"
      width={width ?? "9.5ch"}
      truncateValue
    />
  );
}

/** Same gap as Create Briefing ↔ Unsubscribe (`gap-2.5`). */
const METRICS_GAP_CLASS = "gap-2.5";

function AnalyticsMetrics({
  clutter,
  emailCount,
  lastReceivedAt,
  widths,
}: {
  clutter: number;
  emailCount: number;
  lastReceivedAt: Date | string | null | undefined;
  widths?: MetricColumnWidths;
}) {
  return (
    <div className={cn("flex items-center", METRICS_GAP_CLASS)}>
      <LastReceivedStatBadge date={lastReceivedAt} width={widths?.received} />
      <EmailsStatBadge count={emailCount} width={widths?.emails} />
      <ClutterStatBadge score={clutter} width={widths?.clutter} />
    </div>
  );
}

function LastBriefingIconButton({
  briefing,
  onView,
}: {
  briefing: ResolvedBriefing;
  onView: (briefing: ResolvedBriefing) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onView(briefing)}
      title={
        briefing.source === "db"
          ? "View last briefing (cloud)"
          : "View last briefing (this device)"
      }
      aria-label="View last briefing"
      className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-teal-700 transition-colors hover:bg-teal-700/10 dark:text-teal-400"
    >
      <Eye className="size-3" />
      Last Briefing
    </button>
  );
}

function SubscriptionRowActions({
  sub,
  onBriefing,
  onUnsubscribe,
  onViewLastEmail,
}: {
  sub: Subscription;
  onBriefing: (sub: Subscription) => void;
  onUnsubscribe: (sub: Subscription) => void;
  onViewLastEmail: (sub: Subscription) => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={() => onBriefing(sub)}
        className={SECONDARY_ACTION_BTN_CLASSNAME}
      >
        <Summary className="h-3.5 w-3.5" />
        <span>Create Briefing</span>
      </button>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => onUnsubscribe(sub)}
          className={UNSUBSCRIBE_CTA_CLASSNAME}
        >
          <UserRoundMinus className="h-3.5 w-3.5" />
          <span>Unsubscribe</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <RowMenuTrigger label="Subscription actions" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem
              className="cursor-pointer gap-2"
              onClick={() => onViewLastEmail(sub)}
            >
              <Mail className="size-4 text-muted-foreground" />
              <span>View last received email</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}

/** Desktop row: three zones separated by subtle vertical dividers. */
function SubscriptionDesktopRow({
  sub,
  selected,
  onToggleRow,
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
  onToggleRow: (id: string) => void;
  clutter: number;
  briefing: ResolvedBriefing | null;
  metricWidths: MetricColumnWidths;
  onBriefing: (sub: Subscription) => void;
  onUnsubscribe: (sub: Subscription) => void;
  onViewLastBriefing: (briefing: ResolvedBriefing) => void;
  onViewLastEmail: (sub: Subscription) => void;
}) {
  return (
    <div className="flex h-16 items-center border-b border-border/70 pl-3 pr-4 last:border-b-0">
      {/* Zone 1: Contact & Identity — grows so the first divider sits closer to metrics */}
      <div className="flex min-w-0 flex-1 items-center gap-3 border-r border-border/40 pr-5">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleRow(sub.id)}
          className="m-0 h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-border text-[#3c837b] transition-colors focus:ring-[#3c837b]/30"
          aria-label={`Select ${sub.senderEmail}`}
        />
        <CompanyLogo
          src={senderLogoSrc(sub.senderEmail)}
          name={sub.senderName ?? sub.senderEmail}
          size="md"
        />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-sm font-medium text-foreground">
              {sub.senderName ?? "—"}
            </p>
            {briefing ? (
              <LastBriefingIconButton
                briefing={briefing}
                onView={onViewLastBriefing}
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
        />
        <EmailsStatBadge count={sub.emailCount} width={metricWidths.emails} />
        <ClutterStatBadge score={clutter} width={metricWidths.clutter} />
      </div>

      {/* Zone 3: Actions */}
      <div className="-mr-4 flex h-16 shrink-0 items-center justify-end gap-2.5 self-stretch bg-muted/[0.12] py-0 pl-4 pr-1">
        <SubscriptionRowActions
          sub={sub}
          onBriefing={onBriefing}
          onUnsubscribe={onUnsubscribe}
          onViewLastEmail={onViewLastEmail}
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
  onToggleRow,
  onUnsubscribe,
  onBriefing,
  resolveBriefing,
  onViewLastBriefing,
  onViewLastEmail,
}: {
  subscriptions: Subscription[];
  selectedIds: string[];
  onToggleRow: (id: string) => void;
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

  return (
    <div className="hidden w-full overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm md:block">
      {subscriptions.map((sub) => {
        const clutter = clutterForSub(sub);
        const briefing = resolveBriefing(sub);
        return (
          <SubscriptionDesktopRow
            key={sub.id}
            sub={sub}
            selected={selectedIds.includes(sub.id)}
            onToggleRow={onToggleRow}
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
    </div>
  );
}

function ActiveMobileCards({
  subscriptions,
  selectedIds,
  onToggleRow,
  onUnsubscribe,
  onBriefing,
  resolveBriefing,
  onViewLastBriefing,
  onViewLastEmail,
}: {
  subscriptions: Subscription[];
  selectedIds: string[];
  onToggleRow: (id: string) => void;
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

  return (
    <ul className="space-y-3 md:hidden">
      {subscriptions.map((sub) => {
        const clutter = clutterForSub(sub);
        const briefing = resolveBriefing(sub);
        return (
          <li
            key={sub.id}
            className="rounded-xl border border-border/50 bg-card p-4 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={selectedIds.includes(sub.id)}
                onChange={() => onToggleRow(sub.id)}
                className="m-0 h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-border text-[#3c837b] transition-colors focus:ring-[#3c837b]/30"
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
                    <p className="truncate text-sm font-medium text-foreground">
                      {sub.senderName ?? sub.senderEmail}
                    </p>
                    {briefing ? (
                      <LastBriefingIconButton
                        briefing={briefing}
                        onView={onViewLastBriefing}
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
              />
              <div className="-mr-1.5 flex shrink-0 items-center justify-end gap-2.5">
                <SubscriptionRowActions
                  sub={sub}
                  onBriefing={onBriefing}
                  onUnsubscribe={onUnsubscribe}
                  onViewLastEmail={onViewLastEmail}
                />
              </div>
            </div>
          </li>
        );
      })}
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
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[#e4f7f3] bg-[#ed1d24] px-3 py-1.5 text-xs font-medium text-[#e4f7f3] transition-colors hover:bg-[#ef4444]/90 hover:text-[#e4f7f3] disabled:opacity-50"
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
            className="cursor-pointer gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
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
    <div className="flex h-16 items-center border-b border-border/70 pl-3 pr-4 last:border-b-0">
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
    <div className="hidden w-full overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm md:block">
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
          <li
            key={entry.key}
            className="rounded-xl border border-border/50 bg-card p-4 shadow-sm"
          >
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
