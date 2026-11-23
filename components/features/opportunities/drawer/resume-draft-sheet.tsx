"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  ChevronDown,
  ChevronUp,
  CircleArrowDown,
  Sparkles,
  Summary,
} from "lucide-react";

import {
  appMenuClassNames,
  AppMenuContent,
  AppMenuItem,
} from "@/components/ui/app-menu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader } from "@/components/ui/loader";
import { SegmentedControl } from "@/components/ui/tactile/segmented-tabs";
import { LabelTooltip } from "@/components/ui/tooltip";
import { skillCategoryLabel } from "@/lib/profile/skill-groups";
import type { ResumeDraftNode, TailoredResumeDraft } from "@/lib/resume-draft";
import type { StrategyRationale } from "@/lib/validations/resume-draft.schema";
import { cn } from "@/lib/utils";
import {
  formatEducationDates,
  parseContactHeaderItems,
  sanitizeResumeContactLine,
} from "@/lib/utils/format";
import {
  RESUME_FONTS,
  RESUME_PAGE_GEOMETRY,
  RESUME_SPACING,
  RESUME_TYPOGRAPHY,
} from "@/lib/resume-draft/layout.schema";

const ZOOM_OPTIONS = [
  { value: "fit", label: "Fit" },
  { value: "0.85", label: "85%" },
  { value: "1", label: "100%" },
  { value: "1.25", label: "125%" },
] as const;

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
import {
  EditableLine,
  datesFor,
  skillLabel,
  projectTrailing,
  renderEducationHtml,
  renderExperienceHtml,
} from "./subcomponents/resume-node-editor";
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

  function lineTools(nodeId: string) {
    return (
      <div className="pointer-events-none absolute right-0 top-0 z-10 flex bg-white/95 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
        <button
          type="button"
          disabled={disabled}
          aria-label="Move line up"
          onClick={() => onMove(nodeId, "up")}
          className="text-[#6b7280] hover:text-[#111827]"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-label="Move line down"
          onClick={() => onMove(nodeId, "down")}
          className="text-[#6b7280] hover:text-[#111827]"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-label="Refine this line"
          onClick={() => {
            setRefineFor(nodeId);
            setInstruction("");
          }}
          className="text-[#6b7280] hover:text-[#111827]"
        >
          <Sparkles className="h-3 w-3" />
        </button>
      </div>
    );
  }

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
          <div className="group relative">
            <div className="absolute -left-6 top-[2px] flex flex-col gap-px">
              {block.nodes.map((node) => (
                <Checkbox
                  key={node.id}
                  checked={node.selected}
                  disabled={disabled}
                  aria-label={`Include ${skillLabel(node) ?? "skill group"} in export`}
                  onCheckedChange={(checked) => onToggle(node.id, checked)}
                  className="h-3 w-3 opacity-40 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                  style={{ backgroundSize: "0.55rem 0.55rem" }}
                />
              ))}
            </div>
            <p
              className="font-normal text-[#111827]"
              style={{
                fontSize: `${RESUME_TYPOGRAPHY.skills.px}px`,
                lineHeight: RESUME_TYPOGRAPHY.skills.lineHeight,
              }}
            >
              {block.nodes.map((node, skillIndex) => {
                const label = skillLabel(node);
                return (
                  <span
                    key={node.id}
                    className={cn(!node.selected && "opacity-40")}
                  >
                    {skillIndex > 0 ? <span> • </span> : null}
                    {label ? (
                      <span className="font-bold text-slate-900">
                        {label}:{" "}
                      </span>
                    ) : null}
                    <EditableLine
                      as="span"
                      value={node.content}
                      disabled={disabled}
                      onCommit={(next) => onCommit(node.id, next)}
                      className="font-normal text-slate-700 outline-none focus:bg-[#f8fafc]"
                    />
                  </span>
                );
              })}
            </p>
            <div className="pointer-events-none absolute right-0 top-0 z-10 flex gap-1 bg-white/95 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
              {block.nodes.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  disabled={disabled}
                  aria-label={`Refine ${skillLabel(node) ?? "skill group"}`}
                  onClick={() => {
                    setRefineFor(node.id);
                    setInstruction("");
                  }}
                  className="text-[#6b7280] hover:text-[#111827]"
                >
                  <Sparkles className="h-3 w-3" />
                </button>
              ))}
            </div>
            {block.nodes.map((node) => (
              <div key={`${node.id}-refine`}>{refineForm(node.id)}</div>
            ))}
          </div>
        </div>
      );
    }

    const { node, heading } = block;
    const bullet =
      node.type === "experience_bullet" || node.type === "project_bullet";
    const role =
      node.type === "experience_header" || node.type === "project_header";
    const isEducation = node.type === "education_item";
    const isExperience = node.type === "experience_header";
    const trailing = datesFor(node) ?? projectTrailing(node);
    const content =
      isEducation && trailing && node.content.endsWith(` (${trailing})`)
        ? node.content.slice(0, -` (${trailing})`.length).trim()
        : isExperience && node.content.includes(" · ")
          ? node.content.split(/\s*·\s*/).join(" | ")
          : node.content;
    return (
      <div
        key={blockId}
        data-draft-block-id={blockId}
        className="min-w-0 max-w-full flow-root"
        style={{
          marginTop:
            role && !heading
              ? `${RESUME_SPACING.roleToRole.px}px`
              : isEducation && !heading
                ? `${RESUME_SPACING.degreeToDegree.px}px`
                : undefined,
        }}
      >
        {heading ? (
          <h3
            className={SECTION_HEADING_CLASS}
            style={{
              fontSize: `${RESUME_TYPOGRAPHY.heading.px}px`,
              marginTop: isFirstHeading ? 0 : `${RESUME_SPACING.sectionBefore.px}px`,
              marginBottom: `${RESUME_SPACING.sectionHeadingBottom.px}px`,
            }}
          >
            {heading}
          </h3>
        ) : null}
        <div
          className="group relative"
          style={{
            marginBottom: bullet
              ? `${RESUME_SPACING.bulletSpacing.px}px`
              : role
                ? `${RESUME_SPACING.roleTitleToFirstBullet.px}px`
                : undefined,
          }}
        >
          <Checkbox
            checked={node.selected}
            disabled={disabled}
            aria-label="Include line in export"
            onCheckedChange={(checked) => onToggle(node.id, checked)}
            className={cn(
              "absolute -left-6 h-3.5 w-3.5 opacity-40 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
              node.type === "header" ? "top-2" : "top-[2px]"
            )}
          />
          <div
            className={cn(
              "min-w-0",
              !node.selected && "opacity-40",
              bullet && "flex items-start",
              (role || isEducation) && "flex items-baseline justify-between",
              node.type === "header" && "text-center"
            )}
            style={{
              marginLeft: bullet ? `${RESUME_SPACING.bulletMarginLeft.px}px` : undefined,
              gap: (role || isEducation) ? `${RESUME_SPACING.roleTitleToTrailingGap.px}px` : undefined,
            }}
          >
            {bullet ? (
              <span
                aria-hidden="true"
                style={{
                  width: `${RESUME_SPACING.bulletMarkerWidth.px}px`,
                  flexShrink: 0,
                  fontSize: `${RESUME_TYPOGRAPHY.bullet.px}px`,
                  lineHeight: RESUME_TYPOGRAPHY.bullet.lineHeight,
                  userSelect: "none",
                }}
              >
                •
              </span>
            ) : null}
            <div className={cn("min-w-0", (bullet || role || isEducation) && "flex-1")}>
              <EditableLine
                value={content}
                disabled={disabled}
                renderHtml={
                  isEducation
                    ? renderEducationHtml
                    : isExperience
                      ? renderExperienceHtml
                      : undefined
                }
                onCommit={(next) => onCommit(node.id, next)}
                className={cn(
                  "min-w-0 whitespace-pre-wrap break-normal outline-none focus:bg-[#f8fafc]",
                  role && !isExperience && "font-bold",
                  node.type === "header" &&
                    "font-bold leading-tight text-center",
                  node.type !== "header" &&
                    node.section === "contact" &&
                    "tracking-tight text-[#374151] text-center",
                  node.section === "summary" && "text-[#111827]",
                  bullet && "text-[#111827]"
                )}
                style={{
                  fontSize:
                    role
                      ? `${RESUME_TYPOGRAPHY.roleTitle.px}px`
                      : isEducation
                        ? `${RESUME_TYPOGRAPHY.educationTitle.px}px`
                        : node.type === "header"
                          ? `${RESUME_TYPOGRAPHY.name.px}px`
                          : node.section === "contact"
                            ? `${RESUME_TYPOGRAPHY.contact.px}px`
                            : node.section === "summary"
                              ? `${RESUME_TYPOGRAPHY.summary.px}px`
                              : bullet
                                ? `${RESUME_TYPOGRAPHY.bullet.px}px`
                                : `${RESUME_TYPOGRAPHY.body.px}px`,
                  lineHeight:
                    node.section === "summary" || bullet || isEducation
                      ? RESUME_TYPOGRAPHY.body.lineHeight
                      : undefined,
                }}
              />
            </div>
            {trailing ? (
              <span
                className="shrink-0 text-right text-[#4B5563]"
                style={{ fontSize: `${RESUME_TYPOGRAPHY.muted.px}px` }}
              >
                {trailing}
              </span>
            ) : null}
          </div>
          {node.type === "header" &&
          typeof node.metadata?.contactLine === "string" &&
          node.metadata.contactLine ? (
            <p
              className="text-center leading-tight tracking-tight text-[#374151]"
              style={{
                fontSize: `${RESUME_TYPOGRAPHY.contact.px}px`,
                marginTop: `${RESUME_SPACING.nameToContact.px}px`,
                marginBottom: `${RESUME_SPACING.contactToFirstSection.px}px`,
              }}
            >
              {parseContactHeaderItems(node.metadata.contactLine).map(
                (item, idx) => (
                  <span key={idx} className="inline-block whitespace-nowrap">
                    {idx > 0 && (
                      <span className="mx-1 text-muted-foreground/60 select-none">
                        |
                      </span>
                    )}
                    {item.href ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#1F2937] no-underline hover:text-foreground"
                      >
                        {item.label}
                      </a>
                    ) : (
                      <span>{item.label}</span>
                    )}
                  </span>
                )
              )}
            </p>
          ) : null}
          {refineForm(node.id)}
          {lineTools(node.id)}
        </div>
      </div>
    );
  }

  const pageCountLabel =
    totalPages === 1 ? "1 page" : `${totalPages} pages`;

  return (
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
  );
}
