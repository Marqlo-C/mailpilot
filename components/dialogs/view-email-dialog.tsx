"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { ActionDialogShell } from "@/components/ui/composites/action-dialog-shell";
import { PRIMARY_ACTION_BTN_CLASSNAME } from "@/components/ui/styles/primary-action-btn";
import { cn } from "@/lib/utils";

export type ViewEmailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageId: string | null;
  initialSubject?: string | null;
  initialFrom?: string | null;
};

export function ViewEmailDialog({
  open,
  onOpenChange,
  messageId,
  initialSubject,
  initialFrom,
}: ViewEmailDialogProps) {
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailData, setEmailData] = useState<{
    htmlBody: string;
    subject: string;
    from: string;
    date: string;
  } | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  async function handleLoadOriginalEmail(targetMessageId: string) {
    setEmailLoading(true);
    setEmailError(null);
    try {
      const res = await fetch(
        `/api/gmail/message?id=${encodeURIComponent(targetMessageId)}`
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to load email from Gmail");
      }
      setEmailData(data);
    } catch (err) {
      setEmailError(
        err instanceof Error ? err.message : "Error loading message"
      );
    } finally {
      setEmailLoading(false);
    }
  }

  useEffect(() => {
    if (open && messageId) {
      void handleLoadOriginalEmail(messageId);
    } else if (!open) {
      setEmailData(null);
      setEmailError(null);
      setEmailLoading(false);
    }
  }, [open, messageId]);

  return (
    <ActionDialogShell
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      showCancel={false}
      identity={{
        title: "Viewing original email:",
        primary: emailData?.subject || initialSubject || "Original Email",
        secondary: emailData?.from || initialFrom || null,
        logoName: emailData?.from || initialFrom || "Email",
        logoSize: "lg",
      }}
      primaryAction={
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className={cn(PRIMARY_ACTION_BTN_CLASSNAME, "h-9 px-3.5")}
        >
          Close
        </button>
      }
    >
      {emailLoading && (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Fetching message from Gmail...
        </div>
      )}

      {emailError && (
        <div className="rounded-lg bg-destructive/10 p-4 text-xs text-destructive">
          {emailError}
        </div>
      )}

      {emailData && (
        <div className="space-y-3">
          <div className="space-y-1 border-b pb-2 text-xs text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">From:</span>{" "}
              {emailData.from}
            </div>
            <div>
              <span className="font-medium text-foreground">Date:</span>{" "}
              {emailData.date}
            </div>
          </div>
          <iframe
            title="Original Email Preview"
            srcDoc={emailData.htmlBody}
            sandbox="allow-same-origin"
            className="h-[500px] w-full rounded border border-border/50 bg-white"
          />
        </div>
      )}
    </ActionDialogShell>
  );
}
