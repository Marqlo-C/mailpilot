"use client";

import { Bot } from "lucide-react";

import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ui/reasoning";
import type { StrategyRationale } from "@/lib/validations/resume-draft.schema";
import { cn } from "@/lib/utils";

/** @deprecated Prefer `StrategyRationale` from `@/lib/validations/resume-draft.schema`. */
export type ResumeDraftStrategyRationale = StrategyRationale;

const NOTE_SECTIONS: ReadonlyArray<{
  key: keyof StrategyRationale;
  label: string;
}> = [
  { key: "roleFitAnalysis", label: "Role fit" },
  { key: "selectedSkillsReasoning", label: "Skills" },
  { key: "featuredExperiencesReasoning", label: "Experience" },
  { key: "featuredProjectsReasoning", label: "Projects" },
];

function NotesBody({
  strategyRationale,
  sections,
  className,
}: {
  strategyRationale: StrategyRationale;
  sections: typeof NOTE_SECTIONS;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "max-h-72 space-y-0 overflow-y-auto overflow-x-hidden",
        className
      )}
    >
      {sections.map(({ key, label }, index) => (
        <div
          key={key}
          className={cn(
            "px-3 py-2.5",
            index > 0 && "border-t border-border/50"
          )}
        >
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="text-xs leading-relaxed text-foreground/85">
            {strategyRationale[key]}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * Tailoring rationale.
 * - `popover` — floating panel content (does not push layout).
 * - `collapsible` — accordion for the PDF-iframe fallback.
 */
export function ResumeStrategyPanel({
  strategyRationale,
  mode = "popover",
  dock = "bottom",
}: {
  strategyRationale: StrategyRationale;
  mode?: "popover" | "collapsible" | "inline";
  /** Only used by `collapsible` / legacy `inline`. */
  dock?: "top" | "bottom";
}) {
  const sections = NOTE_SECTIONS.filter(
    ({ key }) => strategyRationale[key].trim().length > 0
  );

  if (sections.length === 0) return null;

  if (mode === "popover" || mode === "inline") {
    return (
      <div className="flex w-full flex-col">
        <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
          <Bot className="size-3.5 text-muted-foreground" aria-hidden />
          <p className="text-xs font-semibold text-foreground">
            Tailoring notes
          </p>
        </div>
        <NotesBody
          strategyRationale={strategyRationale}
          sections={sections}
        />
      </div>
    );
  }

  const shellClass = cn(
    "w-full max-w-full shrink-0 bg-card px-2 py-1.5",
    dock === "top"
      ? "border-b border-border/60"
      : "rounded-b-lg border-t border-border/60"
  );

  return (
    <div className={shellClass}>
      <Reasoning defaultOpen={false} className="w-full max-w-full">
        <ReasoningTrigger className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          Tailoring Notes
        </ReasoningTrigger>
        <ReasoningContent className="border-t border-border/50">
          <NotesBody
            strategyRationale={strategyRationale}
            sections={sections}
          />
        </ReasoningContent>
      </Reasoning>
    </div>
  );
}
