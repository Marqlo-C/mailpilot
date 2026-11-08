"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";

import { useSyncStatus } from "@/components/layout/sync-status-provider";
import { BULK_FLYOUT_PILL_CLASSNAME } from "@/components/ui/composites/bulk-actions-flyout";
import { cn } from "@/lib/utils";

type ClassifyingFlyoutStatusProps = {
  className?: string;
  /**
   * Keep the last frame painted while the parent flyout is leaving.
   * Without this the pill empties on sync end and the exit only compresses.
   */
  linger?: boolean;
};

type StatusSnapshot = {
  isSyncing: boolean;
  queuedMode: boolean;
  syncProgress: string | null;
  opportunitiesAdded: number | null;
  showCount: boolean;
};

function formatRatio(processed: number | null, total: number | null): string | null {
  if (processed == null || processed <= 0) return null;
  if (total != null && total >= processed) {
    return `${processed} / ${total}`;
  }
  return `${processed}`;
}

function StatusBody({
  isSyncing,
  queuedMode,
  syncProgress,
  opportunitiesAdded,
  showCount,
}: StatusSnapshot) {
  if (isSyncing) {
    return (
      <div className="flex items-center gap-2">
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sky-400" />
        </span>
        <span className="whitespace-nowrap text-[#e4f7f3]">
          {queuedMode ? (
            syncProgress ? (
              <>
                Ace reviewing{" "}
                <span className="font-semibold tabular-nums">
                  {syncProgress}
                </span>{" "}
                queued…
              </>
            ) : (
              "Ace reviewing queued emails…"
            )
          ) : syncProgress ? (
            <>
              Sorting inbox{" "}
              <span className="font-semibold tabular-nums">{syncProgress}</span>
              …
            </>
          ) : (
            "Sorting inbox…"
          )}
        </span>
      </div>
    );
  }

  const count = typeof opportunitiesAdded === "number" ? opportunitiesAdded : 0;
  const hasAdded = count > 0;

  return (
    <div className="relative flex h-5 min-w-0 items-center overflow-hidden">
      {/* Phase 1: Sort complete (slides up & fades out) */}
      <div
        className={cn(
          "flex items-center gap-2 transition-all duration-300 ease-out",
          showCount
            ? "pointer-events-none absolute -translate-y-full opacity-0"
            : "translate-y-0 opacity-100"
        )}
      >
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        <span className="whitespace-nowrap text-[#e4f7f3]">
          {queuedMode ? "Queued review complete" : "Inbox sort complete"}
        </span>
      </div>

      {/* Phase 2: Opportunities count (slides up from bottom & fades in) */}
      <div
        className={cn(
          "flex items-center gap-2 transition-all duration-300 ease-out",
          showCount
            ? "translate-y-0 opacity-100"
            : "pointer-events-none absolute translate-y-full opacity-0"
        )}
      >
        {hasAdded ? (
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        )}
        <span className="whitespace-nowrap text-[#e4f7f3]">
          <span
            className={cn(
              "font-semibold tabular-nums",
              hasAdded ? "text-emerald-300" : "text-[#e4f7f3]"
            )}
          >
            {hasAdded ? `+${count}` : "0"}
          </span>{" "}
          {count === 1 ? "opportunity" : "opportunities"} added
        </span>
      </div>
    </div>
  );
}

/**
 * Status copy for the bottom classifying flyout pill.
 * Inbox runs → Sorting inbox; queued Ace runs → Ace reviewing queued.
 */
export function ClassifyingFlyoutStatus({
  className,
  linger = false,
}: ClassifyingFlyoutStatusProps) {
  const {
    isSyncing,
    justFinished,
    syncKind,
    lastSyncProcessed,
    totalToProcess,
    lastSyncPendingProcessed,
    syncPendingTotal,
    opportunitiesAdded,
  } = useSyncStatus();

  const [showCount, setShowCount] = useState(false);

  const [latchedCount, setLatchedCount] = useState<number | null>(null);

  useEffect(() => {
    if (typeof opportunitiesAdded === "number") {
      setLatchedCount(opportunitiesAdded);
    } else if (!isSyncing && !justFinished) {
      setLatchedCount(null);
    }
  }, [opportunitiesAdded, isSyncing, justFinished]);

  const effectiveOpportunitiesAdded =
    typeof opportunitiesAdded === "number"
      ? opportunitiesAdded
      : latchedCount;

  const isActivelySyncing = isSyncing && !justFinished;

  useEffect(() => {
    if (isActivelySyncing) {
      setShowCount(false);
      return;
    }
    if (justFinished) {
      const timer = setTimeout(() => {
        setShowCount(true);
      }, 1300);
      return () => clearTimeout(timer);
    }
    setShowCount(false);
  }, [isActivelySyncing, justFinished]);

  const active = isSyncing || justFinished;
  const queuedMode = syncKind === "queued";
  const syncProgress = queuedMode
    ? formatRatio(lastSyncPendingProcessed, syncPendingTotal) ??
      formatRatio(lastSyncProcessed, totalToProcess)
    : formatRatio(lastSyncProcessed, totalToProcess);

  const live: StatusSnapshot | null = active
    ? {
        isSyncing: isActivelySyncing,
        queuedMode,
        syncProgress,
        opportunitiesAdded: effectiveOpportunitiesAdded,
        showCount,
      }
    : null;
  const [lingering, setLingering] = useState<StatusSnapshot | null>(null);

  useEffect(() => {
    if (!active) return;
    setLingering({
      isSyncing: isActivelySyncing,
      queuedMode,
      syncProgress,
      opportunitiesAdded: effectiveOpportunitiesAdded,
      showCount,
    });
  }, [
    active,
    isActivelySyncing,
    queuedMode,
    syncProgress,
    effectiveOpportunitiesAdded,
    showCount,
  ]);

  const snapshot = live ?? (linger ? lingering : null);
  if (!snapshot) return null;

  return (
    <div
      className={cn(
        "flex min-w-0 flex-nowrap items-center gap-2 px-2 text-[13px] font-medium tracking-normal text-[#e4f7f3]/60",
        className
      )}
    >
      <StatusBody {...snapshot} />
    </div>
  );
}

/** Status-only pill for the shared multiselect bar (no nested cancel). */
export function ClassifyingFlyoutStatusPill({
  className,
}: {
  className?: string;
}) {
  const visible = useClassifyingFlyoutVisible();
  if (!visible) return null;
  return (
    <div className={cn(BULK_FLYOUT_PILL_CLASSNAME, className)}>
      <ClassifyingFlyoutStatus />
    </div>
  );
}

/** Whether the classifying status pill should be visible. */
export function useClassifyingFlyoutVisible() {
  const { accountId, isSyncing, justFinished } = useSyncStatus();
  return Boolean(accountId && (isSyncing || justFinished));
}
