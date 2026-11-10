import React from "react";
import { FileText, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { selectCheckboxClassName } from "@/components/ui/styles/select-checkbox";
import { WaveToggle } from "@/components/ui/tactile/wave-toggle";
import type { OpportunityResumePreview } from "@/app/actions/opportunities";

export function DraftFooterControls({
  attachResume,
  handleAttachResumeChange,
  busy,
  resume,
  resumeSizeLabel,
  includeSummary,
  setIncludeSummary,
}: {
  attachResume: boolean;
  handleAttachResumeChange: (attach: boolean) => void;
  busy: boolean;
  resume: OpportunityResumePreview | null;
  resumeSizeLabel: string | null;
  includeSummary: boolean;
  setIncludeSummary: (include: boolean) => void;
}) {
  return (
    <div className="flex flex-none items-center justify-between gap-4 border-t bg-card px-6 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="attach-resume"
            checked={attachResume}
            onChange={(e) => handleAttachResumeChange(e.target.checked)}
            disabled={busy}
            className={selectCheckboxClassName({
              className:
                "h-3.5 w-3.5 shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
            })}
          />
          <Label
            htmlFor="attach-resume"
            className="cursor-pointer text-sm font-medium"
          >
            Attach Tailored Resume
          </Label>
        </div>
        {attachResume && resume ? (
          <div className="inline-flex min-w-0 max-w-[240px] items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-xs">
            <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">
              {resume.filename}
              {resumeSizeLabel ? ` (${resumeSizeLabel})` : ""}
            </span>
            <button
              type="button"
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => handleAttachResumeChange(false)}
              disabled={busy}
              aria-label="Remove resume attachment"
              title="Do not attach resume"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : null}
      </div>

      {attachResume ? (
        <div className="flex shrink-0 items-center gap-2">
          <WaveToggle
            id="opp-include-summary"
            checked={includeSummary}
            onCheckedChange={setIncludeSummary}
            disabled={busy}
          />
          <Label
            htmlFor="opp-include-summary"
            className="cursor-pointer text-sm font-medium"
          >
            Include Summary
          </Label>
        </div>
      ) : null}
    </div>
  );
}
