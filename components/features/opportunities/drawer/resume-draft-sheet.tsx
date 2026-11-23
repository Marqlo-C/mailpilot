"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  CircleArrowDown,
  Maximize,
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
import { Loader } from "@/components/ui/loader";
import { SegmentedControl } from "@/components/ui/tactile/segmented-tabs";
import { LabelTooltip } from "@/components/ui/tooltip";
import type { ResumeDraftNode, TailoredResumeDraft } from "@/lib/resume-draft";
import type { StrategyRationale } from "@/lib/validations/resume-draft.schema";
import { cn } from "@/lib/utils";
import {
  RESUME_FONTS,
  RESUME_SPACING,
  RESUME_TYPOGRAPHY,
} from "@/lib/resume-draft/layout.schema";

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

type ZoomChoice = (typeof ZOOM_OPTIONS)[number]["value"];

import {
  SHEET_WIDTH,
  PAGE_HEIGHT,
  PAGE_PADDING_TOP,
  PAGE_PADDING_BOTTOM,
  PAGE_PADDING_X,
  PRINTABLE_HEIGHT,
  PAGE_GAP,
  SECTION_HEADING_CLASS,
  type DraftBlock,
  getBlockId,
  estimateBlockHeight,
  buildBlocks,
  getEntityTotalHeight,
  partitionBlocksIntoPages,
} from "./subcomponents/resume-draft-layout";
import { ResumeDraftNodeBlock } from "./subcomponents/resume-draft-node-block";
import { ResumeLineChromeProvider } from "./subcomponents/resume-line-chrome";
import { ResumeSkillsParagraph } from "./subcomponents/resume-skills-paragraph";
import { ResumeStrategyPanel } from "./subcomponents/resume-strategy-panel";

