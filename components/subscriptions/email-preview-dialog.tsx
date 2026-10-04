"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CompanyLogo } from "@/components/ui/company-logo";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { faviconUrlForDomain, getCleanDomain } from "@/lib/domain";

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

function formatDisplayDate(raw: string): string {
  if (!raw) return "—";
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return raw;
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="space-y-3 border-b border-border/50 px-6 py-4 text-left">
          <div className="flex items-center gap-3">
            <CompanyLogo
              src={senderLogoSrc(senderEmail)}
              name={senderName ?? senderEmail}
              size="md"
            />
            <div className="min-w-0">
              <DialogTitle className="truncate text-base font-semibold">
                {senderName ?? senderEmail}
              </DialogTitle>
              <DialogDescription className="truncate text-xs text-muted-foreground">
                {senderEmail}
              </DialogDescription>
            </div>
          </div>
          <div className="min-w-0 space-y-1">
            <p className="truncate text-sm font-medium text-foreground">
              {loading ? "Loading subject…" : (email?.subject ?? "—")}
            </p>
            <p className="text-xs text-muted-foreground">
              {loading
                ? "Loading date…"
                : formatDisplayDate(email?.date ?? "")}
            </p>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 px-6 py-4">
          {loading ? (
            <div className="space-y-3">
              <div className="h-4 w-[66%] animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
              <div className="h-[50vh] animate-pulse rounded-md border border-border/50 bg-muted/40" />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Loading email…
              </div>
            </div>
          ) : error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : email ? (
            <iframe
              title={email.subject}
              srcDoc={email.htmlBody}
              className="h-[65vh] w-full rounded-md border border-border/50 bg-white"
              sandbox="allow-same-origin allow-popups"
            />
          ) : null}
        </div>

        <DialogFooter className="border-t border-border/50 px-6 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
