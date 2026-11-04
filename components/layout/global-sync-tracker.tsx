"use client";

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
  useBulkActionsOpen,
  useFlyoutPresence,
} from "@/components/ui/composites/bulk-actions-flyout";
import { CancelTaskButton } from "@/components/ui/composites/cancel-task-button";
import { cn } from "@/lib/utils";

/**
 * Standalone classifying flyout — separate status pill + cancel circle.
 * Yields while selection is open; shared bar uses one X with a choice menu.
 */
export function GlobalSyncTracker() {
  const bulkOpen = useBulkActionsOpen();
  const visible = useClassifyingFlyoutVisible();
  const { isSyncing, forceReset } = useSyncStatus();
  const open = visible && !bulkOpen;
  const { mounted, phase, style, onAnimationEnd } = useFlyoutPresence(open);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <aside
      role="status"
      aria-live="polite"
      aria-label="Opportunity classification status"
      data-dnd-ignore
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      className={BULK_FLYOUT_HOST_CLASSNAME}
    >
      <div
        className={cn(
          "flex origin-center flex-nowrap items-center gap-2.5",
          phase === "in" && "mp-flyout-pop",
          phase === "out" && "mp-flyout-retract"
        )}
        style={style}
        onAnimationEnd={onAnimationEnd}
      >
        <div className={cn("mp-flyout-chunk", BULK_FLYOUT_PILL_CLASSNAME)}>
          <ClassifyingFlyoutStatus />
        </div>

        {isSyncing ? (
          <div className="mp-flyout-chunk shrink-0">
            <CancelTaskButton
              onCancel={() => void forceReset()}
              title="Cancel sync — remaining emails stay in the queue"
              spinMs={600}
              className={BULK_FLYOUT_CANCEL_CLASSNAME}
            />
          </div>
        ) : null}
      </div>
    </aside>,
    document.body
  );
}
