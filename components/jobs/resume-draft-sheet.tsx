"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { skillCategoryLabel } from "@/lib/skill-groups";
import type { ResumeDraftNode, TailoredResumeDraft } from "@/lib/types/resume-draft";
import { cn } from "@/lib/utils";

const SHEET_WIDTH = 816;

const SECTION_LABEL: Record<ResumeDraftNode["section"], string | null> = {
  contact: null,
  summary: "Summary",
  skills: "Skills",
  experience: "Experience",
  projects: "Projects",
  education: "Education",
};

const SECTION_HEADING_CLASS =
  "mb-1.5 mt-2.5 border-b border-[#D1D5DB] pb-0.5 text-[14.67px] font-bold uppercase tracking-normal text-[#111827]";

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
  const [paperHeight, setPaperHeight] = useState(1056);
  const viewportRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const paper = paperRef.current;
    if (!paper) return;
    const measure = () => setPaperHeight(paper.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(paper);
    return () => observer.disconnect();
  }, [draft]);

  const zoom = zoomChoice === "fit" ? fitScale : zoomChoice;

  const blocks: Array<
    | { kind: "node"; node: ResumeDraftNode; heading: string | null }
    | { kind: "skills"; nodes: ResumeDraftNode[] }
  > = [];
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
        className="flex h-full min-h-0 w-full max-w-full flex-1 overflow-auto bg-slate-100/70 p-4"
      >
        <div
          className="mx-auto shrink-0"
          style={{ width: SHEET_WIDTH * zoom, height: paperHeight * zoom }}
        >
          <div
            className="origin-top-left transition-transform duration-150 ease-out"
            style={{ width: SHEET_WIDTH, transform: `scale(${zoom})` }}
          >
            <div
              ref={paperRef}
              className="w-[816px] min-h-[1056px] bg-white px-[40px] py-[32px] font-['Helvetica',Arial,sans-serif] text-[13.33px] leading-[1.4] text-[#111827] shadow-md"
              style={{ fontFamily: "Helvetica, Arial, sans-serif" }}
            >
          {blocks.map((block) => {
            if (block.kind === "skills") {
              return (
                <div key={block.nodes.map((node) => node.id).join(":")}>
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
              <div key={node.id} className="min-w-0 max-w-full">
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
                      {node.metadata.contactLine}
                    </p>
                  ) : null}
                  {refineForm(node.id)}
                  {lineTools(node.id)}
                </div>
              </div>
            );
          })}
            </div>
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
