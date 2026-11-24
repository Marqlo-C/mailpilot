"use client";

import type { RefObject } from "react";
import {
  Bot,
  Check,
  CircleArrowDown,
  Gauge,
  Maximize,
  MessageSquare,
  MessageSquareMore,
  BotMessageSquare,
  Summary,
} from "lucide-react";

import {
  appMenuClassNames,
  AppMenuContent,
  AppMenuItem,
} from "@/components/ui/app-menu";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Loader } from "@/components/ui/loader";
import {
  DASHED_BORDER_RING_PARENT_SVG_CLASSNAME,
  DASHED_OUTLINE_STROKE_CLASSNAME,
  DashedBorderRing,
} from "@/components/ui/tactile/dashed-border-ring";
import { FieldTrailingButton } from "@/components/ui/tactile/text-field";
import { SegmentedControl } from "@/components/ui/tactile/segmented-tabs";
import { LabelTooltip } from "@/components/ui/tooltip";
import type { ResumeDraftZoomChoice } from "@/hooks/use-resume-draft-sheet";
import type { StrategyRationale } from "@/lib/validations/resume-draft.schema";
import { cn } from "@/lib/utils";

import type { ResumeDraftInsights } from "./resume-draft-insights";
import { ResumeStrategyPanel } from "./resume-strategy-panel";

const ZOOM_OPTIONS = [
  {
    value: "fit" as const,
    label: (
      <>
        <Maximize className="size-3.5" aria-hidden />
        <span className="sr-only">Fit</span>
      </>
    ),
  },
  { value: "0.85" as const, label: "85%" },
  { value: "1" as const, label: "100%" },
  { value: "1.25" as const, label: "125%" },
];

export type ResumeDraftToolbarProps = {
  disabled?: boolean;
  exporting?: boolean;
  zoomChoice: ResumeDraftZoomChoice;
  onZoomChange: (value: ResumeDraftZoomChoice) => void;
  includeSummary?: boolean;
  onIncludeSummaryChange?: (include: boolean) => void;
  draftInsights: ResumeDraftInsights;
  strategyRationale?: StrategyRationale | null;
  notesOpen: boolean;
  onToggleNotes: () => void;
  notesTriggerRef: RefObject<HTMLButtonElement | null>;
  notesPanelRef: RefObject<HTMLDivElement | null>;
  onExport: (format: "pdf" | "docx") => void;
  refineFor: string | null;
  instruction: string;
  onInstructionChange: (value: string) => void;
  refinePanelRef: RefObject<HTMLFormElement | null>;
  onSubmitRefine: () => void;
  onDismissRefine: () => void;
};