export {
  SHEET_WIDTH,
  PAGE_HEIGHT,
  PAGE_PADDING_TOP,
  PAGE_PADDING_BOTTOM,
  PAGE_PADDING_X,
  PRINTABLE_HEIGHT,
  PAGE_GAP,
  type DraftBlock,
  getBlockId,
  estimateBlockHeight,
  buildBlocks,
  getEntityTotalHeight,
  partitionBlocksIntoPages,
};

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function ResumeDraftSheet({
  draft,
  disabled,
  onCommit,
  onToggle,
  onMove,
  onRefine,
  onExport,
  exporting,
  strategyRationale,
  includeSummary,
  onIncludeSummaryChange,
}: {
  draft: TailoredResumeDraft;
  disabled?: boolean;
  exporting?: boolean;
  onCommit: (nodeId: string, content: string) => void;
  onToggle: (nodeId: string, selected: boolean) => void;
  onMove: (nodeId: string, direction: "up" | "down") => void;
  onRefine: (nodeId: string, instruction: string) => void;
  onExport: (format: "pdf" | "docx") => void;
  strategyRationale?: StrategyRationale | null;
  includeSummary?: boolean;
  onIncludeSummaryChange?: (include: boolean) => void;
}) {
  const [refineFor, setRefineFor] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [zoomChoice, setZoomChoice] = useState<ZoomChoice>("fit");
  const [fitScale, setFitScale] = useState(0.7);
  const [blockHeights, setBlockHeights] = useState<Record<string, number>>({});
  const [notesOpen, setNotesOpen] = useState(false);

  const notesPanelRef = useRef<HTMLDivElement>(null);
  const notesTriggerRef = useRef<HTMLButtonElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => {
      // Equal desk inset (p-3 = 12px each side).
      const available = viewport.clientWidth - 24;
      if (available <= 0) return;
      setFitScale(Math.min(1, available / SHEET_WIDTH));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!notesOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (notesPanelRef.current?.contains(target)) return;
      if (notesTriggerRef.current?.contains(target)) return;
      setNotesOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotesOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [notesOpen]);

  const zoom = zoomChoice === "fit" ? fitScale : Number(zoomChoice);

  const blocks = useMemo(() => {
    const all = buildBlocks(draft);
    if (includeSummary === false) {
      return all.filter(
        (block) =>
          !(block.kind === "node" && block.node.section === "summary")
      );
    }
    return all;
  }, [draft, includeSummary]);
  const selectedIds = useMemo(
    () =>
      new Set(draft.nodes.filter((node) => node.selected).map((node) => node.id)),
    [draft.nodes]
  );
  /** Matches export: excluded if self or parent is unchecked. */
  function isIncluded(node: ResumeDraftNode): boolean {
    if (!node.selected) return false;
    if (node.parentId && !selectedIds.has(node.parentId)) return false;
    return true;
  }
  const firstHeadingBlock = blocks.find(
    (b) => b.kind === "skills" || (b.kind === "node" && Boolean(b.heading))
  );
  const firstHeadingBlockId = firstHeadingBlock
    ? getBlockId(firstHeadingBlock)
    : null;

  const remeasure = useCallback(() => {
    const container = pagesContainerRef.current;
    if (!container) return;

    const elements = container.querySelectorAll<HTMLElement>(
      "[data-draft-block-id]"
    );
    let hasChanged = false;
    const nextHeights: Record<string, number> = {};

    elements.forEach((el) => {
      const id = el.getAttribute("data-draft-block-id");
      if (!id) return;
      // offsetHeight provides unscaled CSS pixels independent of zoom transforms.
      // Include vertical margins (marginTop + marginBottom) so layout matches physical point geometry.
      const comp = window.getComputedStyle(el);
      const marginTop = parseFloat(comp.marginTop) || 0;
      const marginBottom = parseFloat(comp.marginBottom) || 0;
      const measured = Math.ceil(el.offsetHeight + marginTop + marginBottom);
      nextHeights[id] = measured;
      const previous = blockHeights[id];
      if (previous === undefined || Math.abs(previous - measured) > 1) {
        hasChanged = true;
      }
    });

    if (hasChanged || Object.keys(blockHeights).length !== Object.keys(nextHeights).length) {
      setBlockHeights(nextHeights);
    }
  }, [blockHeights]);

  useIsomorphicLayoutEffect(() => {
    remeasure();
  }, [blocks, refineFor, remeasure]);

  useEffect(() => {
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        remeasure();
      });
    }
  }, [remeasure]);

  const pages = useMemo(
    () => partitionBlocksIntoPages(blocks, blockHeights, refineFor),
    [blocks, blockHeights, refineFor]
  );

  const displayPages = pages.length > 0 ? pages : [[]];
  const totalPages = displayPages.length;
  const totalCanvasHeight =
    totalPages * PAGE_HEIGHT + Math.max(0, totalPages - 1) * PAGE_GAP;

  function refineForm(nodeId: string) {
    if (refineFor !== nodeId) return null;
    return (
      <form
        className="mt-1 flex w-full min-w-0 gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          const next = instruction.trim();
          if (!next) return;
          onRefine(nodeId, next);
          setInstruction("");
          setRefineFor(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setInstruction("");
            setRefineFor(null);
          }
        }}
      >
        <input
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="Rewrite this line…"
          disabled={disabled}
          autoFocus
          className="min-w-0 flex-1 rounded border border-[#D1D5DB] px-1.5 py-0.5 text-xs outline-none"
        />
        <button
          type="submit"
          disabled={disabled || !instruction.trim()}
          className="rounded bg-[#111827] px-1.5 py-0.5 text-xs text-white disabled:opacity-40"
        >
          Apply
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setInstruction("");
            setRefineFor(null);
          }}
          className="rounded border border-[#D1D5DB] px-1.5 py-0.5 text-xs text-[#6b7280] hover:text-[#111827]"
        >
          Cancel
        </button>
      </form>
    );
  }

  function renderBlock(block: DraftBlock) {
    const blockId = getBlockId(block);
    const isFirstHeading = blockId === firstHeadingBlockId;

    if (block.kind === "skills") {
      return (
        <div
          key={blockId}
          data-draft-block-id={blockId}
          className="min-w-0 max-w-full flow-root"
        >
          <h3
            className={SECTION_HEADING_CLASS}
            style={{
              fontSize: `${RESUME_TYPOGRAPHY.heading.px}px`,
              marginTop: isFirstHeading ? 0 : `${RESUME_SPACING.sectionBefore.px}px`,
              marginBottom: `${RESUME_SPACING.sectionHeadingBottom.px}px`,
            }}
          >
            Skills
          </h3>
          <ResumeSkillsParagraph
            nodes={block.nodes}
            disabled={disabled}
            isIncluded={isIncluded}
            onCommit={onCommit}
            refineSlot={block.nodes.map((node) => (
              <div key={`${node.id}-refine`}>{refineForm(node.id)}</div>
            ))}
          />
        </div>
      );
    }

    const { node, heading } = block;
    return (
      <div key={blockId} data-draft-block-id={blockId}>
        <ResumeDraftNodeBlock
          node={node}
          heading={heading}
          isFirstHeading={isFirstHeading}
          disabled={disabled}
          included={isIncluded(node)}
          onCommit={onCommit}
          refineSlot={refineForm(node.id)}
        />
      </div>
    );
  }

  const pageCountLabel =
    totalPages === 1 ? "1 page" : `${totalPages} pages`;

  return (
    <ResumeLineChromeProvider
      disabled={disabled}
      onToggle={onToggle}
      onMove={onMove}
      onRefineOpen={(nodeId) => {
        setRefineFor(nodeId);
        setInstruction("");
      }}
    >
    <div className="relative flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden rounded-lg">
      {/* py-3 matches email pane field inset so To and this rail share one horizon. */}
      <div className="relative z-20 flex w-full max-w-full shrink-0 items-center gap-2 rounded-t-lg border-b border-border/60 bg-card/80 px-3 py-3 text-xs backdrop-blur-sm">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <SegmentedControl
            size="sm"
            label="Resume zoom"
            value={zoomChoice}
            onChange={setZoomChoice}
            options={ZOOM_OPTIONS}
          />
          <LabelTooltip
            label="Estimated length from the current draft — not a setting. Edit content to change page count."
            side="bottom"
            contentClassName="max-w-[16rem] text-left"
          >
            <span
              className="shrink-0 tabular-nums text-muted-foreground"
              aria-live="polite"
            >
              {pageCountLabel}
            </span>
          </LabelTooltip>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {typeof includeSummary === "boolean" && onIncludeSummaryChange ? (
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
                onClick={() => onIncludeSummaryChange(!includeSummary)}
              >
                <Summary aria-hidden />
              </Button>
            </LabelTooltip>
          ) : null}
          {strategyRationale ? (
            <Button
              ref={notesTriggerRef}
              type="button"
              variant={notesOpen ? "secondary" : "outline"}
              size="sm"
              aria-expanded={notesOpen}
              aria-label="Tailoring notes"
              title="Tailoring notes"
              className="h-8 w-8 px-0 [&_svg]:size-[1.125rem]"
              onClick={() => setNotesOpen((open) => !open)}
            >
              <Bot strokeWidth={1.5} aria-hidden />
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || exporting}
                className="h-8 w-8 px-0 [&_svg]:size-3.5"
                aria-label={
                  exporting ? "Preparing resume file" : "Download resume"
                }
                title={exporting ? "Preparing…" : "Download"}
              >
                {exporting ? (
                  <Loader size="sm" />
                ) : (
                  <CircleArrowDown aria-hidden />
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
      </div>

      <div
        ref={viewportRef}
        className="flex h-full min-h-0 w-full max-w-full flex-1 overflow-auto bg-background/75 p-3"
      >
        <div
          className="mx-auto shrink-0"
          style={{
            width: SHEET_WIDTH * zoom,
            height: totalCanvasHeight * zoom,
          }}
        >
          <div
            ref={pagesContainerRef}
            className="flex flex-col gap-6 origin-top-left transition-transform duration-150 ease-apple-snappy"
            style={{
              width: SHEET_WIDTH,
              transform: `scale(${zoom})`,
            }}
          >
            {displayPages.map((pageBlocks, pageIndex) => (
              <div
                key={pageIndex}
                className="relative overflow-hidden rounded-sm bg-white text-[#111827] shadow-lg ring-1 ring-black/5"
                style={{
                  width: `${SHEET_WIDTH}px`,
                  height: `${PAGE_HEIGHT}px`,
                  maxHeight: `${PAGE_HEIGHT}px`,
                  paddingTop: `${PAGE_PADDING_TOP}px`,
                  paddingBottom: `${PAGE_PADDING_BOTTOM}px`,
                  paddingLeft: `${PAGE_PADDING_X}px`,
                  paddingRight: `${PAGE_PADDING_X}px`,
                  fontFamily: RESUME_FONTS.fallbackCss,
                  fontSize: `${RESUME_TYPOGRAPHY.body.px}px`,
                  lineHeight: RESUME_TYPOGRAPHY.body.lineHeight,
                }}
              >
                <div
                  className="w-full"
                  style={{
                    maxHeight: `${PRINTABLE_HEIGHT}px`,
                  }}
                >
                  {pageBlocks.map((block) => renderBlock(block))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    </ResumeLineChromeProvider>
  );
}
