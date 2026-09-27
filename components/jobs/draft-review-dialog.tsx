"use client";

import { useEffect, useState, useTransition } from "react";
import type { JobApplication } from "@prisma/client";
import { Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";

import {
  prepareDraftForReview,
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
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipient, setRecipient] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !application) return;

    let cancelled = false;
    setLoadingDraft(true);
    setError(null);

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
      setRecipient(result.data.recipient);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, application]);

  function persistThen(
    action: "gmail-draft" | "send"
  ) {
    if (!application) return;
    startTransition(async () => {
      const saved = await saveDraftEdits(application.id, { subject, body });
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
                value={recipient}
                readOnly
                className="bg-muted/40"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="draft-subject">Subject</Label>
              <Input
                id="draft-subject"
                value={subject}
                disabled={pending}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="draft-body">Message</Label>
              <textarea
                id="draft-body"
                className="min-h-56 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={body}
                disabled={pending}
                onChange={(e) => setBody(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Written as you (the applicant) to the hiring team — greetings
                should never address your own name.
              </p>
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
            disabled={pending || loadingDraft || !subject.trim() || !body.trim()}
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
            disabled={pending || loadingDraft || !subject.trim() || !body.trim()}
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
