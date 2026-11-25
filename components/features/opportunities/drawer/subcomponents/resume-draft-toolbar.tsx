"use client";

import type { Ref, RefObject } from "react";
import {
  Bot,
  CircleArrowDown,
  Gauge,
  Maximize,
  MessageSquare,
  MessageSquareMore,
  BotMessageSquare,
  Redo2,
  Summary,
  Undo2,
  WandSparkles,
} from "lucide-react";

import {
  appMenuClassNames,
  AppMenuContent,
  AppMenuItem,
} from "@/components/ui/app-menu";
import { Button } from "@/components/ui/button";
import {
  ToolbarClusterIconButton,
  ToolbarToolCluster,
} from "@/components/ui/composites/toolbar-tool-cluster";
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
import { BRAND_SELECTION_TOGGLE_ACTIVE_CLASSNAME } from "@/components/ui/styles/brand-selection";
import { FieldTrailingButton } from "@/components/ui/tactile/text-field";
import { NumericField } from "@/components/ui/tactile/numeric-field";
import { SegmentedControl } from "@/components/ui/tactile/segmented-tabs";
import { LabelTooltip } from "@/components/ui/tooltip";
import type {
  ResumeDraftZoomChoice,
  ResumeDraftZoomPreset,
} from "@/hooks/use-resume-draft-sheet";
import {
  RESUME_ZOOM_MAX,
  RESUME_ZOOM_MIN,
  RESUME_ZOOM_PERCENT_STEP,
} from "@/lib/resume-draft/edit-presentation";
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
  { value: "1" as const, label: "100%" },
  { value: "1.25" as const, label: "125%" },
];

export type ResumeDraftToolbarProps = {
  disabled?: boolean;
  exporting?: boolean;
  zoomChoice: ResumeDraftZoomChoice;
  onZoomChange: (value: ResumeDraftZoomPreset) => void;
  /** Live zoom as whole percent — tracks Fit / presets / pinch / typed. */
  zoomPercent: number;
  onZoomPercentChange: (percent: number) => void;
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
  /** Root strip — used to measure intrinsic min width for the draft split. */
  toolbarRef?: Ref<HTMLDivElement>;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
};

function ToolbarDivider() {
  return (
    <span
      aria-hidden
      className="mx-0.5 h-4 w-px shrink-0 self-center bg-border/70"
    />
  );
}

/** Zoom + summary/gauge/notes/export controls and refine / notes popovers. */
export function ResumeDraftToolbar({
  disabled,
  exporting,
  zoomChoice,
  onZoomChange,
  zoomPercent,
  onZoomPercentChange,
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
  toolbarRef,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}: ResumeDraftToolbarProps) {
  const showSummaryToggle =
    typeof includeSummary === "boolean" && Boolean(onIncludeSummaryChange);
  const showHistory = typeof onUndo === "function" && typeof onRedo === "function";

  return (
    <div
      ref={toolbarRef}
      data-resume-toolbar=""
      className="relative z-20 flex w-full max-w-full shrink-0 items-center gap-2 overflow-visible rounded-t-lg border-b border-border/60 bg-card/80 px-3 py-3 text-xs backdrop-blur-sm"
    >
      <div className="flex shrink-0 items-center gap-1.5">
        {showHistory ? (
          <>
            <ToolbarToolCluster label="History">
              <ToolbarClusterIconButton
                label="Undo"
                disabled={disabled || !canUndo}
                // Keep contenteditable focus so native undo still works.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onUndo?.()}
              >
                <Undo2 aria-hidden />
              </ToolbarClusterIconButton>
              <ToolbarClusterIconButton
                label="Redo"
                disabled={disabled || !canRedo}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onRedo?.()}
              >
                <Redo2 aria-hidden />
              </ToolbarClusterIconButton>
            </ToolbarToolCluster>
            <ToolbarDivider />
          </>
        ) : null}
        <div
          data-resume-zoom-control=""
          tabIndex={-1}
          className="flex items-center gap-1.5 outline-none"
        >
          <div
            onMouseDown={(event) => {
              // Keep contenteditable focus — chips must not steal caret / enter edit.
              event.preventDefault();
            }}
          >
            <SegmentedControl
              size="xs"
              label="Resume zoom"
              // Freeform (pinch / typed) uses a non-option value → no chip active.
              value={
                zoomChoice === "custom"
                  ? ("__custom__" as ResumeDraftZoomPreset)
                  : zoomChoice
              }
              onChange={onZoomChange}
              options={ZOOM_OPTIONS}
              disabled={disabled}
              className={cn("shrink-0", disabled && "pointer-events-none")}
            />
          </div>
          <NumericField
            value={zoomPercent}
            onChange={onZoomPercentChange}
            min={Math.round(RESUME_ZOOM_MIN * 100)}
            max={Math.round(RESUME_ZOOM_MAX * 100)}
            step={RESUME_ZOOM_PERCENT_STEP}
            percent
            steppers
            disabled={disabled}
            aria-label="Resume zoom percent"
            className="shrink-0"
          />
        </div>
      </div>

      <div
        className={cn(
          "ml-auto flex shrink-0 items-center gap-1.5 overflow-visible",
          disabled && "pointer-events-none"
        )}
      >
        {showSummaryToggle ? (
          <>
            <ToolbarDivider />
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
                variant="outline"
                size="sm"
                disabled={disabled}
                aria-pressed={includeSummary}
                aria-label={
                  includeSummary
                    ? "Hide summary section"
                    : "Show summary section"
                }
                className={cn(
                  "size-8 shrink-0 px-0 [&_svg]:size-3.5",
                  includeSummary && BRAND_SELECTION_TOGGLE_ACTIVE_CLASSNAME
                )}
                onClick={() => onIncludeSummaryChange?.(!includeSummary)}
              >
                <Summary aria-hidden />
              </Button>
            </LabelTooltip>
            <ToolbarDivider />
          </>
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
          data-resume-ace-refine=""
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
                aria-label="Refine line"
                disabled={disabled || !instruction.trim()}
              >
                <WandSparkles className="size-3.5" aria-hidden />
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
