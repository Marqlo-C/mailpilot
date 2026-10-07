"use client";

import { useEffect, useState } from "react";

import {
  formatPreviewDisplayDate,
  PreviewLoadChrome,
} from "@/components/subscriptions/preview-load-chrome";
import { ActionDialogShell } from "@/components/ui/action-dialog-shell";
import { PRIMARY_ACTION_BTN_CLASSNAME } from "@/components/ui/primary-action-btn";
import { faviconUrlForDomain, getCleanDomain } from "@/lib/domain";
import { cn } from "@/lib/utils";

type EmailPreviewData = {
  subject: string;
  from: string;
  date: string;
  htmlBody: string;
  snippet: string;
};

type EmailPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  senderName: string | null;
  senderEmail: string;
  /** Gmail message id when known; otherwise latest from senderEmail is fetched. */
  messageId?: string | null;
};

function senderLogoSrc(email: string): string | null {
  const domain = getCleanDomain(email);
  return domain ? faviconUrlForDomain(domain) : null;
}

export function EmailPreviewDialog({
  open,
  onOpenChange,
  senderName,
  senderEmail,
  messageId = null,
}: EmailPreviewDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<EmailPreviewData | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setEmail(null);

    const params = new URLSearchParams();
    if (messageId) params.set("id", messageId);
    else params.set("from", senderEmail);

    fetch(`/api/gmail/message?${params.toString()}`)
      .then(async (res) => {
        const json = (await res.json()) as {
          success?: boolean;
          error?: string;
          subject?: string;
          from?: string;
          date?: string;
          htmlBody?: string;
          snippet?: string;
        };
        if (!res.ok || !json.success || !json.htmlBody) {
          throw new Error(json.error ?? "Failed to load email");
        }
        if (cancelled) return;
        setEmail({
          subject: json.subject ?? "(No subject)",
          from: json.from ?? senderEmail,
          date: json.date ?? "",
          htmlBody: json.htmlBody,
          snippet: json.snippet ?? "",
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load email");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, messageId, senderEmail]);

  return (
    <ActionDialogShell
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      showCancel={false}
      identity={{
        title: "Viewing last email from:",
        primary: senderEmail || "sender",
        secondary: senderName,
        logoSrc: senderLogoSrc(senderEmail),
        logoName: senderName ?? senderEmail,
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
      {error && !loading ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : (
        <PreviewLoadChrome
          loading={loading || !email}
          subject={email?.subject ?? "—"}
          dateLabel={formatPreviewDisplayDate(email?.date ?? "")}
          loadingMessage="Loading email…"
        >
          {email ? (
            <iframe
              title={email.subject}
              srcDoc={email.htmlBody}
              className="h-[65vh] w-full rounded-md border border-border/50 bg-white"
              sandbox="allow-same-origin allow-popups"
            />
          ) : null}
        </PreviewLoadChrome>
      )}
    </ActionDialogShell>
  );
}
