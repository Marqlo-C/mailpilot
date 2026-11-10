"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type CSSProperties,
} from "react";
import type { JobOpportunity } from "@prisma/client";
import { Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";

import {
  generateOpportunityResumeAction,
  getOpportunityResumeStateAction,
  prepareOpportunityDraftForReview,
  regenerateOpportunityDraftAction,
  refineOpportunityDraftAction,
  refineOpportunityResumeAction,
  refineSingleResumeNodeAction,
  reorderResumeDraftNodeAction,
  compileResumeDocumentAction,
  updateResumeDraftNodeAction,
  saveOpportunityDraftEdits,
  sendOpportunityApplication,
  type DraftAttachmentInput,
  type OpportunityResumePreview,
  type OriginalEmailPreview,
} from "@/app/actions/opportunities";
import { useSidebarCollapse } from "@/components/layout/sidebar-collapse-provider";
import { ActionDialogShell } from "@/components/ui/composites/action-dialog-shell";
import { getCompanyLogoUrl } from "@/lib/utils/company-logo";
import { getDevOllamaModelOverride } from "@/components/settings/ai-models";
import { ViewEmailDialog } from "@/components/ui/composites/view-email-dialog";
import { PRIMARY_ACTION_BTN_CLASSNAME } from "@/components/ui/styles/primary-action-btn";
import { SECONDARY_ACTION_BTN_CLASSNAME } from "@/components/ui/styles/secondary-action-btn";
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
import { useDraftSplitPane } from "@/hooks/use-draft-split-pane";
import {
  useDraftPdf,
  formatSize,
  estimateBase64Bytes,
  downloadBase64File,
} from "@/hooks/use-draft-pdf";
import { cn } from "@/lib/utils";
import {
  EmailEditorPanel,
  ResumePreviewPanel,
  RefinePanel,
  DraftFooterControls,
} from "./draft";

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
  const { setDraftResumeSidebarMode } = useSidebarCollapse();
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
  const [viewOriginalEmailOpen, setViewOriginalEmailOpen] = useState(false);
  const [extraFiles, setExtraFiles] = useState<File[]>([]);
  const [resume, setResume] = useState<OpportunityResumePreview | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [resumeStateLoaded, setResumeStateLoaded] = useState(false);
  const [includeSummary, setIncludeSummary] = useState(true);
  const [attachResume, setAttachResume] = useState(true);
  const [showRationale, setShowRationale] = useState(false);

  const {
    emailSplitPct,
    splitDragging,
    setSplitDragging,
    splitRowRef,
    onSplitKeyDown,
    minSplit,
    maxSplit,
  } = useDraftSplitPane();

  const { resumePdfUrl } = useDraftPdf(resume?.pdfBase64);

  const resumeBusy = isTaskActive(TASK_RESUME);
  const refining = isTaskActive(TASK_EMAIL_REFINE);
  const retrying = isTaskActive(TASK_EMAIL_DRAFT);

  // Free horizontal room for the resume pane; restore only if we collapsed it.
  useEffect(() => {
    const needsSpace = open && attachResume;
    setDraftResumeSidebarMode(needsSpace);
    return () => {
      setDraftResumeSidebarMode(false);
    };
  }, [open, attachResume, setDraftResumeSidebarMode]);

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
    setViewOriginalEmailOpen(false);
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

  const applyResumeResult = useCallback((data: OpportunityResumePreview) => {
    setResume(data);
    setResumeError(null);
    setResumeStateLoaded(true);
    if (typeof data.includeSummary === "boolean") {
      setIncludeSummary(data.includeSummary);
    }
  }, []);

  async function persistDraftChange(
    run: () => Promise<
      Awaited<ReturnType<typeof updateResumeDraftNodeAction>>
    >
  ) {
    if (!opportunity) return;
    const result = await run();
    if (!result.ok || !result.data) {
      toast.error(result.ok ? "Empty resume" : result.error);
      return;
    }
    applyResumeResult(result.data);
  }

  function generateResume(summaryPreference = includeSummary) {
    if (!opportunity) return;
    const wasRegenerate = Boolean(resume);
    setResumeAction("regenerate");
    const signal = startTask(TASK_RESUME);
    void (async () => {
      setResumeError(null);
      try {
        const devModel = getDevOllamaModelOverride();
        const result = await abortablePromise(
          generateOpportunityResumeAction(
            opportunity.id,
            summaryPreference,
            undefined,
            devModel || undefined
          ),
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
        const devModel = getDevOllamaModelOverride();
        const result = await abortablePromise(
          refineOpportunityResumeAction(
            opportunity.id,
            refinePrompt.trim(),
            resume?.experiences ?? null,
            includeSummary,
            undefined,
            devModel || undefined
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
  const hasTailoredResume = Boolean(
    resume?.draft?.nodes.length || resume?.pdfBase64
  );
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

  const showComposerActions = !loadingDraft && !error;

  const handleRefineResumeNode = useCallback(
    (nodeId: string, instruction: string) => {
      if (!opportunity) return;
      const signal = startTask(TASK_RESUME);
      void (async () => {
        try {
          const result = await abortablePromise(
            refineSingleResumeNodeAction(opportunity.id, nodeId, instruction),
            signal
          );
          if (signal.aborted) return;
          if (!result.ok || !result.data) {
            toast.error(result.ok ? "Empty resume" : result.error);
            return;
          }
          applyResumeResult(result.data);
        } catch (error) {
          if (isAbortError(error) || signal.aborted) return;
          toast.error(
            error instanceof Error ? error.message : "Failed to refine line"
          );
        } finally {
          finishTask(TASK_RESUME, signal);
        }
      })();
    },
    [opportunity, startTask, finishTask, applyResumeResult]
  );

  const handleExportResume = useCallback(
    (format: "pdf" | "docx") => {
      if (!opportunity) return;
      const signal = startTask(TASK_RESUME);
      void (async () => {
        try {
          const result = await abortablePromise(
            compileResumeDocumentAction(opportunity.id, format),
            signal
          );
          if (signal.aborted) return;
          if (!result.ok || !result.data) {
            toast.error(result.ok ? "Empty resume" : result.error);
            return;
          }
          if (format === "docx" && result.data.docxBase64) {
            downloadBase64File(
              result.data.filename,
              result.data.docxBase64,
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            );
            toast.success("DOCX exported");
            return;
          }
          if (result.data.pdfBase64) {
            downloadBase64File(
              result.data.filename,
              result.data.pdfBase64,
              "application/pdf"
            );
          }
          applyResumeResult(result.data);
          toast.success("PDF exported");
        } catch (error) {
          if (isAbortError(error) || signal.aborted) return;
          toast.error(
            error instanceof Error ? error.message : "Failed to export resume"
          );
        } finally {
          finishTask(TASK_RESUME, signal);
        }
      })();
    },
    [opportunity, startTask, finishTask, applyResumeResult]
  );

  return (
    <ActionDialogShell
      open={open}
      onOpenChange={handleDialogOpenChange}
      pending={pending}
      size={attachResume ? "xl" : "lg"}
      contentClassName="h-[88vh] max-h-[900px] w-full transition-all duration-300 ease-in-out"
      bodyClassName="flex flex-col overflow-hidden p-0"
      identity={{
        title: "Responding to:",
        primary: opportunity?.title ?? "Draft",
        secondary: opportunity?.company ?? null,
        emphasize: "secondary",
        logoSrc: opportunity
          ? opportunity.logoUrl ||
            getCompanyLogoUrl(
              opportunity.company,
              opportunity.companyDomain
            )
          : null,
        logoName: opportunity?.company,
        logoSize: "lg",
      }}
      onCancel={() => handleDialogOpenChange(false)}
      secondaryAction={
        showComposerActions ? (
          <button
            type="button"
            disabled={isSaveDraftDisabled}
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
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <button
                    type="button"
                    disabled={isSendDisabled}
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
                </span>
              </TooltipTrigger>
              {sendDisabledReason ? (
                <TooltipContent side="top" className="text-center">
                  {sendDisabledReason}
                </TooltipContent>
              ) : null}
            </Tooltip>
          </TooltipProvider>
        ) : null
      }
    >
      {loadingDraft ? (
        <div className="flex flex-1 items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Preparing draft…
        </div>
      ) : error ? (
        <p className="flex-1 px-6 py-8 text-sm text-destructive">{error}</p>
      ) : (
        <div className="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-x-hidden">
          {/* Tier 2: main split — drag the gutter to resize email vs resume */}
          <div
            ref={splitRowRef}
            className={cn(
              "flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col gap-4 overflow-x-hidden px-6 py-4",
              attachResume && "lg:flex-row lg:gap-0",
              !splitDragging && "transition-[gap] duration-300 ease-in-out"
            )}
            style={
              attachResume
                ? ({
                    ["--draft-email-split"]: `${emailSplitPct}%`,
                  } as CSSProperties)
                : undefined
            }
          >
            {/* Left: seamless email composer */}
            <EmailEditorPanel
              attachResume={attachResume}
              recipient={recipient}
              setRecipient={setRecipient}
              subject={subject}
              setSubject={setSubject}
              originalEmail={originalEmail}
              onViewOriginalEmail={() => setViewOriginalEmailOpen(true)}
              body={body}
              setBody={setBody}
              extraFiles={extraFiles}
              removeFile={removeFile}
              handleFileSelect={handleFileSelect}
              fileInputId={fileInputId}
              busy={busy}
            />

            {/* Split resize handle: appears on lg screens when resume preview is mounted */}
            {attachResume ? (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize email and resume panes"
                aria-valuemin={minSplit}
                aria-valuemax={maxSplit}
                aria-valuenow={Math.round(emailSplitPct)}
                tabIndex={0}
                className={cn(
                  "group relative hidden w-4 shrink-0 cursor-col-resize touch-none lg:block",
                  splitDragging && "bg-border/40"
                )}
                onPointerDown={(event) => {
                  event.preventDefault();
                  setSplitDragging(true);
                }}
                onKeyDown={onSplitKeyDown}
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-y-3 left-1/2 w-px -translate-x-1/2 rounded-full bg-border transition-colors",
                    splitDragging
                      ? "bg-[#129f96]"
                      : "group-hover:bg-[#129f96]/70 group-focus-visible:bg-[#129f96]"
                  )}
                />
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-1/2 top-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border/80",
                    splitDragging && "bg-[#129f96]"
                  )}
                />
              </div>
            ) : null}

            {/* Right: auto-tailored resume preview */}
            {attachResume ? (
              <ResumePreviewPanel
                resumeBusy={resumeBusy}
                resume={resume}
                resumeError={resumeError}
                busy={busy}
                resumePdfUrl={resumePdfUrl}
                showRationale={showRationale}
                setShowRationale={setShowRationale}
                resumeStateLoaded={resumeStateLoaded}
                onCancelTask={() => handleCancelTask(TASK_RESUME)}
                onRetry={() => void generateResume()}
                onCommit={(nodeId, content) => {
                  if (!opportunity) return;
                  void persistDraftChange(() =>
                    updateResumeDraftNodeAction(opportunity.id, nodeId, {
                      content,
                    })
                  );
                }}
                onToggle={(nodeId, selected) => {
                  if (!opportunity) return;
                  void persistDraftChange(() =>
                    updateResumeDraftNodeAction(opportunity.id, nodeId, {
                      selected,
                    })
                  );
                }}
                onMove={(nodeId, direction) => {
                  if (!opportunity) return;
                  void persistDraftChange(() =>
                    reorderResumeDraftNodeAction(
                      opportunity.id,
                      nodeId,
                      direction
                    )
                  );
                }}
                onRefine={handleRefineResumeNode}
                onExport={handleExportResume}
              />
            ) : null}
          </div>

          {/* Tier 3: unified Ace AI bar */}
          <RefinePanel
            attachResume={attachResume}
            effectiveRefineTarget={effectiveRefineTarget}
            setRefineTarget={setRefineTarget}
            busy={busy}
            refinePlaceholder={refinePlaceholder}
            refinePrompt={refinePrompt}
            setRefinePrompt={setRefinePrompt}
            handleUnifiedRefine={handleUnifiedRefine}
            handleUnifiedRegenerate={handleUnifiedRegenerate}
            regeneratingTarget={regeneratingTarget}
            refiningTarget={refiningTarget}
            primaryActionLabel={primaryActionLabel}
            primaryActionTitle={primaryActionTitle}
            showGenerateResume={showGenerateResume}
            refineDisabled={refineDisabled}
            onCancelRegenerate={() =>
              handleCancelTask(
                effectiveRefineTarget === "email"
                  ? TASK_EMAIL_DRAFT
                  : TASK_RESUME
              )
            }
            onCancelRefine={() =>
              handleCancelTask(
                effectiveRefineTarget === "email"
                  ? TASK_EMAIL_REFINE
                  : TASK_RESUME
              )
            }
          />

          {/* Tier 4: configuration strip */}
          <DraftFooterControls
            attachResume={attachResume}
            handleAttachResumeChange={handleAttachResumeChange}
            busy={busy}
            resume={resume}
            resumeSizeLabel={resumeSizeLabel}
            includeSummary={includeSummary}
            setIncludeSummary={setIncludeSummary}
          />
        </div>
      )}
      <ViewEmailDialog
        open={viewOriginalEmailOpen}
        onOpenChange={setViewOriginalEmailOpen}
        messageId={originalEmail?.messageId ?? null}
        initialSubject={originalEmail?.subject ?? null}
        initialFrom={originalFrom}
      />
    </ActionDialogShell>
  );
}
