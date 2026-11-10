"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
} from "react";
import type { JobOpportunity } from "@prisma/client";
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
import { getDevOllamaModelOverride } from "@/components/features/settings/ai-models";
import {
  abortablePromise,
  isAbortError,
  useTaskAbortManager,
} from "@/hooks/use-task-abort-manager";
import { downloadBase64File } from "@/hooks/use-draft-pdf";

export const TASK_RESUME = "resume-generation";
export const TASK_EMAIL_REFINE = "email-refine";
export const TASK_EMAIL_DRAFT = "email-draft";

export const EMAIL_REFINE_PLACEHOLDER =
  "Ask Ace AI to refine email (e.g., make it more concise, emphasize relevant experience, adjust tone)…";
export const RESUME_REFINE_PLACEHOLDER =
  "Ask Ace AI to refine resume (e.g., highlight key skills, focus on impact metrics, adjust project focus)…";

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
  const [refineTarget, setRefineTarget] = useState<"email" | "resume">("email");
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
        if (isAbortError(error) || signal.aborted) return;
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
    if (action === "send" && attachResume && !resume?.pdfBase64) {
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

      const shouldAttachResume = attachResume && Boolean(resume?.pdfBase64);
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

  const busy = pending || refining || retrying || loadingDraft || resumeBusy;
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
  const isSaveDraftDisabled = pending || loadingDraft || refining || retrying;
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
    showRationale,
    setShowRationale,
    resumeBusy,
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
    showComposerActions,
    handleUnifiedRegenerate,
    handleUnifiedRefine,
    handleFileSelect,
    removeFile,
    persistThen,
    handleCancelTask,
    handleDialogOpenChange,
    handleAttachResumeChange,
    handleRefineResumeNode,
    handleExportResume,
    persistDraftChange,
    generateResume,
  };
}
