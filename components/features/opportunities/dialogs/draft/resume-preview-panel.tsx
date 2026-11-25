import React, { useState, type Ref } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/composites/empty-state";
import { LoadSkeletonStack } from "@/components/ui/composites/load-skeleton-stack";
import { ResumeDraftSheet } from "@/components/features/opportunities/drawer/resume-draft-sheet";
import { ResumeStrategyPanel } from "@/components/features/opportunities/drawer/subcomponents/resume-strategy-panel";
import { useContentSettleKey } from "@/hooks/use-content-settle-key";
import type { OpportunityResumePreview } from "@/app/actions/opportunities";
import { classifyResumeEditTarget } from "@/lib/resume-draft/edit-presentation";
import { cn } from "@/lib/utils";
import {
  COMPOSER_SPLIT_PLATE_CLASSNAME,
  COMPOSER_SPLIT_PLATE_FOCUS_CLASSNAME,
} from "@/components/ui/styles/field-chrome";
import { DraftPaneBusyOverlay } from "./draft-pane-busy-overlay";

function resumeRootFrom(container: HTMLElement): Element | null {
  return container.querySelector("[data-resume-draft-root]");
}

function isLineEditingFocus(
  target: EventTarget | null,
  resumeRoot: Element | null
): boolean {
  const kind = classifyResumeEditTarget(target, resumeRoot);
  return kind === "editable";
}

export function ResumePreviewPanel({
  resumeBusy,
  resumeBusyLabel,
  exporting,
  resume,
  resumeError,
  resumePdfUrl,
  resumeStateLoaded,
  embedded = false,
  includeSummary,
  onIncludeSummaryChange,
  onRetry,
  onCommit,
  onToggle,
  onMove,
  onRefine,
  onExport,
  toolbarRef,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onEditModeChange,
}: {
  resumeBusy: boolean;
  resumeBusyLabel: string | null;
  /** True only while compiling/downloading — not during generate/refine. */
  exporting: boolean;
  resume: OpportunityResumePreview | null;
  resumeError: string | null;
  resumePdfUrl: string | null;
  resumeStateLoaded: boolean;
  /**
   * Desktop split: plate border lifts while a contenteditable resume line is
   * focused (same chrome as email body → plate).
   */
  embedded?: boolean;
  includeSummary?: boolean;
  onIncludeSummaryChange?: (include: boolean) => void;
  onRetry: () => void;
  onCommit: (nodeId: string, content: string) => void;
  onToggle: (nodeId: string, selected: boolean) => void;
  onMove: (nodeId: string, direction: "up" | "down") => void;
  onRefine: (nodeId: string, instruction: string) => void;
  onExport: (format: "pdf" | "docx") => void;
  toolbarRef?: Ref<HTMLDivElement>;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  /** Desktop split: Ace-on-line or contenteditable focus → expand resume. */
  onEditModeChange?: (active: boolean) => void;
}) {
  const showEmptyGenerateState = resumeBusy && !resume;
  const settleKey = useContentSettleKey(resumeBusy);
  const [editingFocused, setEditingFocused] = useState(false);

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 min-w-0 w-full max-w-full flex-col lg:min-h-0",
        COMPOSER_SPLIT_PLATE_CLASSNAME,
        embedded && editingFocused && COMPOSER_SPLIT_PLATE_FOCUS_CLASSNAME
      )}
      onFocusCapture={(event) => {
        const resumeRoot = resumeRootFrom(event.currentTarget);
        if (isLineEditingFocus(event.target, resumeRoot)) {
          setEditingFocused(true);
        }
      }}
      onBlurCapture={(event) => {
        const plate = event.currentTarget;
        // Hop A→B: defer one frame; cancel exit if new focus is editable/local.
        requestAnimationFrame(() => {
          const active = document.activeElement;
          const resumeRoot = resumeRootFrom(plate);
          const kind = classifyResumeEditTarget(active, resumeRoot);
          if (kind === "editable" || kind === "resume-local") {
            setEditingFocused(kind === "editable");
            return;
          }
          setEditingFocused(false);
        });
      }}
    >
      <div
        key={settleKey}
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300"
      >
        {showEmptyGenerateState ? (
          <div className="relative min-h-0 flex-1">
            <DraftPaneBusyOverlay
              label={resumeBusyLabel ?? "Creating resume…"}
            />
          </div>
        ) : resumeError && !resume ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-3 text-center">
            <p className="text-sm text-destructive">{resumeError}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={resumeBusy || exporting}
              onClick={onRetry}
            >
              Retry
            </Button>
          </div>
        ) : resume?.draft ? (
          <ResumeDraftSheet
            draft={resume.draft}
            strategyRationale={resume.strategyRationale}
            disabled={resumeBusy}
            busyLabel={
              resumeBusy
                ? (resumeBusyLabel ?? "Working on resume…")
                : null
            }
            exporting={exporting}
            includeSummary={includeSummary}
            onIncludeSummaryChange={onIncludeSummaryChange}
            onCommit={onCommit}
            onToggle={onToggle}
            onMove={onMove}
            onRefine={onRefine}
            onExport={onExport}
            toolbarRef={toolbarRef}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={onUndo}
            onRedo={onRedo}
            lineEditing={editingFocused}
            onEditModeChange={onEditModeChange}
          />
        ) : resume && resumePdfUrl ? (
          <>
            <iframe
              title="Tailored resume preview"
              src={resumePdfUrl}
              className="min-h-0 w-full flex-1 border-0 bg-card"
            />
            {resume.strategyRationale ? (
              <ResumeStrategyPanel
                mode="collapsible"
                dock="bottom"
                strategyRationale={resume.strategyRationale}
              />
            ) : null}
          </>
        ) : resumeStateLoaded ? (
          <EmptyState
            size="sm"
            icon={FileText}
            title="No tailored resume yet"
            description="Create a tailored PDF for this opportunity. Nothing runs until you ask."
            className="m-3 flex-1 border-0 bg-transparent"
            action={
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={resumeBusy || exporting}
                onClick={onRetry}
              >
                Create Tailored Resume
              </Button>
            }
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            <LoadSkeletonStack
              message="Checking saved resume…"
              className="w-full max-w-sm"
            />
          </div>
        )}
      </div>
    </div>
  );
}
