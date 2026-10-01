"use client";

import {
  useEffect,
  useId,
  useState,
  useTransition,
  type ChangeEvent,
} from "react";
import type { JobOpportunity } from "@prisma/client";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  Mail,
  Paperclip,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  generateOpportunityResumeAction,
  getOpportunityResumeStateAction,
  prepareOpportunityDraftForReview,
  regenerateOpportunityDraftAction,
  refineOpportunityDraftAction,
  refineOpportunityResumeAction,
  saveOpportunityDraftEdits,
  sendOpportunityApplication,
  type DraftAttachmentInput,
  type OpportunityResumePreview,
  type OriginalEmailPreview,
} from "@/app/actions/opportunities";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type OpportunityDraftDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunity: JobOpportunity | null;
  onCompleted?: () => void;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function estimateBase64Bytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function formatEmailDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function pdfBase64ToBlobUrl(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}

async function fileToAttachment(file: File): Promise<DraftAttachmentInput> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return {
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    base64: btoa(binary),
  };
}

/**
 * Landscape dual-pane review for JobOpportunity direct-email drafts:
 * left = email + attach controls, right = resume preview / generate.
 */
export function OpportunityDraftDialog({
  open,
  onOpenChange,
  opportunity,
  onCompleted,
}: OpportunityDraftDialogProps) {
  const fileInputId = useId();
  const [pending, startTransition] = useTransition();
  const [refining, startRefine] = useTransition();
  const [retrying, startRetry] = useTransition();
  const [resumeBusy, startResume] = useTransition();
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipient, setRecipient] = useState("");
  const [refineInstruction, setRefineInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [originalEmail, setOriginalEmail] =
    useState<OriginalEmailPreview | null>(null);
  const [showOriginalEmail, setShowOriginalEmail] = useState(false);
  const [extraFiles, setExtraFiles] = useState<File[]>([]);
  const [resume, setResume] = useState<OpportunityResumePreview | null>(null);
  const [resumePdfUrl, setResumePdfUrl] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [resumeRefineInstruction, setResumeRefineInstruction] = useState("");
  const [resumeStateLoaded, setResumeStateLoaded] = useState(false);
  const [includeSummary, setIncludeSummary] = useState(false);
  const [attachResume, setAttachResume] = useState(true);
  const [showRationale, setShowRationale] = useState(false);

  useEffect(() => {
    if (!open || !opportunity) return;

    let cancelled = false;
    setLoadingDraft(true);
    setError(null);
    setRefineInstruction("");
    setRecipient(opportunity.recipientEmail ?? "");
    setOriginalEmail(null);
    setShowOriginalEmail(false);
    setExtraFiles([]);
    setResume(null);
    setResumeError(null);
    setResumeRefineInstruction("");
    setResumeStateLoaded(false);
    setIncludeSummary(false);
    setAttachResume(true);
    setShowRationale(false);

    void (async () => {
      const [draftResult, resumeResult] = await Promise.all([
        prepareOpportunityDraftForReview(opportunity.id),
        getOpportunityResumeStateAction(opportunity.id),
      ]);
      if (cancelled) return;

      setLoadingDraft(false);

      if (!draftResult.ok || !draftResult.data) {
        setError(draftResult.ok ? "Empty draft" : draftResult.error);
        toast.error(draftResult.ok ? "Empty draft" : draftResult.error);
      } else {
        setSubject(draftResult.data.subject);
        setBody(draftResult.data.body);
        setRecipient(
          draftResult.data.recipient ?? opportunity.recipientEmail ?? ""
        );
        setOriginalEmail(draftResult.data.originalEmail);
      }

      if (resumeResult.ok && resumeResult.data) {
        setIncludeSummary(resumeResult.data.defaultIncludeSummary);
        setAttachResume(resumeResult.data.defaultAttachPdf);
        if (resumeResult.data.resume) {
          setResume(resumeResult.data.resume);
          if (typeof resumeResult.data.resume.includeSummary === "boolean") {
            setIncludeSummary(resumeResult.data.resume.includeSummary);
          }
        } else {
          setResume(null);
        }
        setResumeStateLoaded(true);
      } else {
        setResumeStateLoaded(true);
        if (!resumeResult.ok) {
          setResumeError(resumeResult.error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, opportunity]);

  useEffect(() => {
    if (!resume?.pdfBase64) {
      setResumePdfUrl(null);
      return;
    }
    const url = pdfBase64ToBlobUrl(resume.pdfBase64);
    setResumePdfUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [resume?.pdfBase64]);

  function applyResumeResult(data: OpportunityResumePreview) {
    setResume(data);
    setResumeError(null);
    setResumeStateLoaded(true);
    if (typeof data.includeSummary === "boolean") {
      setIncludeSummary(data.includeSummary);
    }
  }

  function generateResume(summaryPreference = includeSummary) {
    if (!opportunity) return;
    const wasRegenerate = Boolean(resume);
    startResume(async () => {
      setResumeError(null);
      const result = await generateOpportunityResumeAction(
        opportunity.id,
        summaryPreference
      );
      if (!result.ok || !result.data) {
        const message = result.ok ? "Empty resume" : result.error;
        setResumeError(message);
        toast.error(message);
        return;
      }
      applyResumeResult(result.data);
      toast.success(
        wasRegenerate ? "Resume regenerated" : "Tailored resume generated"
      );
    });
  }

  function handleResumeRefine() {
    if (!opportunity || !resumeRefineInstruction.trim()) return;
    startResume(async () => {
      const result = await refineOpportunityResumeAction(
        opportunity.id,
        resumeRefineInstruction.trim(),
        resume?.experiences ?? null,
        includeSummary
      );
      if (!result.ok || !result.data) {
        toast.error(result.ok ? "Empty resume" : result.error);
        return;
      }
      applyResumeResult(result.data);
      setResumeRefineInstruction("");
      toast.success("Resume refined");
    });
  }

  function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    if (selected.length === 0) return;
    setExtraFiles((prev) => {
      const next = [...prev];
      for (const file of selected) {
        if (next.some((f) => f.name === file.name && f.size === file.size)) {
          continue;
        }
        if (next.length >= 10) {
          toast.error("You can attach up to 10 extra files");
          break;
        }
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name} is larger than 10MB`);
          continue;
        }
        next.push(file);
      }
      return next;
    });
    event.target.value = "";
  }

  function removeFile(index: number) {
    setExtraFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function persistThen(action: "gmail-draft" | "send") {
    if (!opportunity) return;
    if (attachResume && !resume) {
      toast.error("Generate a tailored resume first, or turn off attach.");
      return;
    }
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

      let attachments: DraftAttachmentInput[] | undefined;
      try {
        attachments =
          extraFiles.length > 0
            ? await Promise.all(extraFiles.map(fileToAttachment))
            : undefined;
      } catch {
        toast.error("Failed to read attachments");
        return;
      }

      const result = await sendOpportunityApplication(
        opportunity.id,
        action === "gmail-draft",
        attachments,
        {
          experiences: resume?.experiences ?? [],
          projects: resume?.projects ?? [],
          tailoredSummary: includeSummary
            ? (resume?.tailoredSummary ?? null)
            : null,
          tailoredSkills: resume?.tailoredSkills,
          includeSummary,
          attachResume,
        }
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

  function handleRetry() {
    if (!opportunity) return;
    startRetry(async () => {
      const result = await regenerateOpportunityDraftAction(opportunity.id);
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

  const busy =
    pending || refining || retrying || loadingDraft || resumeBusy;
  const originalFrom =
    originalEmail?.fromName?.trim() ||
    originalEmail?.fromEmail?.trim() ||
    "sender";
  const hasSavedPdf = Boolean(resume?.pdfBase64);
  const resumeSizeLabel = resume?.pdfBase64
    ? formatSize(estimateBase64Bytes(resume.pdfBase64))
    : null;

  function handleAttachResumeChange(checked: boolean) {
    setAttachResume(checked);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex h-[88vh] max-h-[900px] flex-col gap-0 overflow-hidden p-0 transition-all duration-300 ease-in-out",
          attachResume ? "w-[94vw] max-w-6xl" : "w-full max-w-2xl"
        )}
      >
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4 pr-12 text-left">
          <DialogTitle>Review application email</DialogTitle>
          <DialogDescription>
            {opportunity
              ? `${opportunity.title} at ${opportunity.company}`
              : "Draft"}
          </DialogDescription>
        </DialogHeader>

        {loadingDraft ? (
          <div className="flex flex-1 items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Preparing draft…
          </div>
        ) : error ? (
          <p className="flex-1 px-6 py-8 text-sm text-destructive">{error}</p>
        ) : (
          <div
            className={cn(
              "grid min-h-0 flex-1 transition-all duration-300 ease-in-out",
              attachResume
                ? "grid-cols-1 lg:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)]"
                : "grid-cols-1"
            )}
          >
            {/* Left: email & dispatch — 3-zone vertical flex */}
            <div
              className={cn(
                "flex h-full min-h-0 flex-col justify-between",
                attachResume && "border-b border-border/60 lg:border-b-0 lg:border-r"
              )}
            >
              {/* Zone A: header fields */}
              <div className="flex-none space-y-3 px-4 pt-4">
                {originalEmail ? (
                  <div className="space-y-2">
                    <button
                      type="button"
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setShowOriginalEmail((v) => !v)}
                      aria-expanded={showOriginalEmail}
                    >
                      <Mail className="h-3.5 w-3.5" />
                      <span>Original email from {originalFrom}</span>
                      {showOriginalEmail ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </button>
                    {showOriginalEmail ? (
                      <div className="max-h-28 overflow-y-auto whitespace-pre-wrap rounded-md border border-border/60 bg-muted/40 p-3 font-sans text-xs text-muted-foreground">
                        <p>
                          <span className="font-medium text-foreground/80">
                            From:
                          </span>{" "}
                          {[originalEmail.fromName, originalEmail.fromEmail]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </p>
                        {formatEmailDate(originalEmail.date) ? (
                          <p>
                            <span className="font-medium text-foreground/80">
                              Date:
                            </span>{" "}
                            {formatEmailDate(originalEmail.date)}
                          </p>
                        ) : null}
                        <p>
                          <span className="font-medium text-foreground/80">
                            Subject:
                          </span>{" "}
                          {originalEmail.subject?.trim() || "(no subject)"}
                        </p>
                        <div className="mt-2 border-t border-border/50 pt-2">
                          {originalEmail.body.trim() || "(empty body)"}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-1.5">
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
                <div className="space-y-1.5">
                  <Label htmlFor="opp-draft-subject">Subject</Label>
                  <Input
                    id="opp-draft-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    disabled={busy}
                  />
                </div>
              </div>

              {/* Zone B: body editor fills remaining height */}
              <div className="my-2 flex min-h-0 flex-1 flex-col px-4">
                <div className="flex min-h-0 flex-1 flex-col gap-1.5">
                  <Label htmlFor="opp-draft-body" className="flex-none">
                    Body
                  </Label>
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-input bg-background">
                    <textarea
                      id="opp-draft-body"
                      className="min-h-0 w-full flex-1 resize-none overflow-y-auto border-0 bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-0"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      disabled={busy}
                    />
                    <div className="flex flex-none items-center gap-1.5 border-t border-border/60 px-2 py-1.5">
                      <Input
                        id="opp-draft-refine"
                        placeholder="Ask Ace AI to refine (e.g., make it punchier, mention FastAPI)…"
                        value={refineInstruction}
                        onChange={(e) => setRefineInstruction(e.target.value)}
                        disabled={busy}
                        className="h-8 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleRefine();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 shrink-0 px-2"
                        disabled={busy}
                        onClick={handleRetry}
                        title="Generate a fresh draft"
                      >
                        {retrying ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        Regenerate
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-8 shrink-0 px-2"
                        disabled={busy || !refineInstruction.trim()}
                        onClick={handleRefine}
                      >
                        {refining ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        Refine
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Zone C: attach + actions */}
              <div className="mt-auto flex-none">
                <div className="space-y-2 px-4 pb-2">
                  <div className="flex items-center justify-between border-y border-border/60 px-1 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="attach-resume"
                        checked={attachResume}
                        onChange={(e) =>
                          handleAttachResumeChange(e.target.checked)
                        }
                        disabled={busy}
                        className="h-4 w-4 shrink-0 cursor-pointer rounded border border-input accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      <Label
                        htmlFor="attach-resume"
                        className="cursor-pointer text-sm font-medium"
                      >
                        Attach Tailored Resume
                      </Label>
                    </div>
                    {attachResume ? (
                      <Badge
                        variant="outline"
                        className="gap-1 font-mono text-xs font-normal"
                      >
                        {hasSavedPdf ? (
                          <>
                            <FileText className="h-3 w-3" />
                            Resume Ready
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="h-3 w-3" />
                            Needs Generation
                          </>
                        )}
                      </Badge>
                    ) : null}
                  </div>

                  {attachResume && resume ? (
                    <div className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1 text-xs">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">
                        {resume.filename}
                        {resumeSizeLabel ? ` (${resumeSizeLabel})` : ""}
                      </span>
                      <button
                        type="button"
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => handleAttachResumeChange(false)}
                        disabled={busy}
                        aria-label="Remove resume attachment"
                        title="Do not attach resume"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : null}

                  {extraFiles.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {extraFiles.map((file, index) => (
                        <li
                          key={`${file.name}-${file.size}-${index}`}
                          className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1 text-xs"
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">
                            {file.name} ({formatSize(file.size)})
                          </span>
                          <button
                            type="button"
                            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            onClick={() => removeFile(index)}
                            disabled={busy}
                            aria-label={`Remove ${file.name}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <DialogFooter className="gap-2 border-t border-border/60 p-4 sm:justify-between">
                  <label
                    htmlFor={fileInputId}
                    className={cn(
                      "inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border/50 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground",
                      busy && "pointer-events-none opacity-50"
                    )}
                    title="Attach files"
                  >
                    <Paperclip className="h-4 w-4" />
                    <input
                      id={fileInputId}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileSelect}
                      disabled={busy}
                    />
                  </label>
                  <div className="flex flex-col-reverse gap-2 sm:flex-row">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => onOpenChange(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => persistThen("gmail-draft")}
                    >
                      {pending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Mail className="h-4 w-4" />
                      )}
                      Save Draft
                    </Button>
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() => persistThen("send")}
                    >
                      {pending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      Send Email
                    </Button>
                  </div>
                </DialogFooter>
              </div>
            </div>

            {/* Right: resume workspace — only when attach is on */}
            {attachResume ? (
              <div className="flex h-full min-h-0 flex-col bg-muted/20 duration-300 animate-in fade-in-0 slide-in-from-right-4">
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="opp-include-summary"
                      checked={includeSummary}
                      onCheckedChange={setIncludeSummary}
                      disabled={busy}
                    />
                    <Label
                      htmlFor="opp-include-summary"
                      className="text-xs font-medium"
                    >
                      Include Summary
                    </Label>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() => generateResume()}
                  >
                    {resumeBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : resume ? (
                      <RefreshCw className="h-4 w-4" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {resume ? "Regenerate" : "Generate Resume"}
                  </Button>
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-4">
                  {resumeBusy && !resume ? (
                    <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Tailoring resume…
                    </div>
                  ) : resumeError && !resume ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                      <p className="text-sm text-destructive">{resumeError}</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => generateResume()}
                      >
                        Retry
                      </Button>
                    </div>
                  ) : resume && resumePdfUrl ? (
                    <>
                      <iframe
                        title="Tailored resume preview"
                        src={resumePdfUrl}
                        className="min-h-0 w-full flex-1 rounded-md border border-border/60 bg-background"
                      />
                      {resume.strategyRationale ? (
                        <div className="shrink-0 rounded-md border border-border/50 bg-background/80">
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-foreground/90"
                            onClick={() => setShowRationale((v) => !v)}
                            aria-expanded={showRationale}
                          >
                            <span>ATS Strategy & Match Rationale</span>
                            {showRationale ? (
                              <ChevronUp className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )}
                          </button>
                          {showRationale ? (
                            <div className="max-h-40 space-y-2 overflow-y-auto border-t border-border/50 px-3 py-2 text-xs text-muted-foreground">
                              <div>
                                <p className="font-medium text-foreground/80">
                                  Role Fit Analysis
                                </p>
                                <p className="mt-0.5 leading-relaxed">
                                  {resume.strategyRationale.roleFitAnalysis}
                                </p>
                              </div>
                              <div>
                                <p className="font-medium text-foreground/80">
                                  Prioritized Skills & Why
                                </p>
                                <p className="mt-0.5 leading-relaxed">
                                  {
                                    resume.strategyRationale
                                      .selectedSkillsReasoning
                                  }
                                </p>
                              </div>
                              <div>
                                <p className="font-medium text-foreground/80">
                                  Featured Roles & Projects
                                </p>
                                <p className="mt-0.5 leading-relaxed">
                                  {
                                    resume.strategyRationale
                                      .featuredExperiencesReasoning
                                  }
                                </p>
                                <p className="mt-1 leading-relaxed">
                                  {
                                    resume.strategyRationale
                                      .featuredProjectsReasoning
                                  }
                                </p>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                        <Input
                          id="opp-resume-refine"
                          placeholder="Refine: emphasize Python, distributed systems…"
                          value={resumeRefineInstruction}
                          onChange={(e) =>
                            setResumeRefineInstruction(e.target.value)
                          }
                          disabled={busy}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleResumeRefine();
                            }
                          }}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="shrink-0"
                          disabled={busy || !resumeRefineInstruction.trim()}
                          onClick={handleResumeRefine}
                        >
                          {resumeBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4" />
                          )}
                          Refine
                        </Button>
                      </div>
                    </>
                  ) : resumeStateLoaded ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                      <FileText className="h-10 w-10 text-muted-foreground/50" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">
                          No tailored resume yet
                        </p>
                        <p className="max-w-sm text-xs text-muted-foreground">
                          Click Generate Resume to tailor a PDF using this
                          opportunity&apos;s title, company, and description.
                          Nothing runs until you ask.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Checking saved resume…
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
