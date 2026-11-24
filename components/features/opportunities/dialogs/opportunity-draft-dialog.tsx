"use client";

import { useEffect, useId } from "react";
import type { JobOpportunity } from "@/lib/generated/prisma/client";

import { Loader } from "@/components/ui/loader";
import { TextShimmer } from "@/components/ui/text-shimmer";

import {
  reorderResumeDraftNodeAction,
  updateResumeDraftNodeAction,
} from "@/app/actions/opportunities";
import { useSidebarCollapse } from "@/components/layout/sidebar-collapse-provider";
import { ActionDialogShell } from "@/components/ui/composites/action-dialog-shell";
import { getCompanyLogoUrl } from "@/lib/utils/company-logo";
import { ViewEmailDialog } from "@/components/ui/composites/view-email-dialog";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  DRAFT_SPLIT_DEFAULT,
  DRAFT_SPLIT_PANEL_EMAIL,
  DRAFT_SPLIT_PANEL_RESUME,
  useDraftSplitPane,
} from "@/hooks/use-draft-split-pane";
import {
  useDraftPdf,
  formatSize,
  estimateBase64Bytes,
} from "@/hooks/use-draft-pdf";
import {
  EmailEditorPanel,
  ResumePreviewPanel,
  RefinePanel,
} from "./draft";
import {
  useOpportunityDraftFlow,
  TASK_RESUME,
  TASK_EMAIL_REFINE,
  TASK_EMAIL_DRAFT,
} from "@/hooks/use-opportunity-draft-flow";
import { OpportunityDraftCompensationFields } from "./opportunity-draft-compensation-fields";
import { OpportunityDraftFooterActions } from "./opportunity-draft-footer-actions";

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

  const { isDesktopSplit, defaultLayout, onLayoutChanged, minSplit, maxSplit } =
    useDraftSplitPane();

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

  const splitEmbedded = flow.attachResume && isDesktopSplit;

  const emailPanel = (
    <EmailEditorPanel
      attachResume={flow.attachResume}
      onAttachResumeChange={
        flow.showComposerActions ? flow.handleAttachResumeChange : undefined
      }
      attachLocked={flow.resumeBusy || flow.exporting}
      resume={flow.resume}
      resumeSizeLabel={resumeSizeLabel}
      embedded={splitEmbedded}
      recipient={flow.recipient}
      setRecipient={flow.setRecipient}
      subject={flow.subject}
      setSubject={flow.setSubject}
      baselineRecipient={flow.baselineRecipient}
      baselineSubject={flow.baselineSubject}
      onRevertRecipient={flow.revertRecipient}
      onRevertSubject={flow.revertSubject}
      originalEmail={flow.originalEmail}
      onViewOriginalEmail={() => flow.setViewOriginalEmailOpen(true)}
      body={flow.body}
      setBody={flow.setBody}
      extraFiles={flow.extraFiles}
      removeFile={flow.removeFile}
      handleFileSelect={flow.handleFileSelect}
      fileInputId={fileInputId}
      emailBusy={flow.emailBusy}
      emailBusyLabel={flow.emailBusyLabel}
    />
  );

  const resumePanel = flow.attachResume ? (
    <ResumePreviewPanel
      resumeBusy={flow.resumeBusy}
      resumeBusyLabel={flow.resumeBusyLabel}
      exporting={flow.exporting}
      resume={flow.resume}
      resumeError={flow.resumeError}
      resumePdfUrl={resumePdfUrl}
      resumeStateLoaded={flow.resumeStateLoaded}
      embedded={splitEmbedded}
      includeSummary={flow.includeSummary}
      onIncludeSummaryChange={flow.setIncludeSummary}
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
          reorderResumeDraftNodeAction(opportunity.id, nodeId, direction)
        );
      }}
      onRefine={flow.handleRefineResumeNode}
      onExport={flow.handleExportResume}
    />
  ) : null;

  return (
    <ActionDialogShell
      open={open}
      onOpenChange={flow.handleDialogOpenChange}
      pending={flow.pending}
      size={flow.attachResume ? "xl" : "lg"}
      contentClassName="h-[88vh] max-h-[900px] w-full transition-all duration-200 ease-apple-out"
      bodyClassName="flex min-h-0 flex-col overflow-y-auto p-0 lg:overflow-hidden"
      identity={{
        title: opportunity?.title ?? "Draft",
        primary: opportunity?.company ?? "",
        logoSrc: opportunity
          ? opportunity.logoUrl ||
            getCompanyLogoUrl(
              opportunity.company,
              opportunity.companyDomain
            )
          : null,
        logoName: opportunity?.company,
        logoSize: "jobCard",
        meta:
          opportunity?.salary || opportunity?.location ? (
            <OpportunityDraftCompensationFields
              salary={opportunity?.salary}
              location={opportunity?.location}
            />
          ) : null,
      }}
      onCancel={() => flow.handleDialogOpenChange(false)}
      secondaryAction={null}
      primaryAction={
        <OpportunityDraftFooterActions
          showComposerActions={flow.showComposerActions}
          isSaveDraftDisabled={flow.isSaveDraftDisabled}
          onSaveDraft={() => flow.persistThen("gmail-draft")}
          isSavingDraft={flow.isSavingDraft}
          isSendDisabled={flow.isSendDisabled}
          onSend={() => flow.persistThen("send")}
          isSending={flow.isSending}
          sendDisabledReason={flow.sendDisabledReason}
        />
      }
    >
      {flow.loadingDraft ? (
        <div className="flex flex-1 items-center justify-center gap-2 py-16 text-sm">
          <Loader size="md" />
          <TextShimmer>Preparing draft…</TextShimmer>
        </div>
      ) : flow.error ? (
        <p className="flex-1 px-5 py-8 text-sm text-destructive">{flow.error}</p>
      ) : (
        <div className="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-x-hidden">
          <div className="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col px-5 pb-2 pt-4">
            {flow.attachResume && isDesktopSplit ? (
              <ResizablePanelGroup
                id="mp-draft-email-resume"
                orientation="horizontal"
                className="min-h-0 flex-1 gap-0"
                // Library defaults overflow:hidden on the group — that clips
                // plate box-shadows. style wins over the inline default.
                style={{ overflow: "visible" }}
                defaultLayout={defaultLayout}
                onLayoutChanged={onLayoutChanged}
              >
                <ResizablePanel
                  id={DRAFT_SPLIT_PANEL_EMAIL}
                  defaultSize={`${DRAFT_SPLIT_DEFAULT}%`}
                  minSize={`${minSplit}%`}
                  maxSize={`${maxSplit}%`}
                  className="flex min-h-0 min-w-0 flex-col"
                  style={{ overflow: "visible" }}
                >
                  {emailPanel}
                </ResizablePanel>
                <ResizableHandle
                  aria-label="Resize email and resume panes"
                  title="Drag to resize · Double-click to reset"
                />
                <ResizablePanel
                  id={DRAFT_SPLIT_PANEL_RESUME}
                  minSize={`${100 - maxSplit}%`}
                  maxSize={`${100 - minSplit}%`}
                  className="flex min-h-0 min-w-0 flex-col"
                  style={{ overflow: "visible" }}
                >
                  {resumePanel}
                </ResizablePanel>
              </ResizablePanelGroup>
            ) : (
              <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-4 overflow-y-auto lg:overflow-hidden">
                {emailPanel}
                {resumePanel}
              </div>
            )}
          </div>

          <RefinePanel
            attachResume={flow.attachResume}
            effectiveRefineTarget={flow.effectiveRefineTarget}
            setRefineTarget={flow.setRefineTarget}
            aceBusy={flow.aceBusy}
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
