"use client";

import {
  useEffect,
  useId,
  type CSSProperties,
} from "react";
import type { JobOpportunity } from "@prisma/client";
import { Loader2 } from "lucide-react";

import {
  reorderResumeDraftNodeAction,
  updateResumeDraftNodeAction,
} from "@/app/actions/opportunities";
import { useSidebarCollapse } from "@/components/layout/sidebar-collapse-provider";
import { ActionDialogShell } from "@/components/ui/composites/action-dialog-shell";
import { getCompanyLogoUrl } from "@/lib/utils/company-logo";
import { ViewEmailDialog } from "@/components/ui/composites/view-email-dialog";
import { useDraftSplitPane } from "@/hooks/use-draft-split-pane";
import {
  useDraftPdf,
  formatSize,
  estimateBase64Bytes,
} from "@/hooks/use-draft-pdf";
import { cn } from "@/lib/utils";
import {
  EmailEditorPanel,
  ResumePreviewPanel,
  RefinePanel,
  DraftFooterControls,
} from "./draft";
import {
  useOpportunityDraftFlow,
  TASK_RESUME,
  TASK_EMAIL_REFINE,
  TASK_EMAIL_DRAFT,
} from "@/hooks/use-opportunity-draft-flow";
import { OpportunityDraftFooterActions } from "./opportunity-draft-footer-actions";
import { OpportunityDraftCompensationFields } from "./opportunity-draft-compensation-fields";

type OpportunityDraftDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunity: JobOpportunity | null;
  onCompleted?: () => void;
};

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
  const { setDraftResumeSidebarMode } = useSidebarCollapse();

  const flow = useOpportunityDraftFlow({
    open,
    opportunity,
    onOpenChange,
    onCompleted,
  });

  const {
    emailSplitPct,
    splitDragging,
    setSplitDragging,
    splitRowRef,
    onSplitKeyDown,
    minSplit,
    maxSplit,
  } = useDraftSplitPane();

  const { resumePdfUrl } = useDraftPdf(flow.resume?.pdfBase64);

  // Free horizontal room for the resume pane; restore only if we collapsed it.
  useEffect(() => {
    const needsSpace = open && flow.attachResume;
    setDraftResumeSidebarMode(needsSpace);
    return () => {
      setDraftResumeSidebarMode(false);
    };
  }, [open, flow.attachResume, setDraftResumeSidebarMode]);

  const originalFrom =
    flow.originalEmail?.fromName?.trim() ||
    flow.originalEmail?.fromEmail?.trim() ||
    "sender";
  const resumeSizeLabel = flow.resume?.pdfBase64
    ? formatSize(estimateBase64Bytes(flow.resume.pdfBase64))
    : null;

  return (
    <ActionDialogShell
      open={open}
      onOpenChange={flow.handleDialogOpenChange}
      pending={flow.pending}
      size={flow.attachResume ? "xl" : "lg"}
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
      onCancel={() => flow.handleDialogOpenChange(false)}
      secondaryAction={null}
      primaryAction={
        <OpportunityDraftFooterActions
          showComposerActions={flow.showComposerActions}
          isSaveDraftDisabled={flow.isSaveDraftDisabled}
          onSaveDraft={() => flow.persistThen("gmail-draft")}
          pending={flow.pending}
          isSendDisabled={flow.isSendDisabled}
          onSend={() => flow.persistThen("send")}
          sendDisabledReason={flow.sendDisabledReason}
        />
      }
    >
      {flow.loadingDraft ? (
        <div className="flex flex-1 items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Preparing draft…
        </div>
      ) : flow.error ? (
        <p className="flex-1 px-6 py-8 text-sm text-destructive">{flow.error}</p>
      ) : (
        <div className="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-x-hidden">
          {opportunity?.salary || opportunity?.location ? (
            <div className="px-6 pt-3">
              <OpportunityDraftCompensationFields
                salary={opportunity?.salary}
                location={opportunity?.location}
              />
            </div>
          ) : null}
          {/* Tier 2: main split — drag the gutter to resize email vs resume */}
          <div
            ref={splitRowRef}
            className={cn(
              "flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col gap-4 overflow-x-hidden px-6 py-4",
              flow.attachResume && "lg:flex-row lg:gap-0",
              !splitDragging && "transition-[gap] duration-300 ease-in-out"
            )}
            style={
              flow.attachResume
                ? ({
                    ["--draft-email-split"]: `${emailSplitPct}%`,
                  } as CSSProperties)
                : undefined
            }
          >
            {/* Left: seamless email composer */}
            <EmailEditorPanel
              attachResume={flow.attachResume}
              recipient={flow.recipient}
              setRecipient={flow.setRecipient}
              subject={flow.subject}
              setSubject={flow.setSubject}
              originalEmail={flow.originalEmail}
              onViewOriginalEmail={() => flow.setViewOriginalEmailOpen(true)}
              body={flow.body}
              setBody={flow.setBody}
              extraFiles={flow.extraFiles}
              removeFile={flow.removeFile}
              handleFileSelect={flow.handleFileSelect}
              fileInputId={fileInputId}
              busy={flow.busy}
            />

            {/* Split resize handle: appears on lg screens when resume preview is mounted */}
            {flow.attachResume ? (
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
            {flow.attachResume ? (
              <ResumePreviewPanel
                resumeBusy={flow.resumeBusy}
                resume={flow.resume}
                resumeError={flow.resumeError}
                busy={flow.busy}
                resumePdfUrl={resumePdfUrl}
                showRationale={flow.showRationale}
                setShowRationale={flow.setShowRationale}
                resumeStateLoaded={flow.resumeStateLoaded}
                onCancelTask={() => flow.handleCancelTask(TASK_RESUME)}
                onRetry={() => void flow.generateResume()}
                onCommit={(nodeId, content) => {
                  if (!opportunity) return;
                  void flow.persistDraftChange(() =>
                    updateResumeDraftNodeAction(opportunity.id, nodeId, {
                      content,
                    })
                  );
                }}
                onToggle={(nodeId, selected) => {
                  if (!opportunity) return;
                  void flow.persistDraftChange(() =>
                    updateResumeDraftNodeAction(opportunity.id, nodeId, {
                      selected,
                    })
                  );
                }}
                onMove={(nodeId, direction) => {
                  if (!opportunity) return;
                  void flow.persistDraftChange(() =>
                    reorderResumeDraftNodeAction(
                      opportunity.id,
                      nodeId,
                      direction
                    )
                  );
                }}
                onRefine={flow.handleRefineResumeNode}
                onExport={flow.handleExportResume}
              />
            ) : null}
          </div>

          {/* Tier 3: unified Ace AI bar */}
          <RefinePanel
            attachResume={flow.attachResume}
            effectiveRefineTarget={flow.effectiveRefineTarget}
            setRefineTarget={flow.setRefineTarget}
            busy={flow.busy}
            refinePlaceholder={flow.refinePlaceholder}
            refinePrompt={flow.refinePrompt}
            setRefinePrompt={flow.setRefinePrompt}
            handleUnifiedRefine={flow.handleUnifiedRefine}
            handleUnifiedRegenerate={flow.handleUnifiedRegenerate}
            regeneratingTarget={flow.regeneratingTarget}
            refiningTarget={flow.refiningTarget}
            primaryActionLabel={flow.primaryActionLabel}
            primaryActionTitle={flow.primaryActionTitle}
            showGenerateResume={flow.showGenerateResume}
            refineDisabled={flow.refineDisabled}
            onCancelRegenerate={() =>
              flow.handleCancelTask(
                flow.effectiveRefineTarget === "email"
                  ? TASK_EMAIL_DRAFT
                  : TASK_RESUME
              )
            }
            onCancelRefine={() =>
              flow.handleCancelTask(
                flow.effectiveRefineTarget === "email"
                  ? TASK_EMAIL_REFINE
                  : TASK_RESUME
              )
            }
          />

          {/* Tier 4: configuration strip */}
          <DraftFooterControls
            attachResume={flow.attachResume}
            handleAttachResumeChange={flow.handleAttachResumeChange}
            busy={flow.busy}
            resume={flow.resume}
            resumeSizeLabel={resumeSizeLabel}
            includeSummary={flow.includeSummary}
            setIncludeSummary={flow.setIncludeSummary}
          />
        </div>
      )}
      <ViewEmailDialog
        open={flow.viewOriginalEmailOpen}
        onOpenChange={flow.setViewOriginalEmailOpen}
        messageId={flow.originalEmail?.messageId ?? null}
        initialSubject={flow.originalEmail?.subject ?? null}
        initialFrom={originalFrom}
      />
    </ActionDialogShell>
  );
}
