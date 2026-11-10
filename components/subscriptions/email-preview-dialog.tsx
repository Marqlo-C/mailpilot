"use client";

import { ViewEmailDialog } from "@/components/ui/composites/view-email-dialog";

type EmailPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  senderName: string | null;
  senderEmail: string;
  /** Gmail message id when known; otherwise latest from senderEmail is fetched. */
  messageId?: string | null;
};

/** Subscriptions entry — same shell as Job Radar original-email preview. */
export function EmailPreviewDialog({
  open,
  onOpenChange,
  senderName,
  senderEmail,
  messageId = null,
}: EmailPreviewDialogProps) {
  return (
    <ViewEmailDialog
      open={open}
      onOpenChange={onOpenChange}
      messageId={messageId}
      senderEmail={senderEmail}
      senderName={senderName}
      identityTitle="Viewing latest message from:"
      identityEmphasizeSender
    />
  );
}
