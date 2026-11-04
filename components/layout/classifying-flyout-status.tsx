"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";

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
};

function formatRatio(processed: number | null, total: number | null): string | null {
  if (processed == null || processed <= 0) return null;
  if (total != null && total >= processed) {
    return `${processed} / ${total}`;
  }
  return `${processed}`;
}

function StatusBody({ isSyncing, queuedMode, syncProgress }: StatusSnapshot) {
  if (isSyncing) {
    return (
      <>
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
      </>
    );
  }

  return (
    <>
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
      <span className="whitespace-nowrap text-[#e4f7f3]">
        {queuedMode ? "Queued review complete" : "Inbox sort complete"}
      </span>
    </>
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
  } = useSyncStatus();

  const active = isSyncing || justFinished;
  const queuedMode = syncKind === "queued";
  const syncProgress = queuedMode
    ? formatRatio(lastSyncPendingProcessed, syncPendingTotal) ??
      formatRatio(lastSyncProcessed, totalToProcess)
    : formatRatio(lastSyncProcessed, totalToProcess);

  const live: StatusSnapshot | null = active
    ? { isSyncing, queuedMode, syncProgress }
    : null;
  const [lingering, setLingering] = useState<StatusSnapshot | null>(null);

  useEffect(() => {
    if (!active) return;
    setLingering({ isSyncing, queuedMode, syncProgress });
  }, [active, isSyncing, queuedMode, syncProgress]);

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
