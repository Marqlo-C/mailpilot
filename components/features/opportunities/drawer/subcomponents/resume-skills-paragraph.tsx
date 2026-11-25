"use client";

import type { ReactNode } from "react";

import type { ResumeDraftNode } from "@/lib/resume-draft";
import {
  RESUME_EDIT_TEXT_HIT_PAD_PX,
  pointNearEditableLineText,
} from "@/lib/resume-draft/edit-presentation";
import { RESUME_TYPOGRAPHY } from "@/lib/resume-draft/layout.schema";
import { cn } from "@/lib/utils";

import { useResumeLineTarget } from "./resume-line-chrome";
import { EditableLine, skillLabel } from "./resume-node-editor";

/**
 * Skills stay one export-identical paragraph. Per-group chrome comes from
 * {@link ResumeLineChromeProvider} — same floating toolbar as every other line.
 */
export function ResumeSkillsParagraph({
  nodes,
  disabled,
  isIncluded,
  onCommit,
  refineSlot,
}: {
  nodes: ResumeDraftNode[];
  disabled?: boolean;
  isIncluded: (node: ResumeDraftNode) => boolean;
  onCommit: (nodeId: string, content: string) => void;
  refineSlot?: ReactNode;
}) {
  return (
    <div className="relative">
      <p
        className="font-normal text-[#111827]"
        style={{
          fontSize: `${RESUME_TYPOGRAPHY.skills.px}px`,
          lineHeight: RESUME_TYPOGRAPHY.skills.lineHeight,
        }}
      >
        {nodes.map((node, skillIndex) => (
          <SkillGroupSpan
            key={node.id}
            node={node}
            skillIndex={skillIndex}
            disabled={disabled}
            included={isIncluded(node)}
            onCommit={onCommit}
          />
        ))}
      </p>
      {refineSlot}
    </div>
  );
}

function SkillGroupSpan({
  node,
  skillIndex,
  disabled,
  included,
  onCommit,
}: {
  node: ResumeDraftNode;
  skillIndex: number;
  disabled?: boolean;
  included: boolean;
  onCommit: (nodeId: string, content: string) => void;
}) {
  const label = skillLabel(node);
  const { targetProps, editProps, highlighted } = useResumeLineTarget(node.id, {
    label: label ?? "skill group",
    included,
  });

  const { ref: lineRef, ...lineTargetProps } = targetProps;

  return (
    <span>
      {skillIndex > 0 ? <span> • </span> : null}
      <span
        className={cn(
          !included && "opacity-40 line-through decoration-[#9ca3af]"
        )}
      >
        {label ? (
          <span className="font-bold text-slate-900">{label}: </span>
        ) : null}
        {/*
          Chrome target is the editable only — not the bold label — so the
          float centers above skill text (first line if the group wraps).
        */}
        <span
          ref={lineRef}
          {...lineTargetProps}
          className="inline"
          style={{
            padding: RESUME_EDIT_TEXT_HIT_PAD_PX,
            margin: -RESUME_EDIT_TEXT_HIT_PAD_PX,
          }}
          onPointerDown={(event) => {
            if (disabled || event.button !== 0) return;
            const host = event.currentTarget;
            const ce = host.querySelector("[contenteditable='true']");
            if (!(ce instanceof HTMLElement)) return;
            if (event.target === ce || ce.contains(event.target as Node)) {
              return;
            }
            if (
              !pointNearEditableLineText(host, {
                x: event.clientX,
                y: event.clientY,
              })
            ) {
              return;
            }
            event.preventDefault();
            ce.focus();
          }}
        >
          <EditableLine
            as="span"
            value={node.content}
            disabled={disabled}
            commitOnEnter
            onEditStart={editProps.onEditStart}
            onEditEnd={editProps.onEditEnd}
            onCommit={(next) => onCommit(node.id, next)}
            className={cn(
              "inline rounded-sm box-decoration-clone font-normal text-slate-700 outline-none transition-colors focus:bg-[#f8fafc]",
              highlighted && "bg-[#111827]/[0.05]"
            )}
          />
        </span>
      </span>
    </span>
  );
}
