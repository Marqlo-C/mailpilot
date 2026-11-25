"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
} from "react";
import type { JobOpportunity } from "@/lib/generated/prisma/client";
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
  restoreResumeDraftAction,
  saveOpportunityDraftEdits,
  sendOpportunityApplication,
  type DraftAttachmentInput,
  type OpportunityResumePreview,
  type OriginalEmailPreview,
} from "@/app/actions/opportunities";
import { getDevOllamaModelOverride } from "@/components/features/settings/ai-models";
import {
  abortablePromise,
  isAbortError,
  useTaskAbortManager,
} from "@/hooks/use-task-abort-manager";
import { downloadBase64File } from "@/hooks/use-draft-pdf";
import {
  tryResumeDomHistory,
  useResumeDraftHistory,
} from "@/hooks/use-resume-draft-history";
import { plainToEmailHtml } from "@/lib/opportunities/dispatch/email-body-html";
import { formatToastError } from "@/lib/utils/ui/toast-format";

/** Ace returns plain text; composer state is email-safe HTML. */
function setEmailBodyFromPlain(
  setBody: (html: string) => void,
  plain: string
) {
  setBody(plainToEmailHtml(plain));
}

export const TASK_RESUME = "resume-generation";
export const TASK_RESUME_EXPORT = "resume-export";
export const TASK_EMAIL_REFINE = "email-refine";
export const TASK_EMAIL_DRAFT = "email-draft";

export const EMAIL_REFINE_PLACEHOLDER =
  "Ask Ace to refine email (e.g., make it more concise, emphasize relevant experience, adjust tone)…";
export const RESUME_REFINE_PLACEHOLDER =
  "Ask Ace to refine resume (e.g., highlight key skills, focus on impact metrics, adjust project focus)…";

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

export type UseOpportunityDraftFlowProps = {
  open: boolean;
  opportunity: JobOpportunity | null;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
};

/**
 * Manages drafting, tailoring, refinement, attachments, and delivery state for an opportunity.
 */
