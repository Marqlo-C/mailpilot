"use client";

import type { ComponentProps } from "react";

import {
  ClassifyingFlyoutStatusPill,
  useClassifyingFlyoutVisible,
} from "@/components/layout/classifying-flyout-status";
import { useSyncStatus } from "@/components/layout/sync-status-provider";
import { BulkActionsFlyout } from "@/components/ui/composites/bulk-actions-flyout";

type BulkActionsWithClassifyingProps = Omit<
  ComponentProps<typeof BulkActionsFlyout>,
  "status" | "onStopSync" | "syncActive" | "stopSyncLabel"
>;

/**
 * Selection flyout that absorbs sync status while open.
 * When sync is active, the single X asks clear-selection vs stop reviewing/sorting.
 */
export function BulkActionsWithClassifying(
  props: BulkActionsWithClassifyingProps
) {
  const classifying = useClassifyingFlyoutVisible();
  const { isSyncing, syncKind, forceReset } = useSyncStatus();
  const stopSyncLabel =
    syncKind === "queued" ? "Stop reviewing" : "Stop sorting";

  return (
    <BulkActionsFlyout
      {...props}
      status={classifying ? <ClassifyingFlyoutStatusPill /> : undefined}
      syncActive={isSyncing}
      stopSyncLabel={stopSyncLabel}
      onStopSync={() => void forceReset()}
    />
  );
}
