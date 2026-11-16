import { Archive, CheckCircle2, Trash2, Undo2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { deleteDismissedPermanently } from "@/app/actions/opportunities";
import {
  BULK_ACTION_BTN_CLASSNAME,
  BULK_ACTION_COUNT_DESTRUCTIVE_CLASSNAME,
  BULK_ACTION_COUNT_DISMISS_CLASSNAME,
  BULK_ACTION_DESTRUCTIVE_BTN_CLASSNAME,
  BULK_ACTION_DISMISS_BTN_CLASSNAME,
  BulkActionCount,
  BulkActionSeparator,
} from "@/components/ui/composites/bulk-actions-flyout";
import { BulkActionsWithClassifying } from "@/components/layout/bulk-actions-with-classifying";
import type { OpportunityCardVariant } from "@/components/features/opportunities/cards/opportunity-card";
import { variantToJobsTabKey } from "@/lib/opportunities/movement-rules";
import { runJobCardAction } from "@/lib/opportunities/run-job-move";

export type OpportunitiesBulkBarProps = {
  variant: OpportunityCardVariant;
  selectedIds: string[];
  archivedSelectedIds: string[];
  dismissedSelectedIds: string[];
  busy: boolean;
  onClearSelection: () => void;
  onAfterBatch: (message: string) => void;
  startBatch: (fn: () => Promise<void>) => void;
};

/**
 * Floating bulk-actions bar for batch transitions (restore, dismiss, archive, mark applied).
 */
export function OpportunitiesBulkBar({
  variant,
  selectedIds,
  archivedSelectedIds,
  dismissedSelectedIds,
  busy,
  onClearSelection,
  onAfterBatch,
  startBatch,
}: OpportunitiesBulkBarProps) {
  return (
    <BulkActionsWithClassifying
      selectedCount={selectedIds.length}
      onCancel={onClearSelection}
    >
      {variant === "history" ? (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              startBatch(async () => {
                const result = await runJobCardAction(
                  "history",
                  "restore",
                  selectedIds
                );
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                onAfterBatch("Restored");
              })
            }
            className={BULK_ACTION_BTN_CLASSNAME}
          >
            <Undo2 className="h-3.5 w-3.5" />
            Restore
            <BulkActionCount count={selectedIds.length} />
          </button>

          {archivedSelectedIds.length > 0 ? (
            <>
              <BulkActionSeparator />
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  startBatch(async () => {
                    const result = await runJobCardAction(
                      "history",
                      "dismiss",
                      archivedSelectedIds
                    );
                    if (!result.ok) {
                      toast.error(result.error);
                      return;
                    }
                    onAfterBatch("Dismissed — purge countdown started");
                  })
                }
                className={BULK_ACTION_DISMISS_BTN_CLASSNAME}
              >
                <XCircle className="h-3.5 w-3.5" />
                Dismiss Archived
                <BulkActionCount
                  count={archivedSelectedIds.length}
                  className={BULK_ACTION_COUNT_DISMISS_CLASSNAME}
                />
              </button>
            </>
          ) : null}

          {dismissedSelectedIds.length > 0 ? (
            <>
              <BulkActionSeparator />
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  startBatch(async () => {
                    await deleteDismissedPermanently(dismissedSelectedIds);
                    onAfterBatch("Deleted permanently");
                  })
                }
                className={BULK_ACTION_DESTRUCTIVE_BTN_CLASSNAME}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Permanently
                <BulkActionCount
                  count={dismissedSelectedIds.length}
                  className={BULK_ACTION_COUNT_DESTRUCTIVE_CLASSNAME}
                />
              </button>
            </>
          ) : null}
        </>
      ) : (
        <>
          {(variant === "leads" || variant === "applied") && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                startBatch(async () => {
                  const result = await runJobCardAction(
                    variantToJobsTabKey(variant),
                    "archive",
                    selectedIds
                  );
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  onAfterBatch("Archived");
                })
              }
              className={BULK_ACTION_BTN_CLASSNAME}
            >
              <Archive className="h-3.5 w-3.5" />
              Archive
              <BulkActionCount count={selectedIds.length} />
            </button>
          )}

          {variant === "leads" ? (
            <>
              <BulkActionSeparator />
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  startBatch(async () => {
                    const result = await runJobCardAction(
                      "leads",
                      "mark_applied",
                      selectedIds
                    );
                    if (!result.ok) {
                      toast.error(result.error);
                      return;
                    }
                    onAfterBatch("Marked as applied");
                  })
                }
                className={BULK_ACTION_BTN_CLASSNAME}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Mark Applied
                <BulkActionCount count={selectedIds.length} />
              </button>
            </>
          ) : null}

          {(variant === "leads" || variant === "applied") && (
            <BulkActionSeparator />
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              startBatch(async () => {
                const result = await runJobCardAction(
                  variantToJobsTabKey(variant),
                  "dismiss",
                  selectedIds
                );
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                onAfterBatch("Dismissed");
              })
            }
            className={BULK_ACTION_DISMISS_BTN_CLASSNAME}
          >
            <XCircle className="h-3.5 w-3.5" />
            Dismiss
            <BulkActionCount
              count={selectedIds.length}
              className={BULK_ACTION_COUNT_DISMISS_CLASSNAME}
            />
          </button>
        </>
      )}
    </BulkActionsWithClassifying>
  );
}
