import {
  ArrowBigLeftDash,
  ExternalLink,
  RotateCcw,
} from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { ResumeDraftSheet } from "@/components/features/opportunities/drawer/resume-draft-sheet";
import { cn } from "@/lib/utils";
import type { TailoredResumeDraft } from "@/lib/resume-draft";
import type { OpportunityResumePreview } from "../../lib/types";

export type ResumeDraftViewProps = {
  preview: OpportunityResumePreview;
  baseUrl: string;
  isTailoring: boolean;
  isExporting: boolean;
  exportMessage: string | null;
  includeSummary: boolean;
  pageBudget: "auto" | 1 | 2;
  onBackToJob: () => void;
  onRegenerate: () => void;
  onToggleSummary: (val: boolean) => void;
  onSetPageBudget: (val: "auto" | 1 | 2) => void;
  onExport: (format: "pdf" | "docx") => void;
  onCommit: (nodeId: string, text: string) => void;
  onToggle: (nodeId: string, active: boolean) => void;
  onMove: (nodeId: string, direction: "up" | "down") => void;
  onRefine: (nodeId: string, instruction: string) => void;
};

export function ResumeDraftView({
  preview,
  baseUrl,
  isTailoring,
  isExporting,
  exportMessage,
  includeSummary,
  pageBudget,
  onBackToJob,
  onRegenerate,
  onToggleSummary,
  onSetPageBudget,
  onExport,
  onCommit,
  onToggle,
  onMove,
  onRefine,
}: ResumeDraftViewProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Draft Action Bar */}
      <div className="sticky top-0 z-20 relative flex items-center justify-between border-b border-border/50 bg-card/80 px-3 py-2 shadow-sm backdrop-blur-md">
        {/* Left Group: Job Back + Regenerate Buttons */}
        <div className="z-10 flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onBackToJob}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-input/60 bg-card px-2.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer"
            title="Back to Job Details"
          >
            <ArrowBigLeftDash className="h-3.5 w-3.5 fill-current" />
            <span>Job</span>
          </button>

          <button
            type="button"
            onClick={onRegenerate}
            disabled={isTailoring}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-input/60 bg-card px-2.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer disabled:pointer-events-none disabled:opacity-50"
            title="Regenerate Tailored Resume"
          >
            <RotateCcw className={cn("h-3 w-3", isTailoring && "animate-spin")} />
            <span>{isTailoring ? "Regenerating…" : "Regenerate"}</span>
          </button>
        </div>

        {/* Center Group: Summary & Budget Controls */}
        <div className="pointer-events-none absolute inset-x-0 inset-y-0 flex items-center justify-center">
          <div className="pointer-events-auto flex items-center gap-2.5">
            <label className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-foreground/80 hover:text-foreground cursor-pointer select-none">
              <Checkbox
                checked={includeSummary}
                onCheckedChange={(val) => onToggleSummary(Boolean(val))}
              />
              <span>Summary</span>
            </label>

            <div className="h-3.5 w-px bg-border/60 shrink-0" aria-hidden="true" />

            <div className="inline-flex rounded-md border border-input/60 bg-card p-0.5 shadow-sm">
              {(["auto", 1, 2] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => onSetPageBudget(b)}
                  className={cn(
                    "rounded px-2 py-0.5 text-xs font-medium transition-colors",
                    pageBudget === b
                      ? "bg-muted text-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  {b === "auto" ? "Auto" : `${b}p`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Group: View in Leads in Toolbar Button Style */}
        <div className="z-10 flex items-center shrink-0">
          <a
            href={`${baseUrl}/jobs?tab=leads`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-input/60 bg-card px-2.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            title="View leads in MailPilot"
          >
            <span>View in Leads</span>
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </a>
        </div>
      </div>

      {exportMessage && (
        <div className="bg-primary/10 border-b border-primary/20 px-3 py-1.5 text-center text-xs font-medium text-primary">
          {exportMessage}
        </div>
      )}

      {/* Embedded ResumeDraftSheet Container */}
      <div className="flex-1 min-h-0 overflow-hidden bg-muted/10">
        <ResumeDraftSheet
          draft={preview.draft}
          disabled={isTailoring}
          exporting={isExporting}
          onExport={onExport}
          onCommit={onCommit}
          onToggle={onToggle}
          onMove={onMove}
          onRefine={onRefine}
        />
      </div>
    </div>
  );
}