/** Zoom + summary/gauge/notes/export controls and refine / notes popovers. */
export function ResumeDraftToolbar({
  disabled,
  exporting,
  zoomChoice,
  onZoomChange,
  includeSummary,
  onIncludeSummaryChange,
  draftInsights,
  strategyRationale,
  notesOpen,
  onToggleNotes,
  notesTriggerRef,
  notesPanelRef,
  onExport,
  refineFor,
  instruction,
  onInstructionChange,
  refinePanelRef,
  onSubmitRefine,
  onDismissRefine,
}: ResumeDraftToolbarProps) {
  const showSummaryToggle =
    typeof includeSummary === "boolean" && Boolean(onIncludeSummaryChange);

  return (
    <div className="relative z-20 flex w-full max-w-full shrink-0 items-center gap-2 overflow-visible rounded-t-lg border-b border-border/60 bg-card/80 px-3 py-3 text-xs backdrop-blur-sm">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <SegmentedControl
          size="sm"
          label="Resume zoom"
          value={zoomChoice}
          onChange={onZoomChange}
          options={ZOOM_OPTIONS}
          disabled={disabled}
          className={cn(disabled && "pointer-events-none")}
        />
      </div>

      <div
        className={cn(
          "flex shrink-0 items-center gap-1.5 overflow-visible",
          disabled && "pointer-events-none"
        )}
      >
        {showSummaryToggle ? (
          <LabelTooltip
            label={
              includeSummary
                ? "Hide summary section"
                : "Show summary section"
            }
            side="bottom"
          >
            <Button
              type="button"
              variant={includeSummary ? "secondary" : "outline"}
              size="sm"
              disabled={disabled}
              aria-pressed={includeSummary}
              aria-label={
                includeSummary
                  ? "Hide summary section"
                  : "Show summary section"
              }
              className="h-8 w-8 px-0 [&_svg]:size-3.5"
              onClick={() => onIncludeSummaryChange?.(!includeSummary)}
            >
              <Summary aria-hidden />
            </Button>
          </LabelTooltip>
        ) : null}
        {showSummaryToggle ? (
          <span
            aria-hidden
            className="mx-0.5 h-4 w-px shrink-0 self-center bg-border/70"
          />
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              aria-label={`Draft details: ${draftInsights.lengthLabel}`}
              title="Draft details"
              className={cn(
                "h-8 w-8 px-0 [&_svg]:size-3.5",
                // Skip spill chrome while locked — remasure after regen can flash amber.
                !disabled &&
                  draftInsights.spilled &&
                  "border-amber-600/40 text-amber-700 hover:text-amber-800"
              )}
            >
              <Gauge aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <AppMenuContent align="end" className="w-[15.5rem]">
            <div className="space-y-2.5 px-2.5 py-1.5">
              <div>
                <p className="text-xs font-semibold tabular-nums text-foreground">
                  {draftInsights.lengthLabel}
                </p>
                <p className="mt-0.5 text-xs font-normal leading-snug text-muted-foreground">
                  {draftInsights.lengthDetail}
                </p>
              </div>
              <dl className="space-y-1.5 border-t border-border/50 pt-2">
                {draftInsights.rows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-baseline justify-between gap-3 text-xs"
                  >
                    <dt className="text-muted-foreground">{row.label}</dt>
                    <dd className="shrink-0 tabular-nums font-medium text-foreground">
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </AppMenuContent>
        </DropdownMenu>
        {strategyRationale ? (
          <Button
            ref={notesTriggerRef}
            type="button"
            variant={notesOpen ? "secondary" : "outline"}
            size="sm"
            disabled={disabled}
            aria-expanded={notesOpen}
            aria-label="Tailoring notes"
            title="Tailoring notes"
            className={cn(
              "group relative h-8 w-8 overflow-visible border border-input px-0 motion-safe:active:scale-100 [&_svg]:size-[19px] [&_svg.notes-msg]:!size-[14px]",
              DASHED_BORDER_RING_PARENT_SVG_CLASSNAME,
              notesOpen && "border-transparent"
            )}
            onClick={onToggleNotes}
          >
            <Bot strokeWidth={1.5} aria-hidden />
            <MessageSquare
              strokeWidth={1.9}
              aria-hidden
              className={cn(
                "notes-msg pointer-events-none absolute -right-1 -top-1 !size-[14px] transition-[fill] duration-150 ease-apple-snappy",
                notesOpen
                  ? cn(
                      "fill-secondary group-hover:fill-secondary/80",
                      DASHED_OUTLINE_STROKE_CLASSNAME
                    )
                  : "fill-card text-foreground/40 group-hover:fill-accent"
              )}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_top_right,#000_70%,transparent_92%)] [-webkit-mask-image:linear-gradient(to_top_right,#000_70%,transparent_92%)]"
            >
              <MessageSquare
                strokeWidth={1.9}
                className={cn(
                  "notes-msg absolute -right-1 -top-1 !size-[14px] transition-[fill] duration-150 ease-apple-snappy",
                  notesOpen
                    ? cn(
                        "fill-secondary group-hover:fill-secondary/80",
                        DASHED_OUTLINE_STROKE_CLASSNAME
                      )
                    : "fill-card text-foreground group-hover:fill-accent"
                )}
              />
            </span>
            <MessageSquareMore
              strokeWidth={1.9}
              aria-hidden
              className="notes-msg pointer-events-none absolute -right-1 -top-1 !size-[14px] text-foreground [&_path:first-child]:opacity-0"
            />
            {notesOpen ? <DashedBorderRing cutout="top-right" /> : null}
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || exporting}
              className="h-8 w-8 px-0 [&_svg]:size-4"
              aria-label={
                exporting ? "Preparing resume file" : "Download resume"
              }
              title={exporting ? "Preparing…" : "Download"}
            >
              {exporting ? (
                <Loader size="sm" />
              ) : (
                <CircleArrowDown strokeWidth={1.5} aria-hidden />
              )}
            </Button>
          </DropdownMenuTrigger>
          <AppMenuContent align="end" className="min-w-0 w-max">
            <AppMenuItem
              disabled={disabled || exporting}
              onClick={() => onExport("pdf")}
            >
              PDF
            </AppMenuItem>
            <AppMenuItem
              disabled={disabled || exporting}
              onClick={() => onExport("docx")}
            >
              DOCX
            </AppMenuItem>
          </AppMenuContent>
        </DropdownMenu>
      </div>

      {notesOpen && strategyRationale ? (
        <div
          ref={notesPanelRef}
          role="dialog"
          aria-label="Tailoring notes"
          className={cn(
            appMenuClassNames.light.content,
            "absolute left-3 right-3 top-full z-30 mt-1.5 max-h-[min(24rem,70vh)] overflow-hidden bg-card p-0 backdrop-blur-none"
          )}
        >
          <ResumeStrategyPanel
            mode="popover"
            strategyRationale={strategyRationale}
          />
        </div>
      ) : null}

      {refineFor ? (
        <form
          ref={refinePanelRef}
          role="dialog"
          aria-label="Ask Ace to refine this line"
          className={cn(
            appMenuClassNames.light.content,
            "absolute left-3 right-3 top-full z-30 mt-1.5 flex items-center gap-1.5 bg-card p-2 backdrop-blur-none"
          )}
          onSubmit={(event) => {
            event.preventDefault();
            onSubmitRefine();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onDismissRefine();
            }
          }}
        >
          <Input
            leadingIcon={BotMessageSquare}
            leadingIconClassName="size-[18px]"
            placeholder="Ask Ace to refine this line (e.g., tighter, stronger verb, more impact)…"
            value={instruction}
            onChange={(event) => onInstructionChange(event.target.value)}
            disabled={disabled}
            autoFocus
            clearable
            onClear={() => onInstructionChange("")}
            className="min-w-0 flex-1"
            aria-label="Ask Ace to refine this line"
            trailing={
              <FieldTrailingButton
                type="submit"
                aria-label="Apply rewrite"
                disabled={disabled || !instruction.trim()}
              >
                <Check className="size-3.5" aria-hidden />
              </FieldTrailingButton>
            }
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0"
            disabled={disabled}
            onClick={onDismissRefine}
          >
            Cancel
          </Button>
        </form>
      ) : null}
    </div>
  );
}
