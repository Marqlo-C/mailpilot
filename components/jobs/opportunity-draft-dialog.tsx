"use client";

import { useEffect, useState, useTransition } from "react";
import type { JobOpportunity } from "@prisma/client";
import { Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";

import {
  prepareOpportunityDraftForReview,
  saveOpportunityDraftEdits,
  sendOpportunityApplication,
} from "@/app/actions/opportunities";
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

type OpportunityDraftDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunity: JobOpportunity | null;
  onCompleted?: () => void;
};

/**
 * In-app review/edit for JobOpportunity direct-email drafts.
 * Will not open a usable draft when recipientEmail is missing (server-gated).
 */
export function OpportunityDraftDialog({
  open,
  onOpenChange,
  opportunity,
  onCompleted,
}: OpportunityDraftDialogProps) {
  const [pending, startTransition] = useTransition();
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipient, setRecipient] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !opportunity) return;

    let cancelled = false;
    setLoadingDraft(true);
    setError(null);

    void (async () => {
      const result = await prepareOpportunityDraftForReview(opportunity.id);
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
  }, [open, opportunity]);

  function persistThen(action: "gmail-draft" | "send") {
    if (!opportunity) return;
    startTransition(async () => {
      const saved = await saveOpportunityDraftEdits(opportunity.id, {
        subject,
        body,
      });
      if (!saved.ok) {
        toast.error(saved.error);
        return;
      }
      const result = await sendOpportunityApplication(
        opportunity.id,
        action === "gmail-draft"
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        action === "gmail-draft" ? "Saved to Gmail drafts" : "Application sent"
      );
      onOpenChange(false);
      onCompleted?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Review application email</DialogTitle>
          <DialogDescription>
            {opportunity
              ? `${opportunity.title} at ${opportunity.company}`
              : "Draft"}
            {recipient ? ` → ${recipient}` : ""}
          </DialogDescription>
        </DialogHeader>

        {loadingDraft ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Preparing draft…
          </div>
        ) : error ? (
          <p className="py-6 text-sm text-destructive">{error}</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="opp-draft-subject">Subject</Label>
              <Input
                id="opp-draft-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="opp-draft-body">Body</Label>
              <textarea
                id="opp-draft-body"
                className="min-h-[220px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                disabled={pending}
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            disabled={pending || loadingDraft || Boolean(error)}
            onClick={() => persistThen("gmail-draft")}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Save Gmail draft
          </Button>
          <Button
            type="button"
            disabled={pending || loadingDraft || Boolean(error)}
            onClick={() => persistThen("send")}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
