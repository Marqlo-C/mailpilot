"use client";

import { useEffect, useState, useTransition } from "react";
import type { JobApplication } from "@prisma/client";
import { Loader2, Mail, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  prepareDraftForReview,
  refineApplicationDraftAction,
  saveDraftEdits,
  sendSingleApplication,
} from "@/app/actions/dispatch";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

  const busy = pending || refining || loadingDraft;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review application email</DialogTitle>
          <DialogDescription>
            {application
              ? `${application.roleTitle ?? "Role"} at ${
                  application.companyName ?? "Company"
                }`
              : "Edit the draft before saving to Gmail or sending."}
          </DialogDescription>
        </DialogHeader>

        {loadingDraft ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Preparing draft…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="draft-to">To</Label>
              <Input
                id="draft-to"
                type="email"
                placeholder="recruiter@company.com"
                value={recipient}
                disabled={busy}
                onChange={(e) => setRecipient(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="draft-subject">Subject</Label>
              <Input
                id="draft-subject"
                value={subject}
                disabled={busy}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="draft-body">Message</Label>
              <textarea
                id="draft-body"
                className="min-h-56 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={body}
                disabled={busy}
                onChange={(e) => setBody(e.target.value)}
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
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
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
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            disabled={
              busy || !subject.trim() || !body.trim() || !recipient.trim()
            }
            onClick={() => persistThen("gmail-draft")}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Save to Gmail Drafts
          </Button>
          <Button
            type="button"
            disabled={
              busy || !subject.trim() || !body.trim() || !recipient.trim()
            }
            onClick={() => persistThen("send")}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
