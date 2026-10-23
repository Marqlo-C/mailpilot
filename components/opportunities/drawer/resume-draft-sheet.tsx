"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { skillCategoryLabel } from "@/lib/profile/skill-groups";
import type { ResumeDraftNode, TailoredResumeDraft } from "@/lib/types/resume-draft";
import { cn } from "@/lib/utils";
import { sanitizeResumeContactLine } from "@/lib/utils/format";

export const SHEET_WIDTH = 816;
export const PAGE_HEIGHT = 1056;
export const PAGE_PADDING_Y = 64; // py-[32px] => 32px top + 32px bottom
export const PRINTABLE_HEIGHT = PAGE_HEIGHT - PAGE_PADDING_Y; // 992px
export const PAGE_GAP = 24; // gap-6 = 24px

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export type DraftBlock =
  | { kind: "node"; node: ResumeDraftNode; heading: string | null }
  | { kind: "skills"; nodes: ResumeDraftNode[] };

const SECTION_LABEL: Record<ResumeDraftNode["section"], string | null> = {
  contact: null,
  summary: "Summary",
  skills: "Skills",
  experience: "Experience",
  projects: "Projects",
  education: "Education",
  certifications: "Certifications & Licenses",
  awards: "Honors & Awards",
  interests: "Interests",
};

const SECTION_HEADING_CLASS =
  "mb-1.5 mt-2.5 border-b border-[#D1D5DB] pb-0.5 text-[14.67px] font-bold uppercase tracking-normal text-[#111827]";

export function getBlockId(block: DraftBlock): string {
  return block.kind === "skills"
    ? `skills-${block.nodes.map((n) => n.id).join("-")}`
    : block.node.id;
}

export function estimateBlockHeight(
  block: DraftBlock,
  refineFor?: string | null
): number {
  if (block.kind === "skills") {
    const headingHeight = 32;
    const totalChars = block.nodes.reduce(
      (acc, n) => acc + (skillLabel(n)?.length ?? 0) + n.content.length + 5,
      0
    );
    const lines = Math.max(1, Math.ceil(totalChars / 95));
    const refineExtra = block.nodes.some((n) => n.id === refineFor) ? 36 : 0;
    return headingHeight + lines * 18 + refineExtra;
  }

  const { node, heading } = block;
  let h = heading ? 32 : 0;

  if (node.type === "header") {
    const hasContact =
      typeof node.metadata?.contactLine === "string" &&
      Boolean(node.metadata.contactLine);
    return h + 36 + (hasContact ? 26 : 0);
  }

  const refineExtra = refineFor === node.id ? 36 : 0;

  if (node.type === "experience_header" || node.type === "project_header") {
    return h + 24 + refineExtra;
  }

  const bullet =
    node.type === "experience_bullet" || node.type === "project_bullet";
  if (bullet) {
    const lines = Math.max(1, Math.ceil(node.content.length / 90));
    return h + lines * 19 + 2 + refineExtra;
  }

  const lines = Math.max(1, Math.ceil(node.content.length / 90));
  return h + lines * 19 + 4 + refineExtra;
}

export function buildBlocks(draft: TailoredResumeDraft): DraftBlock[] {
  const blocks: DraftBlock[] = [];
  let lastSection: ResumeDraftNode["section"] | null = null;
  for (let index = 0; index < draft.nodes.length; index += 1) {
    const node = draft.nodes[index];
    if (node.type === "skill_group") {
      const nodes = [node];
      while (draft.nodes[index + 1]?.type === "skill_group") {
        index += 1;
        nodes.push(draft.nodes[index]);
      }
      blocks.push({ kind: "skills", nodes });
      lastSection = "skills";
      continue;
    }
    const heading =
      node.section !== lastSection ? SECTION_LABEL[node.section] : null;
    lastSection = node.section;
    blocks.push({ kind: "node", node, heading });
  }
  return blocks;
}

