"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
export type ResumeDraftStrategyRationale = {
  roleFitAnalysis: string;
  selectedSkillsReasoning: string;
  featuredExperiencesReasoning: string;
  featuredProjectsReasoning: string;
};

export function ResumeStrategyPanel({
  strategyRationale,
}: {
  strategyRationale: ResumeDraftStrategyRationale;
}) {
  const [showRationale, setShowRationale] = useState(false);

  return (
    <div className="w-full max-w-full shrink-0 border-t border-border/60 bg-card px-2 py-2">
      <div className="w-full max-w-full rounded-md border border-border/50">
        <button
          type="button"
          className="flex w-full max-w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-foreground/90"
          onClick={() => setShowRationale((open) => !open)}
          aria-expanded={showRationale}
        >
          <span>ATS Strategy & Match Rationale</span>
          {showRationale ? (
            <ChevronUp className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          )}
        </button>
        {showRationale ? (
          <div className="max-h-40 space-y-2 overflow-y-auto overflow-x-hidden border-t border-border/50 px-3 py-2 text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground/80">Role fit. </span>
              {strategyRationale.roleFitAnalysis}
            </p>
            <p>
              <span className="font-medium text-foreground/80">Skills. </span>
              {strategyRationale.selectedSkillsReasoning}
            </p>
            <p>
              <span className="font-medium text-foreground/80">Experience. </span>
              {strategyRationale.featuredExperiencesReasoning}
            </p>
            <p>
              <span className="font-medium text-foreground/80">Projects. </span>
              {strategyRationale.featuredProjectsReasoning}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
