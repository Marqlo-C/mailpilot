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
  "status" | "onStopSync" | "syncActive"
>;

/**
 * Selection flyout that absorbs classifying status while open.
 * When sync is active, the single X asks clear-selection vs stop-classifying.
 */
export function BulkActionsWithClassifying(
  props: BulkActionsWithClassifyingProps
) {
  const classifying = useClassifyingFlyoutVisible();
  const { isSyncing, forceReset } = useSyncStatus();

  return (
    <BulkActionsFlyout
      {...props}
      status={classifying ? <ClassifyingFlyoutStatusPill /> : undefined}
      syncActive={isSyncing}
      onStopSync={() => void forceReset()}
    />
  );
}
