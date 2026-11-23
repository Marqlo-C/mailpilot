"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ResumeDraftNode } from "@/lib/resume-draft";
import { skillCategoryLabel } from "@/lib/profile/skill-groups";
import { formatEducationDates } from "@/lib/utils/format";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderEducationHtml(val: string): string {
  const parts = val.split(" — ");
  if (parts.length > 1) {
    const degree = parts[0];
    const school = parts.slice(1).join(" — ");
    return `<strong class="font-bold text-[#111827]">${escapeHtml(degree)}</strong> — <span style="color: #4B5563; font-weight: normal;">${escapeHtml(school)}</span>`;
  }
  return `<strong class="font-bold text-[#111827]">${escapeHtml(val)}</strong>`;
}

export function renderExperienceHtml(val: string): string {
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

export function EditableLine({
  value,
  disabled,
  className,
  style,
  onCommit,
  as = "div",
  renderHtml,
  commitOnEnter = false,
  onEditStart,
  onEditEnd,
}: {
  value: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onCommit: (next: string) => void;
  as?: "div" | "span";
  renderHtml?: (val: string) => string;
  /** Blur (and commit) on Enter instead of inserting a newline. */
  commitOnEnter?: boolean;
  onEditStart?: () => void;
  onEditEnd?: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const valueRef = useRef(value);
  const renderHtmlRef = useRef(renderHtml);
  /** Holds post-blur text until the saved `value` prop catches up — prevents a pre-edit flash. */
  const pendingCommitRef = useRef<string | null>(null);
  valueRef.current = value;
  renderHtmlRef.current = renderHtml;

  function writeDom(el: HTMLElement, text: string) {
    const html = renderHtmlRef.current;
    if (html) el.innerHTML = html(text);
    else if (el.textContent !== text) el.textContent = text;
  }

  // Stable ref callback so parent re-renders (toolbar chrome) don't remount and
  // rewrite the DOM from a still-stale `value` prop mid-save.
  const assign = useCallback((el: HTMLElement | null) => {
    ref.current = el;
    if (!el || document.activeElement === el) return;
    writeDom(el, pendingCommitRef.current ?? valueRef.current);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    if (pendingCommitRef.current !== null) {
      if (value !== pendingCommitRef.current) return;
      pendingCommitRef.current = null;
    }
    writeDom(el, value);
  }, [value, renderHtml]);

  const Tag = as;
  return (
    <Tag
      ref={assign}
      role="textbox"
      aria-multiline={commitOnEnter ? "false" : "true"}
      contentEditable={!disabled}
      suppressContentEditableWarning
      className={className}
      style={style}
      onFocus={(event) => {
        if (renderHtml) {
          event.currentTarget.textContent =
            pendingCommitRef.current ?? valueRef.current;
        }
        onEditStart?.();
      }}
      onBlur={(event) => {
        const next = event.currentTarget.textContent ?? "";
        if (next !== valueRef.current) {
          pendingCommitRef.current = next;
          onCommit(next);
        } else {
          pendingCommitRef.current = null;
        }
        writeDom(event.currentTarget, next);
        onEditEnd?.();
      }}
      onKeyDown={(event) => {
        if (!commitOnEnter || event.key !== "Enter") return;
        event.preventDefault();
        event.currentTarget.blur();
      }}
    />
  );
}

export function datesFor(node: ResumeDraftNode): string | null {
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

export function skillLabel(node: ResumeDraftNode): string | null {
  return skillCategoryLabel(node);
}

export function projectTrailing(node: ResumeDraftNode): string | null {
  if (node.type !== "project_header") return null;
  if (!Array.isArray(node.metadata?.technologies)) return null;
  const technologies = node.metadata.technologies.filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  );
  return technologies.slice(0, 4).join(", ") || null;
}
