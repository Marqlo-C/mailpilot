"use client";

import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ui/reasoning";

export type ResumeDraftStrategyRationale = {
  roleFitAnalysis: string;
  selectedSkillsReasoning: string;
  featuredExperiencesReasoning: string;
  featuredProjectsReasoning: string;
};

/**
 * Compact, collapsed-by-default ATS notes. Opt-in expand — never auto-opens
 * during regenerate (that UI is covered by the pane busy overlay anyway).
 */
export function ResumeStrategyPanel({
  strategyRationale,
}: {
  strategyRationale: ResumeDraftStrategyRationale;
}) {
  return (
    <div className="w-full max-w-full shrink-0 rounded-b-lg border-t border-border/60 bg-card px-2 py-1.5">
      <Reasoning
        defaultOpen={false}
        className="w-full max-w-full rounded-md border border-border/50"
      >
        <ReasoningTrigger className="px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground">
          ATS strategy
        </ReasoningTrigger>
        <ReasoningContent
          className="border-t border-border/50"
          contentClassName="max-h-28 space-y-1.5 overflow-y-auto overflow-x-hidden px-2.5 py-2 text-[11px] leading-relaxed"
        >
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
        </ReasoningContent>
      </Reasoning>
    </div>
  );
}
