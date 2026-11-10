"use client";

import { useEffect, useState } from "react";

import {
  formatPreviewDisplayDate,
  PreviewLoadChrome,
} from "@/components/subscriptions/preview-load-chrome";
import { ActionDialogShell } from "@/components/ui/composites/action-dialog-shell";
import { PRIMARY_ACTION_BTN_CLASSNAME } from "@/components/ui/styles/primary-action-btn";
import { faviconUrlForDomain, getCleanDomain } from "@/lib/utils/domain";
import { cn } from "@/lib/utils";

type EmailPreviewData = {
  subject: string;
  from: string;
  date: string;
  htmlBody: string;
  snippet: string;
};

export type ViewEmailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefer this Gmail id when known (Job Radar / draft original). */
  messageId?: string | null;
  /** Lookup latest message from this sender when `messageId` is absent. */
  senderEmail?: string | null;
  senderName?: string | null;
  identityTitle?: string;
  /**
   * When true, identity primary/secondary are sender email/name
   * (Subscriptions “Latest Message”). Otherwise subject/from (Job Radar).
   */
  identityEmphasizeSender?: boolean;
  initialSubject?: string | null;
  initialFrom?: string | null;
};

function senderLogoSrc(email: string | null | undefined): string | null {
  if (!email) return null;
  const domain = getCleanDomain(email);
  return domain ? faviconUrlForDomain(domain) : null;
}

/**
 * Shared Gmail message preview — same fetch + loading chrome for
 * Subscriptions Latest Message and Job Radar original email.
 */
export function ViewEmailDialog({
  open,
  onOpenChange,
  messageId = null,
  senderEmail = null,
  senderName = null,
  identityTitle = "Viewing original email:",
  identityEmphasizeSender = false,
  initialSubject = null,
  initialFrom = null,
}: ViewEmailDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<EmailPreviewData | null>(null);

  useEffect(() => {
    if (!open) {
      setEmail(null);
      setError(null);
      setLoading(false);
      return;
    }
    if (!messageId && !senderEmail) {
      setError("No message to load");
      setEmail(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setEmail(null);

    const params = new URLSearchParams();
    if (messageId) params.set("id", messageId);
    else if (senderEmail) params.set("from", senderEmail);

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
          from: json.from ?? senderEmail ?? "Unknown sender",
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

  const resolvedFrom = email?.from || initialFrom || senderEmail || null;
  const resolvedSubject =
    email?.subject || initialSubject || "Original Email";
  const logoEmail = senderEmail || initialFrom || resolvedFrom;

  const identity = identityEmphasizeSender
    ? {
        title: identityTitle,
        primary: senderEmail || resolvedFrom || "sender",
        secondary: senderName,
        logoSrc: senderLogoSrc(logoEmail),
        logoName: senderName ?? senderEmail ?? "sender",
        logoSize: "lg" as const,
      }
    : {
        title: identityTitle,
        primary: resolvedSubject,
        secondary: resolvedFrom,
        logoSrc: senderLogoSrc(logoEmail),
        logoName: resolvedFrom || "Email",
        logoSize: "lg" as const,
      };

  return (
    <ActionDialogShell
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      showCancel={false}
      identity={identity}
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