export function useOpportunityDraftFlow({
  open,
  opportunity,
  onOpenChange,
  onCompleted,
}: UseOpportunityDraftFlowProps) {
  const [pending, startTransition] = useTransition();
  /** Which footer CTA started the in-flight persist — scopes loaders to one button. */
  const [submitAction, setSubmitAction] = useState<
    "gmail-draft" | "send" | null
  >(null);
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
  /** Last server-sourced To/Subject — revert target after local edits. */
  const [baselineRecipient, setBaselineRecipient] = useState("");
  const [baselineSubject, setBaselineSubject] = useState("");
  const [refineTarget, setRefineTarget] = useState<"email" | "resume">("email");
  const [refinePrompt, setRefinePrompt] = useState("");
  const [resumeAction, setResumeAction] = useState<
    "regenerate" | "refine" | "node" | null
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
  const resumeBusy = isTaskActive(TASK_RESUME);
  const exporting = isTaskActive(TASK_RESUME_EXPORT);
  const refining = isTaskActive(TASK_EMAIL_REFINE);
  const retrying = isTaskActive(TASK_EMAIL_DRAFT);
  const emailBusy = refining || retrying;

  const activeOpportunityKey = open && opportunity ? opportunity.id : null;
  const [prevOpportunityKey, setPrevOpportunityKey] = useState<string | null>(
    null
  );
  if (prevOpportunityKey !== activeOpportunityKey) {
    setPrevOpportunityKey(activeOpportunityKey);
    if (activeOpportunityKey && opportunity) {
      setLoadingDraft(true);
      setError(null);
      setRefinePrompt("");
      setRefineTarget("email");
      setResumeAction(null);
      const nextRecipient = opportunity.recipientEmail ?? "";
      setRecipient(nextRecipient);
      setBaselineRecipient(nextRecipient);
      setBaselineSubject("");
      setOriginalEmail(null);
      setViewOriginalEmailOpen(false);
      setExtraFiles([]);
      setResume(null);
      setResumeError(null);
      setResumeStateLoaded(false);
      setIncludeSummary(false);
      setAttachResume(true);
    }
  }

  useEffect(() => {
    if (!open || !opportunity) return;

    let cancelled = false;
    cancelAll();

    void (async () => {
      const [draftResult, resumeResult] = await Promise.all([
        prepareOpportunityDraftForReview(opportunity.id),
        getOpportunityResumeStateAction(opportunity.id),
      ]);
      if (cancelled) return;

      setLoadingDraft(false);

      if (!draftResult.ok || !draftResult.data) {
        setError(draftResult.ok ? "Empty draft" : draftResult.error);
        toast.error(
          draftResult.ok ? "Empty draft" : formatToastError(draftResult.error)
        );
      } else {
        const nextSubject = draftResult.data.subject;
        const nextRecipient =
          draftResult.data.recipient ?? opportunity.recipientEmail ?? "";
        setSubject(nextSubject);
        setBaselineSubject(nextSubject);
        setEmailBodyFromPlain(setBody, draftResult.data.body);
        setRecipient(nextRecipient);
        setBaselineRecipient(nextRecipient);
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

  const resumeHistory = useResumeDraftHistory();

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
    resumeHistory.recordBefore(resume?.draft);
    const result = await run();
    if (!result.ok || !result.data) {
      toast.error(
        result.ok ? "Empty resume" : formatToastError(result.error)
      );
      return;
    }
    applyResumeResult(result.data);
  }

  const handleResumeUndo = useCallback(async () => {
    if (tryResumeDomHistory("undo")) return;
    if (!opportunity) return;
    const prev = resumeHistory.takeUndo(resume?.draft);
    if (!prev) return;
    const result = await restoreResumeDraftAction(opportunity.id, prev);
    if (!result.ok || !result.data) {
      toast.error(
        result.ok ? "Empty resume" : formatToastError(result.error)
      );
      return;
    }
    applyResumeResult(result.data);
  }, [opportunity, resume?.draft, resumeHistory, applyResumeResult]);

  const handleResumeRedo = useCallback(async () => {
    if (tryResumeDomHistory("redo")) return;
    if (!opportunity) return;
    const next = resumeHistory.takeRedo(resume?.draft);
    if (!next) return;
    const result = await restoreResumeDraftAction(opportunity.id, next);
    if (!result.ok || !result.data) {
      toast.error(
        result.ok ? "Empty resume" : formatToastError(result.error)
      );
      return;
    }
    applyResumeResult(result.data);
  }, [opportunity, resume?.draft, resumeHistory, applyResumeResult]);

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
          toast.error(
            result.ok ? "Empty resume" : formatToastError(result.error)
          );
          return;
        }
        resumeHistory.clear();
        applyResumeResult(result.data);
        toast.success(
          wasRegenerate ? "Resume rewritten" : "Resume created"
        );
      } catch (error) {
        if (isAbortError(error) || signal.aborted) return;
        const message =
          error instanceof Error ? error.message : "Failed to create resume";
        setResumeError(message);
        toast.error(formatToastError(error, "Failed to create resume"));
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
          toast.error(
            result.ok ? "Empty resume" : formatToastError(result.error)
          );
          return;
        }
        resumeHistory.clear();
        applyResumeResult(result.data);
        setRefinePrompt("");
        toast.success("Resume refined");
      } catch (error) {
        if (isAbortError(error) || signal.aborted) return;
        toast.error(formatToastError(error, "Failed to refine resume"));
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
          toast.error("Max 10 files allowed");
          break;
        }
        if (file.size > 10 * 1024 * 1024) {
          toast.error("File exceeds 10MB limit");
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
    const hasResumeDraft = Boolean(
      resume?.draft?.nodes.length || resume?.pdfBase64
    );
    if (action === "send" && attachResume && !hasResumeDraft) {
      toast.error("Create a resume or detach the PDF");
      return;
    }
    setSubmitAction(action);
    startTransition(async () => {
      try {
        const saved = await saveOpportunityDraftEdits(opportunity.id, {
          subject,
          body,
          recipientEmail: recipient,
        });
        if (!saved.ok) {
          toast.error(formatToastError(saved.error));
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

        const shouldAttachResume = attachResume && hasResumeDraft;
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
          toast.error(formatToastError(result.error));
          return;
        }
        toast.success(
          action === "gmail-draft"
            ? "Saved to Gmail drafts"
            : "Application sent"
        );
        onOpenChange(false);
        onCompleted?.();
      } finally {
        setSubmitAction(null);
      }
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
          toast.error(
            result.ok ? "Empty refine result" : formatToastError(result.error)
          );
          return;
        }
        setSubject(result.data.subject);
        setBaselineSubject(result.data.subject);
        setEmailBodyFromPlain(setBody, result.data.body);
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
        toast.error(formatToastError(error, "Failed to refine draft"));
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
          toast.error(
            result.ok ? "Empty draft" : formatToastError(result.error)
          );
          return;
        }
        setSubject(result.data.subject);
        setBaselineSubject(result.data.subject);
        setEmailBodyFromPlain(setBody, result.data.body);
        if (result.data.recipient) {
          setRecipient(result.data.recipient);
          setBaselineRecipient(result.data.recipient);
        }
        setError(null);
        emailSnapshotRef.current = null;
        toast.success("Draft rewritten");
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
        toast.error(formatToastError(error, "Failed to rewrite draft"));
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

  function handleCancelEmailTask() {
    if (retrying) {
      handleCancelTask(TASK_EMAIL_DRAFT);
      return;
    }
    if (refining) {
      handleCancelTask(TASK_EMAIL_REFINE);
    }
  }

  function handleDialogOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      cancelAll();
      emailSnapshotRef.current = null;
    }
    onOpenChange(nextOpen);
  }

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
  const primaryActionLabel = showGenerateResume ? "Create" : "Rewrite";
  const primaryActionTitle = showGenerateResume
    ? "Create a tailored resume"
    : effectiveRefineTarget === "email"
      ? "Rewrite this draft"
      : "Rewrite tailored resume";

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

  /** AI work on either pane — locks starting another Ace action, not the idle pane. */
  const aceBusy = emailBusy || resumeBusy;
  const regeneratingTarget =
    effectiveRefineTarget === "email"
      ? retrying
      : resumeBusy && resumeAction === "regenerate";
  const refiningTarget =
    effectiveRefineTarget === "email"
      ? refining
      : resumeBusy && (resumeAction === "refine" || resumeAction === "node");
  const refinePlaceholder =
    effectiveRefineTarget === "email"
      ? EMAIL_REFINE_PLACEHOLDER
      : RESUME_REFINE_PLACEHOLDER;
  const refineDisabled =
    aceBusy ||
    exporting ||
    !refinePrompt.trim() ||
    (effectiveRefineTarget === "resume" && !hasTailoredResume);

  const emailBusyLabel = retrying
    ? "Rewriting email…"
    : refining
      ? "Refining email…"
      : null;
  const resumeBusyLabel = !resumeBusy
    ? null
    : resumeAction === "refine"
      ? "Refining resume…"
      : resumeAction === "node"
        ? "Updating resume…"
        : hasTailoredResume
          ? "Rewriting resume…"
          : "Creating resume…";

  const isGeneratingResume = resumeBusy || exporting;
  const isGeneratingEmail = emailBusy;
  const isSavingDraft = pending && submitAction === "gmail-draft";
  const isSending = pending && submitAction === "send";
  const isAwaitingResume =
    attachResume && !hasTailoredResume && !resumeBusy;
  const isSendDisabled =
    pending || isGeneratingResume || isGeneratingEmail || isAwaitingResume;
  const sendDisabledReason = exporting
    ? "Finish exporting before sending."
    : resumeBusy
      ? "Creating tailored resume…"
      : isAwaitingResume
        ? "Create and review your tailored resume before sending, or turn off Include tailored resume."
        : isGeneratingEmail
          ? "Finish the current email task before sending."
          : null;
  const isSaveDraftDisabled = pending || loadingDraft || emailBusy;
  const showComposerActions = !loadingDraft && !error;
  const busy = pending || emailBusy || loadingDraft || resumeBusy || exporting;

  const handleRefineResumeNode = useCallback(
    (nodeId: string, instruction: string) => {
      if (!opportunity) return;
      resumeHistory.recordBefore(resume?.draft);
      setResumeAction("node");
      const signal = startTask(TASK_RESUME);
      void (async () => {
        try {
          const result = await abortablePromise(
            refineSingleResumeNodeAction(opportunity.id, nodeId, instruction),
            signal
          );
          if (signal.aborted) return;
          if (!result.ok || !result.data) {
            toast.error(
              result.ok ? "Empty resume" : formatToastError(result.error)
            );
            return;
          }
          applyResumeResult(result.data);
        } catch (error) {
          if (isAbortError(error) || signal.aborted) return;
          toast.error(formatToastError(error, "Failed to refine line"));
        } finally {
          finishTask(TASK_RESUME, signal);
          setResumeAction((current) => (current === "node" ? null : current));
        }
      })();
    },
    [
      opportunity,
      resume?.draft,
      resumeHistory,
      startTask,
      finishTask,
      applyResumeResult,
    ]
  );

  const handleExportResume = useCallback(
    (format: "pdf" | "docx") => {
      if (!opportunity) return;
      const signal = startTask(TASK_RESUME_EXPORT);
      void (async () => {
        try {
          const result = await abortablePromise(
            compileResumeDocumentAction(opportunity.id, format),
            signal
          );
          if (signal.aborted) return;
          if (!result.ok || !result.data) {
            toast.error(
              result.ok ? "Empty resume" : formatToastError(result.error)
            );
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
          toast.error(formatToastError(error, "Failed to export resume"));
        } finally {
          finishTask(TASK_RESUME_EXPORT, signal);
        }
      })();
    },
    [opportunity, startTask, finishTask, applyResumeResult]
  );

  return {
    pending,
    loadingDraft,
    error,
    subject,
    setSubject,
    body,
    setBody,
    recipient,
    setRecipient,
    baselineRecipient,
    baselineSubject,
    revertRecipient: () => setRecipient(baselineRecipient),
    revertSubject: () => setSubject(baselineSubject),
    refineTarget,
    setRefineTarget,
    refinePrompt,
    setRefinePrompt,
    originalEmail,
    viewOriginalEmailOpen,
    setViewOriginalEmailOpen,
    extraFiles,
    resume,
    resumeError,
    resumeStateLoaded,
    includeSummary,
    setIncludeSummary,
    attachResume,
    resumeBusy,
    exporting,
    emailBusy,
    emailBusyLabel,
    resumeBusyLabel,
    aceBusy,
    busy,
    effectiveRefineTarget,
    showGenerateResume,
    primaryActionLabel,
    primaryActionTitle,
    regeneratingTarget,
    refiningTarget,
    refinePlaceholder,
    refineDisabled,
    isSendDisabled,
    sendDisabledReason,
    isSaveDraftDisabled,
    isSavingDraft,
    isSending,
    showComposerActions,
    handleUnifiedRegenerate,
    handleUnifiedRefine,
    handleFileSelect,
    removeFile,
    persistThen,
    handleCancelTask,
    handleCancelEmailTask,
    handleDialogOpenChange,
    handleAttachResumeChange,
    handleRefineResumeNode,
    handleExportResume,
    handleResumeUndo,
    handleResumeRedo,
    canResumeUndo: resumeHistory.canUndo,
    canResumeRedo: resumeHistory.canRedo,
    resumeHistoryVersion: resumeHistory.version,
    persistDraftChange,
    generateResume,
  };
}
