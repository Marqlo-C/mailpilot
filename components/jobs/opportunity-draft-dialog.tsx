"use client";

import { useEffect, useState, useTransition } from "react";
import type { JobOpportunity } from "@prisma/client";
import { Loader2, Mail, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  prepareOpportunityDraftForReview,
  refineOpportunityDraftAction,
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
 * Recipient is editable so users can fill or correct the To address.
 */
export function OpportunityDraftDialog({
  open,
  onOpenChange,
  opportunity,
  onCompleted,
}: OpportunityDraftDialogProps) {
  const [pending, startTransition] = useTransition();
  const [refining, startRefine] = useTransition();
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipient, setRecipient] = useState("");
  const [refineInstruction, setRefineInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !opportunity) return;

    let cancelled = false;
    setLoadingDraft(true);
    setError(null);
    setRefineInstruction("");
    setRecipient(opportunity.recipientEmail ?? "");

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
      setRecipient(result.data.recipient ?? opportunity.recipientEmail ?? "");
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
        recipientEmail: recipient,
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

  function handleRefine() {
    if (!opportunity || !refineInstruction.trim()) return;
    startRefine(async () => {
      const result = await refineOpportunityDraftAction(
        opportunity.id,
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Review application email</DialogTitle>
          <DialogDescription>
            {opportunity
              ? `${opportunity.title} at ${opportunity.company}`
              : "Draft"}
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
              <Label htmlFor="opp-draft-to">To</Label>
              <Input
                id="opp-draft-to"
                type="email"
                placeholder="recruiter@company.com"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="opp-draft-subject">Subject</Label>
              <Input
                id="opp-draft-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="opp-draft-body">Body</Label>
              <textarea
                id="opp-draft-body"
                className="min-h-[220px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
              <Label htmlFor="opp-draft-refine" className="text-xs">
                Refine with AI
              </Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="opp-draft-refine"
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
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            disabled={busy || Boolean(error)}
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
            disabled={busy || Boolean(error)}
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
