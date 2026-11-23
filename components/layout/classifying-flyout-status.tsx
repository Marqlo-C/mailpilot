"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";

import {
  useOptionalSyncStatus,
  useSyncStatus,
} from "@/components/layout/sync-status-provider";
import { BULK_FLYOUT_PILL_CLASSNAME } from "@/components/ui/composites/bulk-actions-flyout";
import { NumberTicker } from "@/components/ui/number-ticker";
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
  progressProcessed: number | null;
  progressTotal: number | null;
  opportunitiesAdded: number | null;
  showCount: boolean;
};

function resolveProgress(
  processed: number | null,
  total: number | null
): { processed: number; total: number | null } | null {
  if (processed == null || processed <= 0) return null;
  if (total != null && total >= processed) {
    return { processed, total };
  }
  return { processed, total: null };
}

function ProgressRatio({
  processed,
  total,
}: {
  processed: number;
  total: number | null;
}) {
  return (
    <span className="inline-flex items-baseline gap-1 font-semibold tabular-nums">
      <NumberTicker value={processed} />
      {total != null ? <span>/ {total}</span> : null}
    </span>
  );
}

function StatusBody({
  isSyncing,
  queuedMode,
  progressProcessed,
  progressTotal,
  opportunitiesAdded,
  showCount,
}: StatusSnapshot) {
  const progress =
    progressProcessed != null
      ? { processed: progressProcessed, total: progressTotal }
      : null;

  if (isSyncing) {
    return (
      <div className="flex items-center gap-2">
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sky-400" />
        </span>
        <span className="whitespace-nowrap text-[#e4f7f3]">
          {queuedMode ? (
            progress ? (
              <>
                Ace reviewing <ProgressRatio {...progress} /> queued…
              </>
            ) : (
              "Ace reviewing queued emails…"
            )
          ) : progress ? (
            <>
              Sorting inbox <ProgressRatio {...progress} />…
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
            {hasAdded ? (
              <>
                +
                <NumberTicker value={count} />
              </>
            ) : (
              "0"
            )}
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
  const sync = useOptionalSyncStatus();
  const isSyncing = sync?.isSyncing ?? false;
  const justFinished = sync?.justFinished ?? false;
  const syncKind = sync?.syncKind ?? null;
  const lastSyncProcessed = sync?.lastSyncProcessed ?? null;
  const totalToProcess = sync?.totalToProcess ?? null;
  const lastSyncPendingProcessed = sync?.lastSyncPendingProcessed ?? null;
  const syncPendingTotal = sync?.syncPendingTotal ?? null;
  const opportunitiesAdded = sync?.opportunitiesAdded ?? null;

  const [showCount, setShowCount] = useState(false);

  const [latchedCount, setLatchedCount] = useState<number | null>(null);
  const [prevAddedKey, setPrevAddedKey] = useState({
    opportunitiesAdded,
    isSyncing,
    justFinished,
  });
  if (
    prevAddedKey.opportunitiesAdded !== opportunitiesAdded ||
    prevAddedKey.isSyncing !== isSyncing ||
    prevAddedKey.justFinished !== justFinished
  ) {
    setPrevAddedKey({ opportunitiesAdded, isSyncing, justFinished });
    if (typeof opportunitiesAdded === "number") {
      setLatchedCount(opportunitiesAdded);
    } else if (!isSyncing && !justFinished) {
      setLatchedCount(null);
    }
  }

  const effectiveOpportunitiesAdded =
    typeof opportunitiesAdded === "number"
      ? opportunitiesAdded
      : latchedCount;

  const isActivelySyncing = isSyncing && !justFinished;

  const [prevCountGate, setPrevCountGate] = useState({
    isActivelySyncing,
    justFinished,
  });
  if (
    prevCountGate.isActivelySyncing !== isActivelySyncing ||
    prevCountGate.justFinished !== justFinished
  ) {
    setPrevCountGate({ isActivelySyncing, justFinished });
    if (isActivelySyncing || !justFinished) {
      setShowCount(false);
    }
  }

  useEffect(() => {
    if (isActivelySyncing || !justFinished) return;
    const timer = setTimeout(() => {
      setShowCount(true);
    }, 1800);
    return () => clearTimeout(timer);
  }, [isActivelySyncing, justFinished]);

  const active = isSyncing || justFinished;
  const queuedMode = syncKind === "queued";
  // Never cross-fall back between inbox and Ace counters — that made the
  // numerator jump backward (e.g. 4 → 1) and the ticker count down.
  const progress = queuedMode
    ? resolveProgress(lastSyncPendingProcessed, syncPendingTotal)
    : resolveProgress(lastSyncProcessed, totalToProcess);

  const live: StatusSnapshot | null = active
    ? {
        isSyncing: isActivelySyncing,
        queuedMode,
        progressProcessed: progress?.processed ?? null,
        progressTotal: progress?.total ?? null,
        opportunitiesAdded: effectiveOpportunitiesAdded,
        showCount,
      }
    : null;
  const [lingering, setLingering] = useState<StatusSnapshot | null>(null);

  if (
    live &&
    (lingering?.isSyncing !== live.isSyncing ||
      lingering?.queuedMode !== live.queuedMode ||
      lingering?.progressProcessed !== live.progressProcessed ||
      lingering?.progressTotal !== live.progressTotal ||
      lingering?.opportunitiesAdded !== live.opportunitiesAdded ||
      lingering?.showCount !== live.showCount)
  ) {
    setLingering(live);
  }

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
  const sync = useOptionalSyncStatus();
  if (!sync) return false;
  return Boolean(sync.accountId && (sync.isSyncing || sync.justFinished));
}
