"use client";

import { SyncControls } from "@/components/features/opportunities/sync-controls";
import {
  tabRailRowClassName,
  TabCountBadge,
  useTabRailClasses,
} from "@/components/ui/tactile/segmented-tabs";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LabelTooltip } from "@/components/ui/tooltip";
import { SUBSCRIPTION_TAB_LABEL } from "@/lib/utils/navigation/page-tabs";
import type { SubscriptionTab } from "@/lib/subscriptions/movement-rules";
import { cn } from "@/lib/utils";

const subscriptionTabDescriptions: Record<SubscriptionTab, string> = {
  active:
    "Detected newsletter and subscription lists eligible for one-click unsubscribe.",
  archive: "Archived senders and second-chance message batch cleanup.",
};

export type SubscriptionTableHeaderProps = {
  accountId: string;
  activeCount: number;
  archiveCount: number;
  dragDropZone?: string | null;
};

/**
 * Tab rail header and sync controls for the Subscriptions deck.
 */
export function SubscriptionTableHeader({
  accountId,
  activeCount,
  archiveCount,
  dragDropZone,
}: SubscriptionTableHeaderProps) {
  const {
    listClassName: segmentedTabsListClassName,
    triggerClassName: segmentedTabsTriggerClassName,
  } = useTabRailClasses();

  return (
    <div className={cn(tabRailRowClassName, "mb-0")}>
      <div className="flex items-center gap-1.5">
        <TabsList className={segmentedTabsListClassName} data-mp-tab-rail="">
          <LabelTooltip
            label={subscriptionTabDescriptions.active}
            side="bottom"
            contentClassName="text-left"
          >
            <span className="inline-flex">
              <TabsTrigger
                value="active"
                className={segmentedTabsTriggerClassName}
              >
                <span>{SUBSCRIPTION_TAB_LABEL.active}</span>
                <TabCountBadge count={activeCount} />
              </TabsTrigger>
            </span>
          </LabelTooltip>
          <LabelTooltip
            label={subscriptionTabDescriptions.archive}
            side="bottom"
            contentClassName="text-left"
          >
            <span className="inline-flex">
              <TabsTrigger
                value="archive"
                data-dnd-drop-zone="archive"
                className={cn(
                  segmentedTabsTriggerClassName,
                  dragDropZone === "archive" &&
                    "ring-2 ring-[#c21f10]/70 ring-offset-2 ring-offset-background"
                )}
              >
                <span>{SUBSCRIPTION_TAB_LABEL.archive}</span>
                <TabCountBadge count={archiveCount} />
              </TabsTrigger>
            </span>
          </LabelTooltip>
        </TabsList>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <SyncControls accountId={accountId} />
      </div>
    </div>
  );
}