export function partitionBlocksIntoPages(
  blocks: DraftBlock[],
  blockHeights: Record<string, number>,
  refineFor?: string | null
): DraftBlock[][] {
  if (blocks.length === 0) return [];

  const result: DraftBlock[][] = [];
  let currentPage: DraftBlock[] = [];
  let currentHeight = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const blockId = getBlockId(block);
    const h = blockHeights[blockId] ?? estimateBlockHeight(block, refineFor);

    // If adding this block overflows printable height (and currentPage isn't empty)
    if (currentHeight + h > PRINTABLE_HEIGHT && currentPage.length > 0) {
      // Orphan header protection:
      // If the last block placed on currentPage was a role header (experience_header or project_header),
      // and this block is its bullet, avoid leaving an orphan header at the bottom of the page.
      const lastBlock = currentPage[currentPage.length - 1];
      const isLastBlockRoleHeader =
        lastBlock?.kind === "node" &&
        (lastBlock.node.type === "experience_header" ||
          lastBlock.node.type === "project_header");

      const isBulletOfRoleHeader =
        lastBlock?.kind === "node" &&
        block.kind === "node" &&
        ((lastBlock.node.type === "experience_header" &&
          block.node.type === "experience_bullet") ||
          (lastBlock.node.type === "project_header" &&
            block.node.type === "project_bullet"));

      if (isLastBlockRoleHeader && isBulletOfRoleHeader && currentPage.length > 1) {
        // Pop the role header so it travels with this bullet onto the new page
        currentPage.pop();
        result.push(currentPage);

        const lastBlockId = getBlockId(lastBlock);
        const lastBlockH =
          blockHeights[lastBlockId] ??
          estimateBlockHeight(lastBlock, refineFor);
        currentPage = [lastBlock, block];
        currentHeight = lastBlockH + h;
      } else {
        result.push(currentPage);
        currentPage = [block];
        currentHeight = h;
      }
    } else {
      currentPage.push(block);
      currentHeight += h;
    }
  }

  if (currentPage.length > 0) {
    result.push(currentPage);
  }

  return result;
}

function EditableLine({
  value,
  disabled,
  className,
  onCommit,
  as = "div",
}: {
  value: string;
  disabled?: boolean;
  className?: string;
  onCommit: (next: string) => void;
  as?: "div" | "span";
}) {
  const ref = useRef<HTMLElement>(null);
  const assign = (el: HTMLElement | null) => {
    ref.current = el;
    if (!el || document.activeElement === el) return;
    if (el.textContent !== value) el.textContent = value;
  };
  useEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    if (el.textContent !== value) el.textContent = value;
  }, [value]);

  const Tag = as;
  return (
    <Tag
      ref={assign}
      role="textbox"
      aria-multiline="true"
      contentEditable={!disabled}
      suppressContentEditableWarning
      className={className}
      onBlur={(event) => {
        const next = event.currentTarget.textContent ?? "";
        if (next !== value) onCommit(next);
      }}
    />
  );
}

function datesFor(node: ResumeDraftNode): string | null {
  if (node.type !== "experience_header") return null;
  const start =
    typeof node.metadata?.startDate === "string" ? node.metadata.startDate : "";
  const end =
    typeof node.metadata?.endDate === "string" && node.metadata.endDate
      ? node.metadata.endDate
      : "Present";
  if (!start) return null;
  return `${start} – ${end}`;
}

function skillLabel(node: ResumeDraftNode): string | null {
  return skillCategoryLabel(node);
}

