"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { skillCategoryLabel } from "@/lib/profile/skill-groups";
import type { ResumeDraftNode, TailoredResumeDraft } from "@/lib/resume-draft";
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

export const SHEET_WIDTH = RESUME_PAGE_GEOMETRY.sheetWidthPx;
export const PAGE_HEIGHT = RESUME_PAGE_GEOMETRY.sheetHeightPx;
export const PAGE_PADDING_TOP = RESUME_PAGE_GEOMETRY.paddingTopPx;
export const PAGE_PADDING_BOTTOM = RESUME_PAGE_GEOMETRY.paddingBottomPx;
export const PAGE_PADDING_X = RESUME_PAGE_GEOMETRY.paddingHorizontalPx;
export const PRINTABLE_HEIGHT = RESUME_PAGE_GEOMETRY.safeCeilingPx;
export const PAGE_GAP = 24;

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
  "border-b border-[#D1D5DB] pb-0.5 font-bold uppercase tracking-normal text-[#111827]";

export function getBlockId(block: DraftBlock): string {
  return block.kind === "skills"
    ? `skills-${block.nodes.map((n) => n.id).join("-")}`
    : block.node.id;
}

export function estimateBlockHeight(
  block: DraftBlock,
  refineFor?: string | null
): number {
  const sectionHeadingH = Math.round(
    RESUME_TYPOGRAPHY.heading.px * RESUME_TYPOGRAPHY.heading.lineHeight +
      RESUME_SPACING.sectionBefore.px +
      RESUME_SPACING.sectionHeadingBottom.px
  );

  if (block.kind === "skills") {
    const headingHeight = sectionHeadingH;
    const totalChars = block.nodes.reduce(
      (acc, n) => acc + (skillLabel(n)?.length ?? 0) + n.content.length + 5,
      0
    );
    const lines = Math.max(1, Math.ceil(totalChars / 95));
    const lineHeight = Math.round(
      RESUME_TYPOGRAPHY.skills.px * RESUME_TYPOGRAPHY.skills.lineHeight
    );
    const refineExtra = block.nodes.some((n) => n.id === refineFor) ? 36 : 0;
    return headingHeight + lines * lineHeight + refineExtra;
  }

  const { node, heading } = block;
  const h = heading ? sectionHeadingH : 0;

  if (node.type === "header") {
    const hasContact =
      typeof node.metadata?.contactLine === "string" &&
      Boolean(node.metadata.contactLine);
    const nameH = Math.round(
      RESUME_TYPOGRAPHY.name.px * RESUME_TYPOGRAPHY.name.lineHeight +
        RESUME_SPACING.nameToContact.px
    );
    const contactH = hasContact
      ? Math.round(
          RESUME_TYPOGRAPHY.contact.px * RESUME_TYPOGRAPHY.contact.lineHeight +
            RESUME_SPACING.contactToFirstSection.px
        )
      : 0;
    return h + nameH + contactH;
  }

  const refineExtra = refineFor === node.id ? 36 : 0;

  if (node.type === "experience_header" || node.type === "project_header") {
    const roleH = Math.round(
      RESUME_TYPOGRAPHY.roleTitle.px * RESUME_TYPOGRAPHY.roleTitle.lineHeight +
        RESUME_SPACING.roleTitleToFirstBullet.px +
        (heading ? 0 : RESUME_SPACING.roleToRole.px)
    );
    return h + roleH + refineExtra;
  }

  const bullet =
    node.type === "experience_bullet" || node.type === "project_bullet";
  if (bullet) {
    const lines = Math.max(1, Math.ceil(node.content.length / 90));
    const bulletH =
      lines * 18 +
      Math.round(RESUME_SPACING.bulletSpacing.px) +
      2;
    return h + bulletH + refineExtra;
  }

  if (node.type === "education_item") {
    const eduH = Math.round(
      RESUME_TYPOGRAPHY.educationTitle.px *
        RESUME_TYPOGRAPHY.educationTitle.lineHeight +
        (heading ? 0 : RESUME_SPACING.degreeToDegree.px)
    );
    return h + eduH + refineExtra;
  }

  const lines = Math.max(1, Math.ceil(node.content.length / 90));
  const bodyH =
    lines *
      Math.round(RESUME_TYPOGRAPHY.body.px * RESUME_TYPOGRAPHY.body.lineHeight) +
    4;
  return h + bodyH + refineExtra;
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

export function getEntityTotalHeight(
  startIndex: number,
  blocks: DraftBlock[],
  blockHeights: Record<string, number>,
  refineFor?: string | null
): number {
  const headerBlock = blocks[startIndex];
  if (headerBlock.kind !== "node") return 0;
  const headerId = headerBlock.node.id;
  const headerH = blockHeights[headerId] ?? estimateBlockHeight(headerBlock, refineFor);
  let total = headerH;

  for (let j = startIndex + 1; j < blocks.length; j++) {
    const next = blocks[j];
    if (next.kind !== "node") break;
    const isChild =
      next.node.parentId === headerId ||
      (headerBlock.node.type === "experience_header" &&
        next.node.type === "experience_bullet" &&
        (!next.node.parentId || next.node.parentId === headerId)) ||
      (headerBlock.node.type === "project_header" &&
        next.node.type === "project_bullet" &&
        (!next.node.parentId || next.node.parentId === headerId));
    if (!isChild) break;
    const nextId = next.node.id;
    const nextH = blockHeights[nextId] ?? estimateBlockHeight(next, refineFor);
    total += nextH;
  }
  return total;
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

    // OPTION 1: Role/Project Atomicity (Preemptive look-ahead)
    // If this block is a role or project header, check whether the entire role/project
    // (header + all its bullets) can fit in the remaining space of currentPage.
    // If it cannot fit on currentPage, but CAN fit on a clean single page,
    // move the entire entity to the next page as an atomic unit (matching PDF wrap={false}).
    const isRoleOrProjectHeader =
      block.kind === "node" &&
      (block.node.type === "experience_header" ||
        block.node.type === "project_header");

    if (isRoleOrProjectHeader && currentPage.length > 0) {
      const entityTotalHeight = getEntityTotalHeight(
        i,
        blocks,
        blockHeights,
        refineFor
      );
      if (
        entityTotalHeight <= PRINTABLE_HEIGHT &&
        currentHeight + entityTotalHeight > PRINTABLE_HEIGHT
      ) {
        result.push(currentPage);
        currentPage = [block];
        currentHeight = h;
        continue;
      }
    }

    // If adding this block overflows printable height (and currentPage isn't empty)
    if (currentHeight + h > PRINTABLE_HEIGHT && currentPage.length > 0) {
      // Role/Project Atomicity fallback:
      // If this block is a bullet belonging to a role/project header currently on currentPage,
      // and there is prior content on currentPage before that header, pull the entire role
      // (header + all preceding bullets of this role) forward onto the new page.
      let roleHeaderIdx = -1;
      if (block.kind === "node") {
        const parentId = block.node.parentId;
        if (parentId) {
          roleHeaderIdx = currentPage.findIndex(
            (b) => b.kind === "node" && b.node.id === parentId
          );
        } else if (
          block.node.type === "experience_bullet" ||
          block.node.type === "project_bullet"
        ) {
          const expectedHeaderType =
            block.node.type === "experience_bullet"
              ? "experience_header"
              : "project_header";
          for (let k = currentPage.length - 1; k >= 0; k--) {
            const candidate = currentPage[k];
            if (
              candidate.kind === "node" &&
              candidate.node.type === expectedHeaderType
            ) {
              roleHeaderIdx = k;
              break;
            }
          }
        }
      }

      if (roleHeaderIdx > 0) {
        // Move header and already placed bullets of this role to the new page
        const precedingBlocks = currentPage.slice(0, roleHeaderIdx);
        const roleBlocks = currentPage.slice(roleHeaderIdx);
        result.push(precedingBlocks);

        currentPage = [...roleBlocks, block];
        currentHeight = currentPage.reduce((sum, b) => {
          const id = getBlockId(b);
          return sum + (blockHeights[id] ?? estimateBlockHeight(b, refineFor));
        }, 0);
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderEducationHtml(val: string): string {
  const parts = val.split(" — ");
  if (parts.length > 1) {
    const degree = parts[0];
    const school = parts.slice(1).join(" — ");
    return `<strong class="font-bold text-[#111827]">${escapeHtml(degree)}</strong> — <span style="color: #4B5563; font-weight: normal;">${escapeHtml(school)}</span>`;
  }
  return `<strong class="font-bold text-[#111827]">${escapeHtml(val)}</strong>`;
}

function renderExperienceHtml(val: string): string {
  const parts = val.split(/\s*[|·]\s*/);
  if (parts.length > 1) {
    const role = parts[0];
    const rest = parts.slice(1);
    const restHtml = rest
      .map(
        (part) =>
          `<span style="color: #9CA3AF; font-weight: normal;"> | </span><span style="color: #4B5563; font-weight: normal;">${escapeHtml(part)}</span>`
      )
      .join("");
    return `<strong class="font-bold text-[#111827]">${escapeHtml(role)}</strong>${restHtml}`;
  }
  return `<strong class="font-bold text-[#111827]">${escapeHtml(val)}</strong>`;
}

function EditableLine({
  value,
  disabled,
  className,
  style,
  onCommit,
  as = "div",
  renderHtml,
}: {
  value: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onCommit: (next: string) => void;
  as?: "div" | "span";
  renderHtml?: (val: string) => string;
}) {
  const ref = useRef<HTMLElement>(null);
  const assign = (el: HTMLElement | null) => {
    ref.current = el;
    if (!el || document.activeElement === el) return;
    if (renderHtml) {
      el.innerHTML = renderHtml(value);
    } else {
      if (el.textContent !== value) el.textContent = value;
    }
  };
  useEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    if (renderHtml) {
      el.innerHTML = renderHtml(value);
    } else {
      if (el.textContent !== value) el.textContent = value;
    }
  }, [value, renderHtml]);

  const Tag = as;
  return (
    <Tag
      ref={assign}
      role="textbox"
      aria-multiline="true"
      contentEditable={!disabled}
      suppressContentEditableWarning
      className={className}
      style={style}
      onFocus={(event) => {
        if (renderHtml) {
          event.currentTarget.textContent = value;
        }
      }}
      onBlur={(event) => {
        const next = event.currentTarget.textContent ?? "";
        if (next !== value) onCommit(next);
        if (renderHtml) {
          event.currentTarget.innerHTML = renderHtml(next);
        }
      }}
    />
  );
}

function datesFor(node: ResumeDraftNode): string | null {
  if (node.type === "experience_header") {
    const start =
      typeof node.metadata?.startDate === "string" ? node.metadata.startDate : "";
    const end =
      typeof node.metadata?.endDate === "string" && node.metadata.endDate
        ? node.metadata.endDate
        : "Present";
    if (!start) return null;
    return `${start} – ${end}`;
  }
  if (node.type === "education_item") {
    const start =
      typeof node.metadata?.startDate === "string"
        ? node.metadata.startDate
        : "";
    const end =
      typeof node.metadata?.graduationDate === "string"
        ? node.metadata.graduationDate
        : "";
    const status =
      typeof node.metadata?.status === "string"
        ? (node.metadata.status as "GRADUATED" | "IN_PROGRESS")
        : "GRADUATED";
    return formatEducationDates({ startDate: start, graduationDate: end, status });
  }
  return null;
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
  const firstHeadingBlockId = useMemo(() => {
    for (const b of blocks) {
      if (b.kind === "skills") return getBlockId(b);
      if (b.kind === "node" && b.heading) return getBlockId(b);
    }
    return null;
  }, [blocks]);

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
                  className="h-2 w-2 opacity-40 transition-opacity group-hover:opacity-100"
                  style={{ backgroundSize: "0.4rem 0.4rem" }}
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
              "absolute -left-6 h-3.5 w-3.5 opacity-40 transition-opacity group-hover:opacity-100",
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
                        className="text-[#1F2937] dark:text-zinc-200 no-underline hover:text-foreground"
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

  return (
    <div className="flex h-full min-h-0 w-full max-w-full flex-col overflow-x-hidden">
      <div className="flex w-full max-w-full shrink-0 items-center justify-end gap-2 border-b border-border/60 bg-card px-3 py-2 text-xs">
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

      {/* Tiny progressive fade under the buttons in the space before resume begins */}
      <div
        className="pointer-events-none h-2.5 w-full shrink-0 -mb-2.5 z-10 bg-gradient-to-b from-card to-transparent"
        aria-hidden="true"
      />

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
                className="relative overflow-hidden bg-white text-[#111827] shadow-lg rounded-sm"
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
                <div
                  className="absolute text-[10px] text-muted-foreground/60 select-none"
                  style={{
                    bottom: "12px",
                    right: `${PAGE_PADDING_X}px`,
                  }}
                >
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
