"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Subscription, SubscriptionHistory } from "@prisma/client";
import { BadgeInfo, Eye, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  batchCleanupSender,
  unsubscribeSender,
} from "@/app/actions/subscriptions";
import { SyncControls } from "@/components/opportunities/sync-controls";
import { BriefingDialog } from "@/components/subscriptions/briefing-dialog";
import { SubscriptionsToolbar } from "@/components/subscriptions/subscriptions-toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CompanyLogo } from "@/components/ui/company-logo";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PipelinePaginationFooter } from "@/components/ui/pipeline-pagination";
import {
  segmentedTabsListClassName,
  segmentedTabsTriggerClassName,
  TabCountBadge,
} from "@/components/ui/segmented-tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePagination } from "@/hooks/use-pagination";
import { faviconUrlForDomain, getCleanDomain } from "@/lib/domain";
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
const CLUTTER_TONE_CLASSES: Record<ClutterScoreTier, string> = {
  high: "border-transparent bg-orange-600/15 text-orange-700 dark:bg-orange-500/25 dark:text-orange-400",
  mid: "border-transparent bg-amber-500/10 text-amber-600 dark:text-amber-400",
  low: "border-transparent bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

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

function methodBadge(sub: Subscription): {
  label: string;
  variant: "default" | "secondary" | "outline";
} {
  if (sub.unsubPostUrl) return { label: "One-Click", variant: "default" };
  if (sub.unsubMailto) return { label: "Email", variant: "secondary" };
  return { label: "Link", variant: "outline" };
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
  const [localBriefings, setLocalBriefings] = useState<
    Record<string, LocalBriefingRecord>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [cleanupPending, setCleanupPending] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);

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
              />
              <ActiveMobileCards
                subscriptions={paginatedActive}
                selectedIds={selectedIds}
                onToggleRow={toggleRow}
                onUnsubscribe={setSelected}
                onBriefing={(sub) => openBriefing([sub])}
                resolveBriefing={resolveBriefingForSub}
                onViewLastBriefing={setViewingBriefing}
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
              <div className="hidden space-y-3 md:block">
                {paginatedArchive.map((entry) => (
                  <ArchiveCard
                    key={entry.key}
                    entry={entry}
                    pending={cleanupPending === entry.key || pending}
                    onCleanup={() => runBatchCleanup(entry)}
                  />
                ))}
              </div>
              <ul className="space-y-3 md:hidden">
                {paginatedArchive.map((entry) => (
                  <li key={entry.key}>
                    <ArchiveCard
                      entry={entry}
                      pending={cleanupPending === entry.key || pending}
                      onCleanup={() => runBatchCleanup(entry)}
                    />
                  </li>
                ))}
              </ul>
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
        open={Boolean(selected) || batchConfirmOpen}
        onOpenChange={(open) => !open && closeUnsubscribeDialog()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsubscribe</DialogTitle>
            <DialogDescription>
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
                    {selected?.senderEmail}
                  </span>
                  .
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Button
              className="w-full justify-start"
              variant={defaultCleanup === "NONE" ? "default" : "outline"}
              disabled={pending}
              onClick={() => runUnsubscribe("NONE")}
            >
              Unsubscribe Only
            </Button>
            <Button
              className="w-full justify-start"
              variant={defaultCleanup === "TRASH" ? "default" : "outline"}
              disabled={pending}
              onClick={() => runUnsubscribe("TRASH")}
            >
              Unsubscribe + Trash All Past
            </Button>
            <Button
              className="w-full justify-start"
              variant={defaultCleanup === "ARCHIVE" ? "default" : "outline"}
              disabled={pending}
              onClick={() => runUnsubscribe("ARCHIVE")}
            >
              Unsubscribe and archive past emails
            </Button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={closeUnsubscribeDialog}
            >
              Cancel
            </Button>
            {pending && (
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Working…
              </span>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

function ClutterScoreBadge({ score }: { score: number }) {
  const tier = clutterScoreTier(score);
  const tone = CLUTTER_TONE_CLASSES[tier];
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-bold tabular-nums tracking-tight shadow-none",
        tone
      )}
    >
      {score}%
    </Badge>
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
}: {
  subscriptions: Subscription[];
  selectedIds: string[];
  onToggleRow: (id: string) => void;
  onUnsubscribe: (sub: Subscription) => void;
  onBriefing: (sub: Subscription) => void;
  resolveBriefing: (sub: Subscription) => ResolvedBriefing | null;
  onViewLastBriefing: (briefing: ResolvedBriefing) => void;
}) {
  return (
    <div className="hidden w-full overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 pl-3 pr-2" />
            <TableHead>Sender</TableHead>
            <TableHead>Clutter</TableHead>
            <TableHead>Volume</TableHead>
            <TableHead>Method</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {subscriptions.map((sub) => {
            const method = methodBadge(sub);
            const clutter = clutterForSub(sub);
            const briefing = resolveBriefing(sub);
            return (
              <TableRow key={sub.id}>
                <TableCell className="w-10 pl-3 pr-2 text-left">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(sub.id)}
                    onChange={() => onToggleRow(sub.id)}
                    className="m-0 h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-border text-[#3c837b] focus:ring-[#3c837b]/30"
                    aria-label={`Select ${sub.senderEmail}`}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex min-w-0 items-center gap-3">
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
                          <button
                            type="button"
                            onClick={() => onViewLastBriefing(briefing)}
                            className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-teal-700 transition-colors hover:bg-teal-700/10 dark:text-teal-400"
                            title={
                              briefing.source === "db"
                                ? "View last briefing (cloud)"
                                : "View last briefing (this device)"
                            }
                          >
                            <Eye className="size-3" />
                            Last Briefing
                          </button>
                        ) : null}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {sub.senderEmail}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <ClutterScoreBadge score={clutter} />
                </TableCell>
                <TableCell>{sub.emailCount}</TableCell>
                <TableCell>
                  <Badge variant={method.variant}>{method.label}</Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      sub.status === "FAILED" ? "destructive" : "secondary"
                    }
                    title={
                      sub.status === "FAILED"
                        ? sub.lastError ?? "Unknown failure"
                        : undefined
                    }
                    className={
                      sub.status === "FAILED" ? "cursor-help" : undefined
                    }
                  >
                    {sub.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onBriefing(sub)}
                    >
                      Create Briefing
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onUnsubscribe(sub)}
                    >
                      Unsubscribe
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
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
}: {
  subscriptions: Subscription[];
  selectedIds: string[];
  onToggleRow: (id: string) => void;
  onUnsubscribe: (sub: Subscription) => void;
  onBriefing: (sub: Subscription) => void;
  resolveBriefing: (sub: Subscription) => ResolvedBriefing | null;
  onViewLastBriefing: (briefing: ResolvedBriefing) => void;
}) {
  return (
    <ul className="space-y-3 md:hidden">
      {subscriptions.map((sub) => {
        const method = methodBadge(sub);
        const clutter = clutterForSub(sub);
        const briefing = resolveBriefing(sub);
        return (
          <li
            key={sub.id}
            className="rounded-xl border border-border/50 bg-card p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(sub.id)}
                  onChange={() => onToggleRow(sub.id)}
                  className="mt-1 h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-border text-[#3c837b] focus:ring-[#3c837b]/30"
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
                      {sub.senderName ?? sub.senderEmail}
                    </p>
                    {briefing ? (
                      <button
                        type="button"
                        onClick={() => onViewLastBriefing(briefing)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-teal-700 hover:bg-teal-700/10 dark:text-teal-400"
                      >
                        <Eye className="size-3" />
                        Last Briefing
                      </button>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {sub.senderEmail}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <ClutterScoreBadge score={clutter} />
                <Badge variant={method.variant}>{method.label}</Badge>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span
                className="text-muted-foreground"
                title={
                  sub.status === "FAILED"
                    ? sub.lastError ?? "Unknown failure"
                    : undefined
                }
              >
                {sub.emailCount} email{sub.emailCount === 1 ? "" : "s"} ·{" "}
                {sub.status}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onBriefing(sub)}
                >
                  Create Briefing
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onUnsubscribe(sub)}
                >
                  Unsubscribe
                </Button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ArchiveCard({
  entry,
  pending,
  onCleanup,
}: {
  entry: ArchiveEntry;
  pending: boolean;
  onCleanup: () => void;
}) {
  const clutter = subscriptionClutterScore({
    emailCount: entry.emailCount ?? 0,
    lastReceivedAt: entry.lastReceivedAt,
  });

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/50 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <CompanyLogo
          src={senderLogoSrc(entry.senderEmail)}
          name={entry.senderName ?? entry.senderEmail}
          size="md"
        />
        <div className="min-w-0">
          <p className="truncate font-medium">
            {entry.senderName ?? entry.senderEmail}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {entry.senderEmail}
            {entry.emailCount != null
              ? ` · ${entry.emailCount} tracked`
              : " · from history"}
          </p>
        </div>
        {entry.emailCount != null ? (
          <ClutterScoreBadge score={clutter} />
        ) : null}
      </div>
      <Button
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={onCleanup}
        className="shrink-0"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
        Delete All Emails
      </Button>
    </div>
  );
}
