import React from "react";
import { FileText } from "lucide-react";
import { Loader } from "@/components/ui/loader";
import { Button } from "@/components/ui/button";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { CancelTaskButton } from "@/components/ui/composites/cancel-task-button";
import { LoadSkeletonStack } from "@/components/ui/composites/load-skeleton-stack";
import { ResumeDraftSheet } from "@/components/features/opportunities/drawer/resume-draft-sheet";
import { ResumeStrategyPanel } from "@/components/features/opportunities/drawer/subcomponents/resume-strategy-panel";
import { useContentSettleKey } from "@/hooks/use-content-settle-key";
import type { OpportunityResumePreview } from "@/app/actions/opportunities";
import { DraftPaneBusyOverlay } from "./draft-pane-busy-overlay";

export function ResumePreviewPanel({
  resumeBusy,
  resumeBusyLabel,
  exporting,
  resume,
  resumeError,
  resumePdfUrl,
  resumeStateLoaded,
  onCancelTask,
  onRetry,
  onCommit,
  onToggle,
  onMove,
  onRefine,
  onExport,
}: {
  resumeBusy: boolean;
  resumeBusyLabel: string | null;
  /** True only while compiling/downloading — not during generate/refine. */
  exporting: boolean;
  resume: OpportunityResumePreview | null;
  resumeError: string | null;
  resumePdfUrl: string | null;
  resumeStateLoaded: boolean;
  onCancelTask: () => void;
  onRetry: () => void;
  onCommit: (nodeId: string, content: string) => void;
  onToggle: (nodeId: string, selected: boolean) => void;
  onMove: (nodeId: string, direction: "up" | "down") => void;
  onRefine: (nodeId: string, instruction: string) => void;
  onExport: (format: "pdf" | "docx") => void;
}) {
  const showEmptyGenerateState = resumeBusy && !resume;
  const showContentOverlay = resumeBusy && Boolean(resume);
  const settleKey = useContentSettleKey(resumeBusy);

  return (
    <div className="relative mt-0 flex h-full min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-x-hidden overflow-hidden rounded-lg border border-border/60 bg-muted/10 pt-0 duration-300 animate-in fade-in-0 slide-in-from-right-4 lg:min-w-0">
      <div
        key={settleKey}
        className="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col gap-2 overflow-x-hidden overflow-hidden p-0 animate-in fade-in-0 duration-300"
      >
        {showEmptyGenerateState ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-3 text-sm">
            <div className="flex items-center gap-2">
              <Loader size="md" />
              <TextShimmer>
                {resumeBusyLabel ?? "Tailoring resume…"}
              </TextShimmer>
            </div>
            <CancelTaskButton
              title="Cancel generation"
              onCancel={onCancelTask}
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
            exporting={exporting}
            onCommit={onCommit}
            onToggle={onToggle}
            onMove={onMove}
            onRefine={onRefine}
            onExport={onExport}
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
                strategyRationale={resume.strategyRationale}
              />
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
                Select &apos;Resume&apos; in the toolbar below and click
                &apos;Generate&apos; to tailor a PDF for this opportunity.
                Nothing runs until you ask.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            <LoadSkeletonStack
              message="Checking saved resume…"
              className="w-full max-w-sm"
            />
          </div>
        )}
      </div>

      {showContentOverlay ? (
        <DraftPaneBusyOverlay
          label={resumeBusyLabel ?? "Working on resume…"}
          cancelTitle="Cancel resume task"
          onCancel={onCancelTask}
        />
      ) : null}
    </div>
  );
}