function projectTrailing(node: ResumeDraftNode): string | null {
  if (node.type !== "project_header") return null;
  if (!Array.isArray(node.metadata?.technologies)) return null;
  const technologies = node.metadata.technologies.filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  );
  return technologies.slice(0, 4).join(", ") || null;
}

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
}: {
  draft: TailoredResumeDraft;
  disabled?: boolean;
  exporting?: boolean;
  onCommit: (nodeId: string, content: string) => void;
  onToggle: (nodeId: string, selected: boolean) => void;
  onMove: (nodeId: string, direction: "up" | "down") => void;
  onRefine: (nodeId: string, instruction: string) => void;
  onExport: (format: "pdf" | "docx") => void;
  strategyRationale?: {
    roleFitAnalysis: string;
    selectedSkillsReasoning: string;
    featuredExperiencesReasoning: string;
    featuredProjectsReasoning: string;
  } | null;
}) {
  const [refineFor, setRefineFor] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [showRationale, setShowRationale] = useState(false);
  const [zoomChoice, setZoomChoice] = useState<"fit" | 0.85 | 1 | 1.25>("fit");
  const [fitScale, setFitScale] = useState(0.7);
  const [blockHeights, setBlockHeights] = useState<Record<string, number>>({});

  const viewportRef = useRef<HTMLDivElement>(null);
  const pagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => {
      const available = viewport.clientWidth - 32;
      if (available <= 0) return;
      setFitScale(Math.min(1, available / SHEET_WIDTH));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const zoom = zoomChoice === "fit" ? fitScale : zoomChoice;

  const blocks = useMemo(() => buildBlocks(draft), [draft]);

  useIsomorphicLayoutEffect(() => {
    const container = pagesContainerRef.current;
    if (!container) return;

    const elements = container.querySelectorAll<HTMLElement>(
      "[data-draft-block-id]"
    );
    let hasChanged = false;
    const nextHeights: Record<string, number> = { ...blockHeights };

    elements.forEach((el) => {
      const id = el.getAttribute("data-draft-block-id");
      if (!id) return;
      // offsetHeight provides unscaled CSS pixels independent of zoom transforms
      const measured = el.offsetHeight;
      const previous = blockHeights[id];
      if (previous === undefined || Math.abs(previous - measured) > 1) {
        nextHeights[id] = measured;
        hasChanged = true;
      }
    });

    if (hasChanged) {
      setBlockHeights(nextHeights);
    }
  }, [blocks, refineFor]);

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
      <div className="pointer-events-none absolute right-0 top-0 z-10 flex bg-white/95 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
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
      >
        <input
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="Rewrite this line…"
          disabled={disabled}
          className="min-w-0 flex-1 rounded border border-[#D1D5DB] px-1.5 py-0.5 text-[9pt] outline-none"
        />
        <button
          type="submit"
          disabled={disabled || !instruction.trim()}
          className="rounded bg-[#111827] px-1.5 py-0.5 text-[9pt] text-white disabled:opacity-40"
        >
          Apply
        </button>
      </form>
    );
  }

  function renderBlock(block: DraftBlock) {
    const blockId = getBlockId(block);

    if (block.kind === "skills") {
      return (
        <div
          key={blockId}
          data-draft-block-id={blockId}
          className="min-w-0 max-w-full flow-root"
        >
          <h3 className={SECTION_HEADING_CLASS}>Skills</h3>
          <div className="group relative">
            <div className="absolute -left-6 top-[2px] flex flex-col gap-px">
              {block.nodes.map((node) => (
                <Checkbox
                  key={node.id}
                  checked={node.selected}
                  disabled={disabled}
                  aria-label={`Include ${skillLabel(node) ?? "skill group"} in export`}
                  onCheckedChange={(checked) => onToggle(node.id, checked)}
                  className="h-2 w-2 opacity-40 transition-opacity group-hover:opacity-100"
                  style={{ backgroundSize: "0.4rem 0.4rem" }}
                />
              ))}
            </div>
            <p className="font-normal text-[12px] leading-[1.4] text-[#111827]">
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
            <div className="pointer-events-none absolute right-0 top-0 z-10 flex gap-1 bg-white/95 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
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
    const trailing = datesFor(node) ?? projectTrailing(node);
    return (
      <div
        key={blockId}
        data-draft-block-id={blockId}
        className="min-w-0 max-w-full flow-root"
      >
        {heading ? <h3 className={SECTION_HEADING_CLASS}>{heading}</h3> : null}
        <div className={cn("group relative", bullet && "mb-0.5")}>
          <Checkbox
            checked={node.selected}
            disabled={disabled}
            aria-label="Include line in export"
            onCheckedChange={(checked) => onToggle(node.id, checked)}
            className={cn(
              "absolute -left-6 h-3.5 w-3.5 opacity-40 transition-opacity group-hover:opacity-100",
              node.type === "header" ? "top-2" : "top-[2px]"
            )}
          />
          <div
            className={cn(
              "min-w-0",
              !node.selected && "opacity-40",
              bullet &&
                "relative pl-3 before:absolute before:left-0 before:content-['•']",
              role && "flex items-baseline justify-between gap-3"
            )}
          >
            <EditableLine
              value={node.content}
              disabled={disabled}
              onCommit={(next) => onCommit(node.id, next)}
              className={cn(
                "min-w-0 whitespace-pre-wrap break-normal outline-none focus:bg-[#f8fafc]",
                role && "flex-1 font-bold",
                node.type === "header" &&
                  "text-[24px] font-bold leading-tight",
                node.type !== "header" &&
                  node.section === "contact" &&
                  "text-[12px] text-[#374151]"
              )}
            />
            {trailing ? (
              <span className="shrink-0 text-right text-[12px] text-[#4B5563]">
                {trailing}
              </span>
            ) : null}
          </div>
          {node.type === "header" &&
          typeof node.metadata?.contactLine === "string" &&
          node.metadata.contactLine ? (
            <p className="mb-2.5 text-[12px] text-[#374151]">
              {sanitizeResumeContactLine(node.metadata.contactLine)}
            </p>
          ) : null}
          {refineForm(node.id)}
          {lineTools(node.id)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full max-w-full flex-col overflow-x-hidden">
      <div className="flex w-full max-w-full shrink-0 items-center justify-end gap-2 border-b border-border/60 px-3 py-2">
        <div className="mr-auto inline-flex rounded-md border border-border bg-card p-0.5">
          {(
            [
              ["fit", "Fit"],
              [0.85, "85%"],
              [1, "100%"],
              [1.25, "125%"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={label}
              type="button"
              aria-pressed={zoomChoice === value}
              onClick={() => setZoomChoice(value)}
              className={cn(
                "rounded px-2 py-0.5 text-xs font-medium",
                zoomChoice === value
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={disabled || exporting}
          onClick={() => onExport("pdf")}
          className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
        >
          {exporting ? "Exporting…" : "Export PDF"}
        </button>
        <button
          type="button"
          disabled={disabled || exporting}
          onClick={() => onExport("docx")}
          className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
        >
          Export DOCX
        </button>
      </div>
      <div
        ref={viewportRef}
        className="flex h-full min-h-0 w-full max-w-full flex-1 overflow-auto bg-slate-100/70 dark:bg-zinc-900/60 p-4"
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
            className="flex flex-col gap-6 origin-top-left transition-transform duration-150 ease-out"
            style={{
              width: SHEET_WIDTH,
              transform: `scale(${zoom})`,
            }}
          >
            {displayPages.map((pageBlocks, pageIndex) => (
              <div
                key={pageIndex}
                className="relative w-[816px] h-[1056px] max-h-[1056px] overflow-hidden bg-white px-[40px] py-[32px] font-['Helvetica',Arial,sans-serif] text-[13.33px] leading-[1.4] text-[#111827] shadow-lg rounded-sm"
                style={{ fontFamily: "Helvetica, Arial, sans-serif" }}
              >
                {pageBlocks.map((block) => renderBlock(block))}
                <div className="absolute bottom-2 right-4 text-[10px] text-muted-foreground/60 select-none">
                  Page {pageIndex + 1} of {totalPages}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {strategyRationale ? (
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
                  <span className="font-medium text-foreground/80">
                    Experience.{" "}
                  </span>
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
      ) : null}
    </div>
  );
}
