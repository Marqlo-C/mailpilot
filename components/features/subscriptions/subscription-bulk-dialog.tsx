"use client";

import type { Subscription } from "@/lib/generated/prisma/client";
import { UserRoundMinus } from "lucide-react";
import { Loader } from "@/components/ui/loader";
import { SnapshotIcon } from "@/components/ui/icons/snapshot-icon";
import {
  BULK_ACTION_BTN_CLASSNAME,
  BULK_ACTION_COUNT_DISMISS_CLASSNAME,
  BULK_ACTION_DISMISS_BTN_CLASSNAME,
  BulkActionCount,
  BulkActionSection,
  BulkActionSeparator,
} from "@/components/ui/composites/bulk-actions-flyout";
import { BulkActionsWithClassifying } from "@/components/layout/bulk-actions-with-classifying";

export type SubscriptionBulkBarProps = {
  selectedIds: string[];
  selectedSubscriptions: Subscription[];
  selectedWithBriefingIds: string[];
  pending: boolean;
  briefingPending: boolean;
  deletePending: boolean;
  onClearSelection: () => void;
  onRequestUnsubscribe: (ids: string[]) => void;
  onOpenBriefing: (targets: Subscription[]) => void;
  onDeleteBriefings: (ids: string[]) => void;
};

/**
 * Floating bulk action toolbar for active subscriptions.
 */
export function SubscriptionBulkBar({
  selectedIds,
  selectedSubscriptions,
  selectedWithBriefingIds,
  pending,
  briefingPending,
  deletePending,
  onClearSelection,
  onRequestUnsubscribe,
  onOpenBriefing,
  onDeleteBriefings,
}: SubscriptionBulkBarProps) {
  if (selectedIds.length === 0) return null;

  return (
    <BulkActionsWithClassifying
      selectedCount={selectedIds.length}
      onCancel={onClearSelection}
      trailing={
        <button
          type="button"
          disabled={pending || briefingPending || deletePending}
          onClick={() => onRequestUnsubscribe(selectedIds)}
          className={BULK_ACTION_BTN_CLASSNAME}
        >
          {pending ? (
            <Loader size="sm" />
          ) : (
            <UserRoundMinus className="h-3.5 w-3.5" />
          )}
          Unsubscribe
          <BulkActionCount count={selectedIds.length} />
        </button>
      }
    >
      <BulkActionSection
        labelText="Snapshot"
        label={
          <SnapshotIcon
            width={14}
            height={14}
            className="text-[#e4f7f3]/60"
          />
        }
      >
        <button
          type="button"
          disabled={pending || briefingPending || deletePending}
          onClick={() => onOpenBriefing(selectedSubscriptions)}
          className={BULK_ACTION_BTN_CLASSNAME}
        >
          {briefingPending ? (
            <Loader size="sm" />
          ) : null}
          Send
          <BulkActionCount count={selectedIds.length} />
        </button>

        {selectedWithBriefingIds.length > 0 ? (
          <>
            <BulkActionSeparator />
            <button
              type="button"
              disabled={pending || briefingPending || deletePending}
              onClick={() => onDeleteBriefings(selectedWithBriefingIds)}
              className={BULK_ACTION_DISMISS_BTN_CLASSNAME}
            >
              {deletePending ? (
                <Loader size="sm" />
              ) : null}
              Delete
              <BulkActionCount
                count={selectedWithBriefingIds.length}
                className={BULK_ACTION_COUNT_DISMISS_CLASSNAME}
              />
            </button>
          </>
        ) : null}
      </BulkActionSection>
    </BulkActionsWithClassifying>
  );
}
