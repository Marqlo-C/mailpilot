"use client";

import { useEffect, useState, useTransition } from "react";
import type { JobApplication } from "@/lib/generated/prisma/client";
import {
  BotMessageSquare,
  Mail,
  RotateCcw,
  Send,
  Sparkles,
  Type,
} from "lucide-react";
import { Loader } from "@/components/ui/loader";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { toast } from "sonner";
import { formatToastError } from "@/lib/utils/ui/toast-format";

import {
  prepareDraftForReview,
  regenerateApplicationDraftAction,
  refineApplicationDraftAction,
  saveDraftEdits,
  sendSingleApplication,
} from "@/app/actions/dispatch";
import { ActionDialogShell } from "@/components/ui/composites/action-dialog-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldTrailingButton } from "@/components/ui/tactile/text-field";
import { PRIMARY_ACTION_BTN_CLASSNAME } from "@/components/ui/styles/primary-action-btn";
import { SECONDARY_ACTION_BTN_CLASSNAME } from "@/components/ui/styles/secondary-action-btn";
import { getCompanyLogoUrl } from "@/lib/utils/company-logo";
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

  const activeDraftKey = open && application ? application.id : null;
  const [prevActiveDraftKey, setPrevActiveDraftKey] = useState<string | null>(
    null
  );
  if (prevActiveDraftKey !== activeDraftKey) {
    setPrevActiveDraftKey(activeDraftKey);
    if (activeDraftKey) {
      setLoadingDraft(true);
      setError(null);
      setRefineInstruction("");
    }
  }

  useEffect(() => {
    if (!open || !application) return;

    let cancelled = false;

    void (async () => {
      const result = await prepareDraftForReview(application.id);
      if (cancelled) return;
      setLoadingDraft(false);
      if (!result.ok || !result.data) {
        setError(result.ok ? "Empty draft" : result.error);
        toast.error(formatToastError(result.error, "Draft creation failed"));
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
        toast.error(formatToastError(saved.error, "Failed to save draft"));
        return;
      }

      const toastId = toast.loading(
        action === "gmail-draft"
          ? "Saving to Gmail…"
          : "Sending application…"
      );
      const result = await sendSingleApplication(
        application.id,
        action === "gmail-draft"
      );
      if (!result.ok) {
        toast.error(formatToastError(result.error, "Failed to send"), {
          id: toastId,
        });
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
        toast.error(formatToastError(result.error, "Draft refine failed"));
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
        toast.error(formatToastError(result.error, "Draft creation failed"));
        return;
      }
      setSubject(result.data.subject);
      setBody(result.data.body);
      if (result.data.recipient) {
        setRecipient(result.data.recipient);
      }
      setError(null);
      toast.success("Draft rewritten");
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
      size="lg"
      contentClassName="h-[88vh] max-h-[900px] w-full"
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
              <Loader size="sm" />
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
              <Loader size="sm" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            <span>Send</span>
          </button>
        ) : null
      }
    >
      {loadingDraft ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm">
          <Loader size="md" />
          <TextShimmer>Preparing draft…</TextShimmer>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <Input
              id="draft-to"
              type="email"
              leadingIcon={Mail}
              clearable
              onClear={() => setRecipient("")}
              placeholder="recruiter@company.com"
              aria-label="To"
              value={recipient}
              disabled={busy}
              onChange={(e) => setRecipient(e.target.value)}
            />
            <Input
              id="draft-subject"
              leadingIcon={Type}
              clearable
              onClear={() => setSubject("")}
              placeholder="Subject"
              aria-label="Subject"
              value={subject}
              disabled={busy}
              onChange={(e) => setSubject(e.target.value)}
            />
            <Input
              id="draft-body"
              multiline
              rows={10}
              placeholder="Write your message…"
              aria-label="Message"
              value={body}
              disabled={busy}
              onChange={(e) => setBody(e.target.value)}
              inputClassName="min-h-56 resize-none text-sm leading-relaxed"
            />
            <p className="text-xs text-muted-foreground">
              Written as you (the applicant) to the hiring team. Keep it
              short, human, and grounded in your real skills.
            </p>
          </div>
          <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
            <Label htmlFor="draft-refine" className="text-xs">
              Refine with AI
            </Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                id="draft-refine"
                leadingIcon={BotMessageSquare}
                leadingIconClassName="size-[18px]"
                clearable
                onClear={() => setRefineInstruction("")}
                className="flex-1"
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
                trailing={
                  <FieldTrailingButton
                    aria-label="Refine"
                    disabled={busy || !refineInstruction.trim()}
                    onClick={handleRefine}
                  >
                    {refining ? (
                      <Loader size="sm" />
                    ) : (
                      <Sparkles className="size-3.5" aria-hidden />
                    )}
                  </FieldTrailingButton>
                }
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={busy}
                onClick={handleRetry}
                title="Rewrite this draft"
              >
                {retrying ? (
                  <Loader size="sm" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                Rewrite
              </Button>
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
