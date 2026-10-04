"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
} from "react";
import type { JobOpportunity } from "@prisma/client";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  Mail,
  Paperclip,
  RotateCcw,
  Send,
  Sparkles,
  WandSparkles,
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
import { Button } from "@/components/ui/button";
import { CompanyLogo } from "@/components/ui/company-logo";
import { getCompanyLogoUrl } from "@/lib/company-logo";
import { CancelTaskButton } from "@/components/ui/cancel-task-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  abortablePromise,
  isAbortError,
  useTaskAbortManager,
} from "@/hooks/use-task-abort-manager";
import { cn } from "@/lib/utils";

/** Stable task ids for abortable AI work in the review draft modal. */
const TASK_RESUME = "resume-generation";
const TASK_EMAIL_REFINE = "email-refine";
const TASK_EMAIL_DRAFT = "email-draft";

const EMAIL_REFINE_PLACEHOLDER =
  "Ask Ace AI to refine email (e.g., make it more concise, emphasize relevant experience, adjust tone)…";
const RESUME_REFINE_PLACEHOLDER =
  "Ask Ace AI to refine resume (e.g., highlight key skills, focus on impact metrics, adjust project focus)…";

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
  const {
    startTask,
    finishTask,
    cancelTask,
    cancelAll,
    isTaskActive,
  } = useTaskAbortManager();
  const emailSnapshotRef = useRef<{ subject: string; body: string } | null>(
    null
  );
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipient, setRecipient] = useState("");
  const [refineTarget, setRefineTarget] = useState<"email" | "resume">(
    "email"
  );
  const [refinePrompt, setRefinePrompt] = useState("");
  const [resumeAction, setResumeAction] = useState<
    "regenerate" | "refine" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [originalEmail, setOriginalEmail] =
    useState<OriginalEmailPreview | null>(null);
  const [extraFiles, setExtraFiles] = useState<File[]>([]);
  const [resume, setResume] = useState<OpportunityResumePreview | null>(null);
  const [resumePdfUrl, setResumePdfUrl] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [resumeStateLoaded, setResumeStateLoaded] = useState(false);
  const [includeSummary, setIncludeSummary] = useState(false);
  const [attachResume, setAttachResume] = useState(true);
  const [showRationale, setShowRationale] = useState(false);

  const resumeBusy = isTaskActive(TASK_RESUME);
  const refining = isTaskActive(TASK_EMAIL_REFINE);
  const retrying = isTaskActive(TASK_EMAIL_DRAFT);

  useEffect(() => {
    if (!open || !opportunity) return;

    let cancelled = false;
    cancelAll();
    setLoadingDraft(true);
    setError(null);
    setRefinePrompt("");
    setRefineTarget("email");
    setResumeAction(null);
    setRecipient(opportunity.recipientEmail ?? "");
    setOriginalEmail(null);
    setExtraFiles([]);
    setResume(null);
    setResumeError(null);
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
      cancelAll();
    };
  }, [open, opportunity, cancelAll]);

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
    setResumeAction("regenerate");
    const signal = startTask(TASK_RESUME);
    void (async () => {
      setResumeError(null);
      try {
        const result = await abortablePromise(
          generateOpportunityResumeAction(opportunity.id, summaryPreference),
          signal
        );
        if (signal.aborted) return;
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
      } catch (error) {
        if (isAbortError(error) || signal.aborted) {
          return;
        }
        const message =
          error instanceof Error ? error.message : "Failed to generate resume";
        setResumeError(message);
        toast.error(message);
      } finally {
        finishTask(TASK_RESUME, signal);
        setResumeAction((current) =>
          current === "regenerate" ? null : current
        );
      }
    })();
  }

  function handleResumeRefine() {
    if (!opportunity || !refinePrompt.trim()) return;
    setResumeAction("refine");
    const signal = startTask(TASK_RESUME);
    void (async () => {
      try {
        const result = await abortablePromise(
          refineOpportunityResumeAction(
            opportunity.id,
            refinePrompt.trim(),
            resume?.experiences ?? null,
            includeSummary
          ),
          signal
        );
        if (signal.aborted) return;
        if (!result.ok || !result.data) {
          toast.error(result.ok ? "Empty resume" : result.error);
          return;
        }
        applyResumeResult(result.data);
        setRefinePrompt("");
        toast.success("Resume refined");
      } catch (error) {
        if (isAbortError(error) || signal.aborted) return;
        toast.error(
          error instanceof Error ? error.message : "Failed to refine resume"
        );
      } finally {
        finishTask(TASK_RESUME, signal);
        setResumeAction((current) => (current === "refine" ? null : current));
      }
    })();
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
    if (
      action === "send" &&
      attachResume &&
      !resume?.pdfBase64
    ) {
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

      const shouldAttachResume =
        attachResume && Boolean(resume?.pdfBase64);
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
          attachResume: shouldAttachResume,
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
    if (!opportunity || !refinePrompt.trim()) return;
    emailSnapshotRef.current = { subject, body };
    const signal = startTask(TASK_EMAIL_REFINE);
    void (async () => {
      try {
        const result = await abortablePromise(
          refineOpportunityDraftAction(opportunity.id, refinePrompt.trim()),
          signal
        );
        if (signal.aborted) return;
        if (!result.ok || !result.data) {
          toast.error(result.ok ? "Empty refine result" : result.error);
          return;
        }
        setSubject(result.data.subject);
        setBody(result.data.body);
        setRefinePrompt("");
        emailSnapshotRef.current = null;
        toast.success("Draft refined");
      } catch (error) {
        if (isAbortError(error) || signal.aborted) {
          const snapshot = emailSnapshotRef.current;
          if (snapshot) {
            setSubject(snapshot.subject);
            setBody(snapshot.body);
          }
          emailSnapshotRef.current = null;
          return;
        }
        toast.error(
          error instanceof Error ? error.message : "Failed to refine draft"
        );
      } finally {
        finishTask(TASK_EMAIL_REFINE, signal);
      }
    })();
  }

  function handleRetry() {
    if (!opportunity) return;
    emailSnapshotRef.current = { subject, body };
    const signal = startTask(TASK_EMAIL_DRAFT);
    void (async () => {
      try {
        const result = await abortablePromise(
          regenerateOpportunityDraftAction(opportunity.id),
          signal
        );
        if (signal.aborted) return;
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
        emailSnapshotRef.current = null;
        toast.success("Draft regenerated");
      } catch (error) {
        if (isAbortError(error) || signal.aborted) {
          const snapshot = emailSnapshotRef.current;
          if (snapshot) {
            setSubject(snapshot.subject);
            setBody(snapshot.body);
          }
          emailSnapshotRef.current = null;
          return;
        }
        toast.error(
          error instanceof Error ? error.message : "Failed to regenerate draft"
        );
      } finally {
        finishTask(TASK_EMAIL_DRAFT, signal);
      }
    })();
  }

  function handleCancelTask(taskId: string) {
    if (taskId === TASK_EMAIL_REFINE || taskId === TASK_EMAIL_DRAFT) {
      const snapshot = emailSnapshotRef.current;
      if (snapshot) {
        setSubject(snapshot.subject);
        setBody(snapshot.body);
        emailSnapshotRef.current = null;
      }
    }
    if (taskId === TASK_RESUME) {
      setResumeAction(null);
    }
    cancelTask(taskId);
  }

  function handleDialogOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      cancelAll();
      emailSnapshotRef.current = null;
    }
    onOpenChange(nextOpen);
  }

  const busy =
    pending || refining || retrying || loadingDraft || resumeBusy;
  const originalFrom =
    originalEmail?.fromName?.trim() ||
    originalEmail?.fromEmail?.trim() ||
    "sender";
  const resumeSizeLabel = resume?.pdfBase64
    ? formatSize(estimateBase64Bytes(resume.pdfBase64))
    : null;

  function handleAttachResumeChange(checked: boolean) {
    setAttachResume(checked);
    if (!checked) setRefineTarget("email");
  }

  const effectiveRefineTarget = attachResume ? refineTarget : "email";
  const hasTailoredResume = Boolean(resume?.pdfBase64);
  const showGenerateResume =
    effectiveRefineTarget === "resume" && !hasTailoredResume;
  const primaryActionLabel = showGenerateResume ? "Generate" : "Regenerate";
  const primaryActionTitle = showGenerateResume
    ? "Generate a tailored resume"
    : effectiveRefineTarget === "email"
      ? "Generate a fresh draft"
      : "Regenerate tailored resume";

  function handleUnifiedRegenerate() {
    if (effectiveRefineTarget === "email") {
      handleRetry();
      return;
    }
    generateResume();
  }

  function handleUnifiedRefine() {
    if (effectiveRefineTarget === "email") {
      handleRefine();
      return;
    }
    handleResumeRefine();
  }

  const regeneratingTarget =
    effectiveRefineTarget === "email"
      ? retrying
      : resumeBusy && resumeAction === "regenerate";
  const refiningTarget =
    effectiveRefineTarget === "email"
      ? refining
      : resumeBusy && resumeAction === "refine";
  const refinePlaceholder =
    effectiveRefineTarget === "email"
      ? EMAIL_REFINE_PLACEHOLDER
      : RESUME_REFINE_PLACEHOLDER;
  const refineDisabled =
    busy ||
    !refinePrompt.trim() ||
    (effectiveRefineTarget === "resume" && !hasTailoredResume);

  const isGeneratingResume = resumeBusy;
  const isGeneratingEmail = refining || retrying;
  const isSending = pending;
  const isAwaitingResume =
    attachResume && !hasTailoredResume && !isGeneratingResume;
  const isSendDisabled =
    isSending || isGeneratingResume || isGeneratingEmail || isAwaitingResume;
  const sendDisabledReason = isGeneratingResume
    ? "Generating tailored resume..."
    : isAwaitingResume
      ? "Generate and review your tailored resume before sending, or uncheck 'Attach Auto-Tailored Resume'."
      : isGeneratingEmail
        ? "Finish the current email task before sending."
        : null;
  const isSaveDraftDisabled =
    pending || loadingDraft || refining || retrying;

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className={cn(
          "flex h-[88vh] max-h-[900px] flex-col gap-0 overflow-hidden p-0 transition-all duration-300 ease-in-out",
          attachResume ? "w-[94vw] max-w-6xl" : "w-full max-w-2xl"
        )}
      >
        <DialogHeader className="shrink-0 space-y-0 border-b border-border/60 px-6 pb-3 pt-4 pr-12 text-left">
          <div className="flex items-start gap-3">
            {opportunity ? (
              <CompanyLogo
                src={
                  opportunity.logoUrl ||
                  getCompanyLogoUrl(
                    opportunity.company,
                    opportunity.companyDomain
                  )
                }
                name={opportunity.company}
                size="lg"
              />
            ) : null}
            <div className="-mt-0.5 flex min-w-0 flex-col">
              <DialogTitle className="text-lg font-semibold leading-tight tracking-tight">
                Responding to:
              </DialogTitle>
              <DialogDescription className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                {opportunity ? (
                  <>
                    <span className="truncate">{opportunity.title}</span>
                    <span className="text-muted-foreground/60">•</span>
                    <span className="truncate text-foreground">
                      {opportunity.company}
                    </span>
                  </>
                ) : (
                  "Draft"
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {loadingDraft ? (
          <div className="flex flex-1 items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Preparing draft…
          </div>
        ) : error ? (
          <p className="flex-1 px-6 py-8 text-sm text-destructive">{error}</p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Tier 2: main split */}
            <div
              className={cn(
                "grid min-h-0 flex-1 gap-4 px-6 py-4 transition-all duration-300 ease-in-out",
                attachResume
                  ? "grid-cols-1 lg:grid-cols-2"
                  : "grid-cols-1"
              )}
            >
              {/* Left: seamless email composer */}
              <div className="flex h-full min-h-0 flex-col divide-y overflow-hidden rounded-lg border bg-background text-sm focus-within:ring-1 focus-within:ring-ring">
                <div className="flex flex-none items-center px-3 py-2">
                  <Label
                    htmlFor="opp-draft-to"
                    className="w-16 shrink-0 select-none text-xs font-medium text-muted-foreground"
                  >
                    To:
                  </Label>
                  <input
                    id="opp-draft-to"
                    type="email"
                    placeholder="recruiter@company.com"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    disabled={busy}
                    className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-foreground outline-none ring-0 focus:outline-none focus:ring-0 disabled:opacity-50"
                  />
                </div>

                <div className="flex flex-none items-center justify-between gap-2 px-3 py-2">
                  <div className="flex min-w-0 flex-1 items-center">
                    <Label
                      htmlFor="opp-draft-subject"
                      className="w-16 shrink-0 select-none text-xs font-medium text-muted-foreground"
                    >
                      Subject:
                    </Label>
                    <input
                      id="opp-draft-subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      disabled={busy}
                      className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-sm text-foreground outline-none ring-0 focus:outline-none focus:ring-0 disabled:opacity-50"
                    />
                  </div>
                  {originalEmail ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0 gap-1.5 rounded-md bg-muted/40 px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="hidden sm:inline">
                            View original email
                          </span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-[min(24rem,calc(100vw-2rem))] max-h-80 overflow-y-auto p-3"
                        onCloseAutoFocus={(e) => e.preventDefault()}
                      >
                        <div className="space-y-1.5 whitespace-pre-wrap font-sans text-xs text-muted-foreground">
                          <p className="text-sm font-medium text-foreground">
                            Original email from {originalFrom}
                          </p>
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
                          <div className="mt-2 border-t border-border/50 pt-2 leading-relaxed">
                            {originalEmail.body.trim() || "(empty body)"}
                          </div>
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>

                <div className="relative flex min-h-0 flex-1 flex-col">
                  <Label htmlFor="opp-draft-body" className="sr-only">
                    Body
                  </Label>
                  <textarea
                    id="opp-draft-body"
                    className="min-h-0 w-full flex-1 resize-none overflow-y-auto border-0 bg-transparent p-3 pb-10 text-sm leading-relaxed outline-none focus:outline-none focus-visible:ring-0 disabled:opacity-50"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    disabled={busy}
                  />
                  <div className="pointer-events-none absolute bottom-2 left-2 right-2 flex items-end justify-between gap-2">
                    {extraFiles.length > 0 ? (
                      <ul className="pointer-events-auto flex min-w-0 flex-1 flex-wrap gap-1.5">
                        {extraFiles.map((file, index) => (
                          <li
                            key={`${file.name}-${file.size}-${index}`}
                            className="inline-flex max-w-[160px] items-center gap-1.5 rounded-md border border-border/60 bg-background/95 px-2 py-1 text-xs shadow-sm"
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
                    ) : (
                      <span />
                    )}
                    <div className="pointer-events-auto flex shrink-0 items-center">
                      <input
                        id={fileInputId}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={handleFileSelect}
                        disabled={busy}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        title="Attach file"
                        disabled={busy}
                        className="h-7 w-7 rounded-full p-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => {
                          document.getElementById(fileInputId)?.click();
                        }}
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: flush PDF + ATS rationale */}
              {attachResume ? (
                <div className="mt-0 flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-muted/10 pt-0 duration-300 animate-in fade-in-0 slide-in-from-right-4">
                  <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-0">
                    {resumeBusy && !resume ? (
                      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-3 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Tailoring resume…
                        </div>
                        <CancelTaskButton
                          title="Cancel generation"
                          onCancel={() => handleCancelTask(TASK_RESUME)}
                        />
                      </div>
                    ) : resumeError && !resume ? (
                      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-3 text-center">
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
                          className="min-h-0 w-full flex-1 border-0 bg-background"
                        />
                        {resume.strategyRationale ? (
                          <div className="mx-2 mb-2 shrink-0 rounded-md border border-border/50 bg-background/80">
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
                      </>
                    ) : resumeStateLoaded ? (
                      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                        <FileText className="h-10 w-10 text-muted-foreground/50" />
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">
                            No Auto-Tailored Resume Yet
                          </p>
                          <p className="max-w-sm text-xs text-muted-foreground">
                            Select &apos;Resume&apos; in the toolbar below and
                            click &apos;Generate&apos; to tailor a PDF for this
                            opportunity. Nothing runs until you ask.
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

            {/* Tier 3: unified Ace AI bar */}
            <div className="flex flex-none items-center gap-3 border-t bg-muted/20 px-6 py-2">
              {attachResume ? (
                <div
                  className="inline-flex h-8 shrink-0 items-center rounded-md border border-border/60 bg-background p-0.5"
                  role="group"
                  aria-label="Ace AI target"
                >
                  <button
                    type="button"
                    className={cn(
                      "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                      effectiveRefineTarget === "email"
                        ? "bg-muted text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => setRefineTarget("email")}
                    disabled={busy}
                  >
                    Email
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                      effectiveRefineTarget === "resume"
                        ? "bg-muted text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => setRefineTarget("resume")}
                    disabled={busy}
                  >
                    Resume
                  </button>
                </div>
              ) : null}

              <Input
                id="opp-ace-refine"
                placeholder={refinePlaceholder}
                value={refinePrompt}
                onChange={(e) => setRefinePrompt(e.target.value)}
                disabled={busy}
                className="h-8 flex-1 bg-background text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleUnifiedRefine();
                  }
                }}
              />

              {regeneratingTarget ? (
                <div className="inline-flex h-8 shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 px-2.5 text-xs"
                    disabled
                  >
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {primaryActionLabel}
                  </Button>
                  <CancelTaskButton
                    title={
                      showGenerateResume
                        ? "Cancel generation"
                        : "Cancel regeneration"
                    }
                    onCancel={() =>
                      handleCancelTask(
                        effectiveRefineTarget === "email"
                          ? TASK_EMAIL_DRAFT
                          : TASK_RESUME
                      )
                    }
                  />
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 gap-1 px-2.5 text-xs"
                  disabled={busy}
                  onClick={handleUnifiedRegenerate}
                  title={primaryActionTitle}
                >
                  {showGenerateResume ? (
                    <Sparkles className="h-3.5 w-3.5" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  {primaryActionLabel}
                </Button>
              )}

              {refiningTarget ? (
                <div className="inline-flex h-8 shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 gap-1 px-2.5 text-xs"
                    disabled
                  >
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Refine
                  </Button>
                  <CancelTaskButton
                    title="Cancel refine"
                    onCancel={() =>
                      handleCancelTask(
                        effectiveRefineTarget === "email"
                          ? TASK_EMAIL_REFINE
                          : TASK_RESUME
                      )
                    }
                  />
                </div>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 shrink-0 gap-1 px-2.5 text-xs"
                  disabled={refineDisabled}
                  onClick={handleUnifiedRefine}
                >
                  <WandSparkles className="h-3.5 w-3.5" />
                  Refine
                </Button>
              )}
            </div>

            {/* Tier 4: configuration strip */}
            <div className="flex flex-none items-center justify-between gap-4 border-t bg-background px-6 py-2">
              <div className="flex min-w-0 items-center gap-3">
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
                    Attach Auto-Tailored Resume
                  </Label>
                </div>
                {attachResume && resume ? (
                  <div className="inline-flex min-w-0 max-w-[240px] items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-xs">
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
              </div>

              {attachResume ? (
                <div className="flex shrink-0 items-center gap-2">
                  <Switch
                    id="opp-include-summary"
                    checked={includeSummary}
                    onCheckedChange={setIncludeSummary}
                    disabled={busy}
                  />
                  <Label
                    htmlFor="opp-include-summary"
                    className="cursor-pointer text-sm font-medium"
                  >
                    Include Summary
                  </Label>
                </div>
              ) : null}
            </div>

            {/* Tier 5: action footer */}
            <div className="flex flex-none items-center justify-end gap-2 border-t bg-background px-6 py-3">
              <Button
                type="button"
                variant="ghost"
                disabled={pending || loadingDraft}
                onClick={() => handleDialogOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isSaveDraftDisabled}
                onClick={() => persistThen("gmail-draft")}
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
                Save Draft
              </Button>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button
                        type="button"
                        disabled={isSendDisabled}
                        onClick={() => persistThen("send")}
                      >
                        {pending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        Send Email
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {sendDisabledReason ? (
                    <TooltipContent side="top" className="max-w-xs text-center">
                      {sendDisabledReason}
                    </TooltipContent>
                  ) : null}
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
