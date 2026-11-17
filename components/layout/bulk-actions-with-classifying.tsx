"use client";

import type { ComponentProps } from "react";

import { ClassifyingFlyoutStatus } from "@/components/layout/classifying-flyout-status";
import { useSyncStatus } from "@/components/layout/sync-status-provider";
import {
  BULK_FLYOUT_PILL_CLASSNAME,
  BulkActionsFlyout,
} from "@/components/ui/composites/bulk-actions-flyout";
import { TactileToastStack } from "@/components/ui/composites/tactile-toast-stack";
import { useTactileToasts } from "@/hooks/use-tactile-toasts";
import { cn } from "@/lib/utils";

type BulkActionsWithClassifyingProps = Omit<
  ComponentProps<typeof BulkActionsFlyout>,
  "status" | "onStopSync" | "syncActive" | "stopSyncLabel" | "toastActive" | "onDismissToast"
>;

/**
 * Selection flyout that coordinates with the bottom status slot (sync telemetry + stacked toasts) while open.
 * When multiple states coincide, the single X provides a cohesive menu between clearing selection,
 * stopping background sync, and dismissing the active notification.
 */
export function BulkActionsWithClassifying(
  props: BulkActionsWithClassifyingProps
) {
  const { isSyncing, syncKind, forceReset } = useSyncStatus();
  const { toasts, dismissToast, completeExit, pauseAll, resumeAll } =
    useTactileToasts();
  const stopSyncLabel =
    syncKind === "queued" ? "Stop reviewing" : "Stop sorting";

  const hasToasts = toasts.length > 0;
  const hasSync = isSyncing;
  const hasStatus = hasToasts || hasSync;

  return (
    <BulkActionsFlyout
      {...props}
      status={
        hasStatus ? (
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
                  <ClassifyingFlyoutStatus />
                </div>
              ) : undefined
            }
          />
        ) : undefined
      }
      syncActive={hasSync}
      stopSyncLabel={stopSyncLabel}
      onStopSync={() => void forceReset()}
    />
  );
}
