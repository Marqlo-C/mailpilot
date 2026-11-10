"use client";

import type { Subscription } from "@prisma/client";
import { SnapshotDialog } from "@/components/features/subscriptions/snapshot-dialog";
import { EmailPreviewDialog } from "@/components/features/subscriptions/email-preview-dialog";
import { ConfirmActionDialog } from "@/components/ui/composites/confirm-action-dialog";
import {
  SnapshotPreviewDialog,
  UnsubscribeCleanupDialog,
  senderLogoSrc,
} from "./parts";
import type { useSubscriptionsActions } from "@/hooks/use-subscriptions-actions";

export type SubscriptionViewDialogsProps = {
  actions: ReturnType<typeof useSubscriptionsActions>;
  selectedIds: string[];
  selectedSubscriptions: Subscription[];
  active: Subscription[];
};

/**
 * Encapsulated dialog cluster for Subscriptions view.
 */
export function SubscriptionViewDialogs({
  actions,
  selectedIds,
  selectedSubscriptions,
  active,
}: SubscriptionViewDialogsProps) {
  return (
    <>
      <SnapshotDialog
        open={actions.briefingOpen}
        onOpenChange={actions.setBriefingOpen}
        senders={actions.briefingTargets}
        pending={actions.briefingPending}
        onGenerate={(range) => void actions.runBriefingDigest(range)}
      />

      <EmailPreviewDialog
        open={Boolean(actions.selectedEmailSub)}
        onOpenChange={(open) => {
          if (!open) actions.setSelectedEmailSub(null);
        }}
        senderName={actions.selectedEmailSub?.senderName ?? null}
        senderEmail={actions.selectedEmailSub?.senderEmail ?? ""}
      />

      <SnapshotPreviewDialog
        viewingBriefing={actions.viewingBriefing}
        onClose={() => actions.setViewingBriefing(null)}
        deletePending={actions.deletePending}
        onDelete={(briefing) => {
          void actions.deleteBriefingsForSubscriptions([briefing.subscriptionId]);
        }}
        briefingPending={actions.briefingPending}
        onNewBriefing={actions.openBriefingFromViewing}
        briefingPreviewLoading={actions.briefingPreviewLoading}
        onIframeLoad={() => actions.setBriefingPreviewLoading(false)}
        active={active}
      />

      <UnsubscribeCleanupDialog
        open={actions.unsubscribeDialogOpen}
        onClose={actions.closeUnsubscribeDialog}
        pending={actions.pending}
        batchConfirmOpen={actions.batchConfirmOpen}
        selectedIds={selectedIds}
        selectedSubscriptions={selectedSubscriptions}
        selected={actions.selected}
        cleanupChoice={actions.cleanupChoice}
        onCleanupChoiceChange={actions.setCleanupChoice}
        onConfirm={() => actions.runUnsubscribe(actions.cleanupChoice)}
        error={actions.error}
      />

      <ConfirmActionDialog
        open={Boolean(actions.deleteRecordTarget)}
        onOpenChange={(open) => {
          if (!open && !actions.deleteRecordPending) {
            actions.setDeleteRecordTarget(null);
          }
        }}
        title="Deleting record for:"
        primary={actions.deleteRecordTarget?.senderEmail ?? "sender"}
        secondary={actions.deleteRecordTarget?.senderName ?? null}
        logoSrc={
          actions.deleteRecordTarget
            ? senderLogoSrc(actions.deleteRecordTarget.senderEmail)
            : null
        }
        logoName={
          actions.deleteRecordTarget?.senderName ??
          actions.deleteRecordTarget?.senderEmail ??
          "sender"
        }
        description="Past history for this sender will be deleted."
        emphasis="Are you sure? This can't be undone."
        confirmLabel="Delete"
        pending={actions.deleteRecordPending}
        onConfirm={actions.runDeleteUnsubscribedRecord}
      />
    </>
  );
}
