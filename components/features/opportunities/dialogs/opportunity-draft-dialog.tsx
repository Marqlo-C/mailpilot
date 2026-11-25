"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
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
  useGroupRef,
} from "@/components/ui/resizable";
import {
  DRAFT_SPLIT_DEFAULT,
  DRAFT_SPLIT_PANEL_EMAIL,
  DRAFT_SPLIT_PANEL_RESUME,
  useDraftSplitPane,
} from "@/hooks/use-draft-split-pane";
import { useResumeEditSplit } from "@/hooks/use-resume-edit-split";
import type { ResumeEditEntryCameraApi } from "@/hooks/use-resume-draft-sheet";
import { useToolbarMinWidthPx } from "@/hooks/use-toolbar-min-width";
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
import {
  COMPOSER_INSET_X_CLASSNAME,
  COMPOSER_PANE_GAP_CLASSNAME,
} from "@/components/ui/styles/field-chrome";
import { cn } from "@/lib/utils";
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

  const splitGroupRef = useGroupRef();
  const [resumeEditMode, setResumeEditMode] = useState(false);
  const editEntryCameraApiRef = useRef<ResumeEditEntryCameraApi | null>(null);
  const onResumeEditModeChange = useCallback((active: boolean) => {
    setResumeEditMode(active);
  }, []);
  const onResumeExpanded = useCallback(() => {
    editEntryCameraApiRef.current?.onExpanded();
  }, []);
  const { onLayoutChanged: onSplitLayoutChanged } = useResumeEditSplit({
    groupRef: splitGroupRef,
    enabled: open && isDesktopSplit && flow.attachResume,
    editMode: resumeEditMode,
    onUserLayoutChanged: onLayoutChanged,
    onExpanded: onResumeExpanded,
  });

  const [emailToolbarEl, setEmailToolbarEl] = useState<HTMLDivElement | null>(
    null
  );
  const [resumeToolbarEl, setResumeToolbarEl] =
    useState<HTMLDivElement | null>(null);
  const emailToolbarRef = useCallback((node: HTMLDivElement | null) => {
    setEmailToolbarEl(node);
  }, []);
  const resumeToolbarRef = useCallback((node: HTMLDivElement | null) => {
    setResumeToolbarEl(node);
  }, []);
  const emailToolbarMinPx = useToolbarMinWidthPx(
    emailToolbarEl,
    open && isDesktopSplit
  );
  const resumeToolbarMinPx = useToolbarMinWidthPx(
    resumeToolbarEl,
    open && isDesktopSplit && flow.attachResume
  );

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
      toolbarRef={emailToolbarRef}
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
      recipientName={
        opportunity?.recipientName?.trim() ||
        flow.originalEmail?.fromName?.trim() ||
        null
      }
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
      toolbarRef={resumeToolbarRef}
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
      canUndo={flow.canResumeUndo}
      canRedo={flow.canResumeRedo}
      onUndo={() => void flow.handleResumeUndo()}
      onRedo={() => void flow.handleResumeRedo()}
      onEditModeChange={onResumeEditModeChange}
      editEntryCameraApiRef={editEntryCameraApiRef}
    />
  ) : null;

  return (
    <ActionDialogShell
      open={open}
      onOpenChange={flow.handleDialogOpenChange}
      pending={flow.pending}
      size={flow.attachResume ? "xl" : "lg"}
      contentClassName="h-[88vh] max-h-[900px] w-full transition-all duration-200 ease-apple-out"
      bodyClassName={
        flow.attachResume && isDesktopSplit
          ? "flex min-h-0 flex-col overflow-hidden p-0"
          : "flex min-h-0 flex-col overflow-y-auto p-0"
      }
      identity={{
        title: opportunity?.title ?? "Draft",
        primary: opportunity?.company ?? "",
        inlinePrimary: true,
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
        <p className="flex-1 px-4 py-8 text-sm text-destructive">{flow.error}</p>
      ) : (
        <div
          className={cn(
            // 16px window inset sides/top/bottom (Ace → footer).
            // Pane ↔ Ace shares COMPOSER_PANE_GAP with the email ↔ resume seam.
            "flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-x-hidden pt-4 pb-4",
            COMPOSER_INSET_X_CLASSNAME,
            COMPOSER_PANE_GAP_CLASSNAME
          )}
        >
            {flow.attachResume && isDesktopSplit ? (
              <ResizablePanelGroup
                id="mp-draft-email-resume"
                orientation="horizontal"
                className="min-h-0 flex-1 gap-0"
                // Library defaults overflow:hidden on the group — that clips
                // plate box-shadows. style wins over the inline default.
                style={{ overflow: "visible" }}
                groupRef={splitGroupRef}
                defaultLayout={defaultLayout}
                onLayoutChanged={onSplitLayoutChanged}
              >
                <ResizablePanel
                  id={DRAFT_SPLIT_PANEL_EMAIL}
                  defaultSize={`${DRAFT_SPLIT_DEFAULT}%`}
                  // Pixel floor from measured toolbar; % fallback pre-measure.
                  minSize={emailToolbarMinPx ?? `${minSplit}%`}
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
                  minSize={
                    resumeToolbarMinPx ?? `${100 - maxSplit}%`
                  }
                  maxSize={`${100 - minSplit}%`}
                  className="flex min-h-0 min-w-0 flex-col"
                  style={{ overflow: "visible" }}
                >
                  {resumePanel}
                </ResizablePanel>
              </ResizablePanelGroup>
            ) : (
              <div
                className={cn(
                  "flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-y-auto",
                  COMPOSER_PANE_GAP_CLASSNAME
                )}
              >
                {emailPanel}
                {resumePanel}
              </div>
            )}

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
