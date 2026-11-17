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
import { TactileToastStack } from "@/components/ui/composites/tactile-toast-stack";
import { useTactileToasts } from "@/hooks/use-tactile-toasts";
import { cn } from "@/lib/utils";

/**
 * Global primary bottom status slot host.
 * Coordinates background sync telemetry and stacked toast notifications.
 * On multiselect: leaves first, yielding the bottom bar to selection actions.
 * On clear selection: multiselect leaves first, then this remounts.
 */
export function GlobalSyncTracker() {
  const bulkOpen = useBulkActionsOpen();
  const { selectionRequested, setSyncTrackerMounted } = useBulkActionsHandoff();
  const isSyncVisible = useClassifyingFlyoutVisible();
  const { isSyncing, justFinished, syncKind, forceReset } = useSyncStatus();
  const { toasts, dismissToast, completeExit, pauseAll, resumeAll } =
    useTactileToasts();

  const hasSync = isSyncVisible;
  const hasToasts = toasts.length > 0;
  const open = (hasSync || hasToasts) && !selectionRequested && !bulkOpen;
  const { mounted, phase, style, onAnimationEnd } = useFlyoutPresence(open);

  // Yielding to multiselect — purpose-built shorter leave
  const retractFast = phase === "out" && selectionRequested;

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

  const ariaLabel = hasToasts
    ? "Notification status"
    : syncKind === "queued"
    ? "Ace queue review status"
    : "Inbox sort status";

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <aside
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
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
        <div className="mp-flyout-chunk shrink-0">
          <TactileToastStack
            toasts={toasts}
            onDismiss={dismissToast}
            onCompleteExit={completeExit}
            onPause={pauseAll}
            onResume={resumeAll}
            underlay={
              hasSync ? (
                <div
                  className={cn(
                    BULK_FLYOUT_PILL_CLASSNAME,
                    "mp-flyout-chunk flex h-11 w-full min-w-0 items-center justify-center px-3"
                  )}
                >
                  <ClassifyingFlyoutStatus linger={phase === "out"} />
                </div>
              ) : undefined
            }
          />
        </div>

        {showCancel ? (
          <div className="mp-flyout-chunk shrink-0">
            <CancelTaskButton
              onCancel={() => void forceReset()}
              title={stopTitle}
              spinMs={600}
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
