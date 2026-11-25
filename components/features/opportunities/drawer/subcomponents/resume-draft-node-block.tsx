"use client";

import type { ReactNode } from "react";

import type { ResumeDraftNode } from "@/lib/resume-draft";
import {
  RESUME_SPACING,
  RESUME_TYPOGRAPHY,
} from "@/lib/resume-draft/layout.schema";
import { parseContactHeaderItems } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

import { SECTION_HEADING_CLASS } from "./resume-draft-layout";
import { useResumeLineTarget } from "./resume-line-chrome";
import {
  EditableLine,
  datesFor,
  projectTrailing,
  renderEducationHtml,
  renderExperienceHtml,
} from "./resume-node-editor";

/**
 * One non-skills draft line with shared floating toolbar chrome.
 * Markup matches export — only hover highlight is editor-only.
 */
export function ResumeDraftNodeBlock({
  node,
  heading,
  isFirstHeading,
  disabled,
  included,
  refineSlot,
  onCommit,
}: {
  node: ResumeDraftNode;
  heading: string | null;
  isFirstHeading: boolean;
  disabled?: boolean;
  included: boolean;
  refineSlot?: ReactNode;
  onCommit: (nodeId: string, content: string) => void;
}) {
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

  const { targetProps, editProps, highlighted } = useResumeLineTarget(node.id, {
    label: "line",
    included,
  });

  return (
    <div
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
        className="relative"
        style={{
          marginBottom: bullet
            ? `${RESUME_SPACING.bulletSpacing.px}px`
            : role
              ? `${RESUME_SPACING.roleTitleToFirstBullet.px}px`
              : undefined,
        }}
      >
        <div
          className={cn(
            "min-w-0",
            !included && "opacity-40 line-through decoration-[#9ca3af]",
            bullet && "flex items-start",
            (role || isEducation) && "flex items-baseline justify-between",
            node.type === "header" && "text-center"
          )}
          style={{
            marginLeft: bullet
              ? `${RESUME_SPACING.bulletMarginLeft.px}px`
              : undefined,
            gap:
              role || isEducation
                ? `${RESUME_SPACING.roleTitleToTrailingGap.px}px`
                : undefined,
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
          <div
            className={cn(
              "min-w-0",
              (bullet || role || isEducation) && "flex-1"
            )}
          >
            {/*
              Inline chrome target = glyph boxes only (skills pattern). A block
              host here would re-capture same-row flex whitespace as "editable".
            */}
            <span {...targetProps} className="inline max-w-full">
              <EditableLine
                as="span"
                value={content}
                disabled={disabled}
                commitOnEnter
                renderHtml={
                  isEducation
                    ? renderEducationHtml
                    : isExperience
                      ? renderExperienceHtml
                      : undefined
                }
                onEditStart={editProps.onEditStart}
                onEditEnd={editProps.onEditEnd}
                onCommit={(next) => onCommit(node.id, next)}
                className={cn(
                  // Inline + box-decoration-clone: wash follows glyph runs, not the
                  // full flex line box (multiline bullets used to paint trailing empty).
                  "inline max-w-full whitespace-pre-wrap break-normal rounded-sm box-decoration-clone outline-none transition-colors focus:bg-[#f8fafc] empty:inline-block empty:min-w-[1ch]",
                  highlighted && "bg-[#111827]/[0.05]",
                  role && !isExperience && "font-bold",
                  node.type === "header" && "font-bold leading-tight text-center",
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
            </span>
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
        {refineSlot}
      </div>
    </div>
  );
}
