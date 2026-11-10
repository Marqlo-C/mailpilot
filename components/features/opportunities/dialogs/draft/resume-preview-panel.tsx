import React from "react";
import { ChevronDown, ChevronUp, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CancelTaskButton } from "@/components/ui/composites/cancel-task-button";
import { ResumeDraftSheet } from "@/components/features/opportunities/drawer/resume-draft-sheet";
import type { OpportunityResumePreview } from "@/app/actions/opportunities";

export function ResumePreviewPanel({
  resumeBusy,
  resume,
  resumeError,
  busy,
  resumePdfUrl,
  showRationale,
  setShowRationale,
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
  resume: OpportunityResumePreview | null;
  resumeError: string | null;
  busy: boolean;
  resumePdfUrl: string | null;
  showRationale: boolean;
  setShowRationale: React.Dispatch<React.SetStateAction<boolean>>;
  resumeStateLoaded: boolean;
  onCancelTask: () => void;
  onRetry: () => void;
  onCommit: (nodeId: string, content: string) => void;
  onToggle: (nodeId: string, selected: boolean) => void;
  onMove: (nodeId: string, direction: "up" | "down") => void;
  onRefine: (nodeId: string, instruction: string) => void;
  onExport: (format: "pdf" | "docx") => void;
}) {
  return (
    <div className="mt-0 flex h-full min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-x-hidden overflow-hidden rounded-lg border border-border/60 bg-muted/10 pt-0 duration-300 animate-in fade-in-0 slide-in-from-right-4 lg:min-w-0">
      <div className="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col gap-2 overflow-x-hidden overflow-hidden p-0">
        {resumeBusy && !resume ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Tailoring resume…
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
              disabled={busy}
              onClick={onRetry}
            >
              Retry
            </Button>
          </div>
        ) : resume?.draft ? (
          <ResumeDraftSheet
            draft={resume.draft}
            strategyRationale={resume.strategyRationale}
            disabled={busy}
            exporting={resumeBusy}
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
              <div className="mx-2 mb-2 shrink-0 rounded-md border border-border/50 bg-card">
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
                        {resume.strategyRationale.selectedSkillsReasoning}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium text-foreground/80">
                        Featured Roles & Projects
                      </p>
                      <p className="mt-0.5 leading-relaxed">
                        {resume.strategyRationale.featuredExperiencesReasoning}
                      </p>
                      <p className="mt-1 leading-relaxed">
                        {resume.strategyRationale.featuredProjectsReasoning}
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
                Select &apos;Resume&apos; in the toolbar below and click
                &apos;Generate&apos; to tailor a PDF for this opportunity.
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
  );
}
