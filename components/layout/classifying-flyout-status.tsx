"use client";

import { CheckCircle2 } from "lucide-react";

import { useSyncStatus } from "@/components/layout/sync-status-provider";
import { BULK_FLYOUT_PILL_CLASSNAME } from "@/components/ui/composites/bulk-actions-flyout";
import { cn } from "@/lib/utils";

type ClassifyingFlyoutStatusProps = {
  className?: string;
};

/**
 * Status copy for the bottom classifying flyout pill.
 * Type matches sidebar rows; status color lives on the dot / complete icon.
 */
export function ClassifyingFlyoutStatus({
  className,
}: ClassifyingFlyoutStatusProps) {
  const {
    isSyncing,
    justFinished,
    lastSyncProcessed,
    totalToProcess,
  } = useSyncStatus();

  if (!isSyncing && !justFinished) return null;

  const syncProgress =
    isSyncing && lastSyncProcessed && lastSyncProcessed > 0
      ? totalToProcess && totalToProcess >= lastSyncProcessed
        ? `${lastSyncProcessed} / ${totalToProcess}`
        : `${lastSyncProcessed}`
      : null;

  return (
    <div
      className={cn(
        "flex min-w-0 flex-nowrap items-center gap-2 px-2 text-[13px] font-medium tracking-normal text-[#e4f7f3]/60",
        className
      )}
    >
      {isSyncing ? (
        <>
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sky-400" />
          </span>
          <span className="whitespace-nowrap text-[#e4f7f3]">
            {syncProgress
              ? syncProgress.includes("/")
                ? <>
                    Classifying{" "}
                    <span className="font-semibold tabular-nums">
                      {syncProgress}
                    </span>{" "}
                    opportunities…
                  </>
                : <>
                    Classifying opportunity{" "}
                    <span className="font-semibold tabular-nums">
                      {syncProgress}
                    </span>
                    …
                  </>
              : "Scanning inbox for opportunities…"}
          </span>
        </>
      ) : (
        <>
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
          <span className="whitespace-nowrap text-[#e4f7f3]">
            Scan complete — opportunities updated
          </span>
        </>
      )}
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
