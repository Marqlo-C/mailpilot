"use client";

import { useEffect, useState, useTransition } from "react";
import type { JobApplication } from "@prisma/client";
import { Loader2, Mail, RefreshCw, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  prepareDraftForReview,
  regenerateApplicationDraftAction,
  refineApplicationDraftAction,
  saveDraftEdits,
  sendSingleApplication,
} from "@/app/actions/dispatch";
import { ActionDialogShell } from "@/components/ui/action-dialog-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PRIMARY_ACTION_BTN_CLASSNAME } from "@/components/ui/primary-action-btn";
import { SECONDARY_ACTION_BTN_CLASSNAME } from "@/components/ui/secondary-action-btn";
import { getCompanyLogoUrl } from "@/lib/company-logo";
import { cn } from "@/lib/utils";

type DraftReviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: JobApplication | null;
  onCompleted?: () => void;
};

/**
 * In-app review/edit of a generated application email before Gmail draft or send.
 */
export function DraftReviewDialog({
  open,
  onOpenChange,
  application,
  onCompleted,
}: DraftReviewDialogProps) {
  const [pending, startTransition] = useTransition();
  const [refining, startRefine] = useTransition();
  const [retrying, startRetry] = useTransition();
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipient, setRecipient] = useState("");
  const [refineInstruction, setRefineInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !application) return;

    let cancelled = false;
    setLoadingDraft(true);
    setError(null);
    setRefineInstruction("");

    void (async () => {
      const result = await prepareDraftForReview(application.id);
      if (cancelled) return;
      setLoadingDraft(false);
      if (!result.ok || !result.data) {
        setError(result.ok ? "Empty draft" : result.error);
        toast.error(result.ok ? "Empty draft" : result.error);
        return;
      }
      setSubject(result.data.subject);
      setBody(result.data.body);
      setRecipient(result.data.recipient ?? "");
    })();

    return () => {
      cancelled = true;
    };
  }, [open, application]);

  function persistThen(action: "gmail-draft" | "send") {
    if (!application) return;
    startTransition(async () => {
      const saved = await saveDraftEdits(application.id, {
        subject,
        body,
        recipientEmail: recipient,
      });
      if (!saved.ok) {
        toast.error(saved.error);
        return;
      }

      const toastId = toast.loading(
        action === "gmail-draft"
          ? "Saving draft to Gmail…"
          : "Sending application…"
      );
      const result = await sendSingleApplication(
        application.id,
        action === "gmail-draft"
      );
      if (!result.ok) {
        toast.error(result.error, { id: toastId });
        return;
      }
      toast.success(
        action === "gmail-draft"
          ? "Draft saved to Gmail"
          : "Application sent",
        { id: toastId }
      );
      onOpenChange(false);
      onCompleted?.();
    });
  }

  function handleRefine() {
    if (!application || !refineInstruction.trim()) return;
    startRefine(async () => {
      const result = await refineApplicationDraftAction(
        application.id,
        refineInstruction.trim()
      );
      if (!result.ok || !result.data) {
        toast.error(result.ok ? "Empty refine result" : result.error);
        return;
      }
      setSubject(result.data.subject);
      setBody(result.data.body);
      setRefineInstruction("");
      toast.success("Draft refined");
    });
  }

  function handleRetry() {
    if (!application) return;
    startRetry(async () => {
      const result = await regenerateApplicationDraftAction(application.id);
      if (!result.ok || !result.data) {
        toast.error(result.ok ? "Empty draft" : result.error);
        return;
      }
      setSubject(result.data.subject);
      setBody(result.data.body);
      if (result.data.recipient) {
        setRecipient(result.data.recipient);
      }
      setError(null);
      toast.success("Draft regenerated");
    });
  }

  const busy = pending || refining || retrying || loadingDraft;
  const canPersist =
    !busy &&
    Boolean(subject.trim() && body.trim() && recipient.trim());
  const showComposerActions = !loadingDraft;

  const companyName = application?.companyName ?? "Company";
  const roleTitle = application?.roleTitle ?? "Draft";

  return (
    <ActionDialogShell
      open={open}
      onOpenChange={onOpenChange}
      pending={pending}
      size="xl"
      contentClassName="sm:max-w-2xl"
      identity={{
        title: "Responding to:",
        primary: roleTitle,
        secondary: companyName,
        emphasize: "secondary",
        logoSrc: getCompanyLogoUrl(companyName),
        logoName: companyName,
        logoSize: "lg",
      }}
      onCancel={() => onOpenChange(false)}
      secondaryAction={
        showComposerActions ? (
          <button
            type="button"
            disabled={!canPersist}
            onClick={() => persistThen("gmail-draft")}
            className={cn(SECONDARY_ACTION_BTN_CLASSNAME, "h-9 px-3.5")}
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Mail className="h-3.5 w-3.5" />
            )}
            <span>Save Draft</span>
          </button>
        ) : null
      }
      primaryAction={
        showComposerActions ? (
          <button
            type="button"
            disabled={!canPersist}
            onClick={() => persistThen("send")}
            className={cn(PRIMARY_ACTION_BTN_CLASSNAME, "h-9 px-3.5")}
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            <span>Send</span>
          </button>
        ) : null
      }
    >
      {loadingDraft ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Preparing draft…
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <Label
                htmlFor="draft-to"
                className="w-16 shrink-0 select-none text-xs font-medium text-muted-foreground"
              >
                To:
              </Label>
              <input
                id="draft-to"
                type="email"
                placeholder="recruiter@company.com"
                value={recipient}
                disabled={busy}
                onChange={(e) => setRecipient(e.target.value)}
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none focus:outline-none focus:ring-0 disabled:opacity-50"
              />
            </div>
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <Label
                htmlFor="draft-subject"
                className="w-16 shrink-0 select-none text-xs font-medium text-muted-foreground"
              >
                Subject:
              </Label>
              <input
                id="draft-subject"
                value={subject}
                disabled={busy}
                onChange={(e) => setSubject(e.target.value)}
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none focus:outline-none focus:ring-0 disabled:opacity-50"
              />
            </div>
            <div className="space-y-2 p-3">
              <Label htmlFor="draft-body" className="sr-only">
                Message
              </Label>
              <textarea
                id="draft-body"
                className="min-h-56 w-full resize-none border-0 bg-transparent p-0 text-sm leading-relaxed outline-none focus:outline-none focus-visible:ring-0 disabled:opacity-50"
                value={body}
                disabled={busy}
                onChange={(e) => setBody(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Written as you (the applicant) to the hiring team. Keep it
                short, human, and grounded in your real skills.
              </p>
            </div>
          </div>
          <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
            <Label htmlFor="draft-refine" className="text-xs">
              Refine with AI
            </Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="draft-refine"
                placeholder="e.g., Make it punchier, mention FastAPI, sound more casual..."
                value={refineInstruction}
                onChange={(e) => setRefineInstruction(e.target.value)}
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleRefine();
                  }
                }}
              />
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={handleRetry}
                  title="Generate a fresh draft"
                >
                  {retrying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Retry
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy || !refineInstruction.trim()}
                  onClick={handleRefine}
                >
                  {refining ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Refine
                </Button>
              </div>
            </div>
          </div>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
        </div>
      )}
    </ActionDialogShell>
  );
}
