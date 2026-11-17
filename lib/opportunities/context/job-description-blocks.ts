/**
 * Deterministic job-description markdown block parser for the card modal.
 * Supports # headings, **HEADING** / ALL-CAPS / Title Case labels, lists, and duty lines.
 */

import {
  isSectionHeadingOnly,
  kindForHeading,
  peelLeadingSectionLabel,
} from "./job-section-labels";

export type JobDescriptionBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

const HASH_HEADING_RE = /^(#{1,3})\s+(.+)$/;
const BOLD_HEADING_RE = /^\*\*(.+)\*\*$/;
const LIST_ITEM_RE = /^[-*•]\s+(.+)$/;

function stripBoldWrappers(text: string): string {
  return text.replace(/^\*\*(.+)\*\*$/, "$1").trim();
}

function isAllCapsSectionLabel(line: string): boolean {
  const label = stripBoldWrappers(line);
  if (label.length < 8 || /[.!?]$/.test(label)) return false;
  if (label.split(/\s+/).length > 8) return false;
  const letters = label.replace(/[^A-Za-z]/g, "");
  return letters.length >= 8 && letters === letters.toUpperCase();
}

function isSectionHeadingLine(line: string): { heading: string; level: 1 | 2 | 3 } | null {
  const hash = line.match(HASH_HEADING_RE);
  if (hash) {
    return {
      level: Math.min(hash[1].length, 3) as 1 | 2 | 3,
      heading: hash[2].trim(),
    };
  }

  const bold = line.match(BOLD_HEADING_RE);
  if (bold) {
    return { level: 3, heading: bold[1].trim() };
  }

  if (isSectionHeadingOnly(line) || isAllCapsSectionLabel(line)) {
    const peeled = peelLeadingSectionLabel(line);
    return { level: 3, heading: peeled?.label || stripBoldWrappers(line) };
  }

  return null;
}

function isImplicitDutyLine(line: string): boolean {
  if (LIST_ITEM_RE.test(line)) return false;
  if (isSectionHeadingLine(line)) return false;
  if (peelLeadingSectionLabel(line)?.body) return false;
  if (line.length < 24 || line.length > 220) return false;
  if (/[.!?]$/.test(line)) return false;
  if (/^[A-Za-z0-9].+:\s*\S/.test(line) && line.length < 60) return false;
  return true;
}

/**
 * Splits plain/markdown job text into renderable blocks.
 */
export function parseJobDescriptionBlocks(
  markdown: string | null | undefined
): JobDescriptionBlock[] {
  if (!markdown?.trim()) return [];

  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: JobDescriptionBlock[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let inDutiesSection = false;

  function flushParagraph() {
    if (paragraphLines.length === 0) return;
    const text = paragraphLines.join(" ").replace(/\s+/g, " ").trim();
    paragraphLines = [];
    if (text) blocks.push({ type: "paragraph", text });
  }

  function flushList() {
    if (listItems.length === 0) return;
    blocks.push({ type: "list", items: listItems });
    listItems = [];
  }

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    // Inline "Role Description The Software Engineer will…" → heading + body.
    const peeled = peelLeadingSectionLabel(trimmed);
    if (peeled && peeled.body) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: 3, text: peeled.label });
      const kind = peeled.kind;
      inDutiesSection = kind === "role" || kind === "requirements";
      if (inDutiesSection && isImplicitDutyLine(peeled.body)) {
        listItems.push(peeled.body);
      } else {
        paragraphLines.push(peeled.body);
      }
      continue;
    }

    const heading = isSectionHeadingLine(trimmed);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: heading.level, text: heading.heading });
      const kind = kindForHeading(heading.heading);
      inDutiesSection = kind === "role" || kind === "requirements";
      continue;
    }

    const listMatch = trimmed.match(LIST_ITEM_RE);
    if (listMatch) {
      flushParagraph();
      listItems.push(listMatch[1].trim());
      continue;
    }

    if (inDutiesSection && isImplicitDutyLine(trimmed)) {
      flushParagraph();
      listItems.push(trimmed);
      continue;
    }

    flushList();
    paragraphLines.push(trimmed);
  }

  flushParagraph();
  flushList();
  return blocks;
}
