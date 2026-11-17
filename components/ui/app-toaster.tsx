"use client";

import { useClassifyingFlyoutVisible } from "@/components/layout/classifying-flyout-status";
import { useBulkActionsOpen } from "@/components/ui/composites/bulk-actions-flyout";
import { TactileToastDeck } from "@/components/ui/composites/tactile-toast-deck";

/**
 * Centered bottom toast deck for MailPilot.
 * Coordinates elevation with the Bulk Actions flyout and Global Sync tracker
 * so notifications glide up to tier 2 (~4rem elevation) when bottom controls are active.
 */
export function AppToaster() {
  const bulkOpen = useBulkActionsOpen();
  const classifyingVisible = useClassifyingFlyoutVisible();
  const isElevated = bulkOpen || classifyingVisible;

  return <TactileToastDeck isElevated={isElevated} />;
}
