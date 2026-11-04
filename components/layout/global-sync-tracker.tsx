"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import {
  ClassifyingFlyoutStatus,
  useClassifyingFlyoutVisible,
} from "@/components/layout/classifying-flyout-status";
import { useSyncStatus } from "@/components/layout/sync-status-provider";
import {
  BULK_FLYOUT_CANCEL_CLASSNAME,
  BULK_FLYOUT_HOST_CLASSNAME,
  BULK_FLYOUT_PILL_CLASSNAME,
  useBulkActionsHandoff,
  useBulkActionsOpen,
  useFlyoutPresence,
} from "@/components/ui/composites/bulk-actions-flyout";
import { CancelTaskButton } from "@/components/ui/composites/cancel-task-button";
import { cn } from "@/lib/utils";

/**
 * Standalone sort/review flyout — status pill + cancel.
 * On multiselect: leave fully first, then the selection bar mounts.
 * On clear selection: selection leaves fully first, then this remounts.
 */
export function GlobalSyncTracker() {
  const bulkOpen = useBulkActionsOpen();
  const { selectionRequested, setSyncTrackerMounted } = useBulkActionsHandoff();
  const visible = useClassifyingFlyoutVisible();
  const { isSyncing, justFinished, syncKind, forceReset } = useSyncStatus();
  const open = visible && !selectionRequested && !bulkOpen;
  const { mounted, phase, style, onAnimationEnd } = useFlyoutPresence(open);
  // Yielding to multiselect — purpose-built shorter leave (not a time-ramp).
  const retractFast = phase === "out" && selectionRequested;
  // Keep the X through leave so exit is slide+fold, not only-child compress.
  // One effect: never clear on the pre-mount frame while sync is already active
  // (that race left Ace reviewing with no X for the whole run).
  const [showCancel, setShowCancel] = useState(false);
  useEffect(() => {
    if (isSyncing || justFinished) {
      setShowCancel(true);
    } else if (!mounted) {
      setShowCancel(false);
    }
  }, [isSyncing, justFinished, mounted]);

  useEffect(() => {
    setSyncTrackerMounted(mounted);
    return () => setSyncTrackerMounted(false);
  }, [mounted, setSyncTrackerMounted]);

  const stopTitle =
    syncKind === "queued"
      ? "Stop reviewing — remaining emails stay awaiting Ace"
      : "Stop sorting — remaining emails stay awaiting Ace";

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <aside
      role="status"
      aria-live="polite"
      aria-label={
        syncKind === "queued" ? "Ace queue review status" : "Inbox sort status"
      }
      data-dnd-ignore
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      className={BULK_FLYOUT_HOST_CLASSNAME}
    >
      <div
        className={cn(
          "flex origin-center flex-nowrap items-center gap-2.5",
          phase === "in" && "mp-flyout-pop",
          phase === "out" &&
            (retractFast ? "mp-flyout-retract-fast" : "mp-flyout-retract")
        )}
        style={style}
        onAnimationEnd={onAnimationEnd}
      >
        <div className={cn("mp-flyout-chunk", BULK_FLYOUT_PILL_CLASSNAME)}>
          <ClassifyingFlyoutStatus linger={phase === "out"} />
        </div>

        {showCancel ? (
          <div className="mp-flyout-chunk shrink-0">
            <CancelTaskButton
              onCancel={() => void forceReset()}
              title={stopTitle}
              spinMs={600}
              // Don't disable — disabled:opacity makes the X go clear on sync end / leave.
              className={cn(
                BULK_FLYOUT_CANCEL_CLASSNAME,
                !isSyncing && "pointer-events-none"
              )}
            />
          </div>
        ) : null}
      </div>
    </aside>,
    document.body
  );
}
