"use client";

import type { RefObject } from "react";

import type { ResumeDraftNode } from "@/lib/resume-draft";
import {
  RESUME_FONTS,
  RESUME_SPACING,
  RESUME_TYPOGRAPHY,
} from "@/lib/resume-draft/layout.schema";

import {
  getBlockId,
  PAGE_HEIGHT,
  PAGE_PADDING_BOTTOM,
  PAGE_PADDING_TOP,
  PAGE_PADDING_X,
  PRINTABLE_HEIGHT,
  SECTION_HEADING_CLASS,
  SHEET_WIDTH,
  type DraftBlock,
} from "./resume-draft-layout";
import { ResumeDraftNodeBlock } from "./resume-draft-node-block";
import { ResumeSkillsParagraph } from "./resume-skills-paragraph";

export type ResumeDraftCanvasProps = {
  viewportRef: RefObject<HTMLDivElement | null>;
  pagesContainerRef: RefObject<HTMLDivElement | null>;
  zoom: number;
  totalCanvasHeight: number;
  displayPages: DraftBlock[][];
  firstHeadingBlockId: string | null;
  disabled?: boolean;
  isIncluded: (node: ResumeDraftNode) => boolean;
  onCommit: (nodeId: string, content: string) => void;
};

/** Zoomed multi-page resume preview surface. */
export function ResumeDraftCanvas({
  viewportRef,
  pagesContainerRef,
  zoom,
  totalCanvasHeight,
  displayPages,
  firstHeadingBlockId,
  disabled,
  isIncluded,
  onCommit,
}: ResumeDraftCanvasProps) {
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
              marginTop: isFirstHeading
                ? 0
                : `${RESUME_SPACING.sectionBefore.px}px`,
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
        />
      </div>
    );
  }

  return (
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
  );
}
