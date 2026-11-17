/**
 * Card-facing job description helpers (2-line teaser + modal body).
 * Presentation must not depend on the AI classifier cleaner.
 */

import {
  isSectionHeadingOnly,
  kindForHeading,
  peelLeadingSectionLabel,
  preferProseAfterSectionLabel,
  stripLeadingSectionLabels,
  type JobSectionKind,
} from "./job-section-labels";
import {
  buildSynthesizedJobOverview,
  sanitizeJobDescription,
  type CleanSnippetFallbackContext,
} from "./scrubber";

/** Soft cap so CSS line-clamp-2 is the visual limit and string-level "..." still appears. */
const TEASER_MAX_CHARS = 190;

const MARKDOWN_HEADING_RE = /^#{1,3}\s+/;
const BOLD_WRAPPED_LINE_RE = /^\*\*(.+)\*\*$/;
const METADATA_LINE_RE =
  /^(?:department|location|job\s*id|employment\s*type|job\s*type|experience\s*level|seniority|salary|compensation|reports?\s*to|manager|team|category|requisition|req(?:uisition)?\s*id|posted|date|workplace|work\s*arrangement)[:\s]/i;
const REQUIREMENT_OPENER_RE =
  /^(?:\d+\+?\s*years?|bachelor|master|phd|degree|must\s+have|required:|minimum\s+qualifications)/i;

type TeaserCandidate = {
  text: string;
  kind: JobSectionKind | "unknown";
};

/**
 * Clamps text at a sentence or word boundary so teasers never mid-cut a token.
 *
 * @param text - Source string (already flattened or first paragraph).
 * @param maxChars - Inclusive soft maximum length.
 * @returns Clamped string; appends "..." only when a hard word cut is required.
 */
export function clampSnippetAtBoundary(text: string, maxChars: number): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned || maxChars <= 0) return "";
  if (cleaned.length <= maxChars) return cleaned;

  const slice = cleaned.slice(0, maxChars);
  const sentenceMatch = slice.match(/[.!?](?=[^.!?]*$)/);
  if (sentenceMatch && sentenceMatch.index !== undefined && sentenceMatch.index >= maxChars * 0.45) {
    return cleaned.slice(0, sentenceMatch.index + 1).trim();
  }

  const spaceIndex = slice.lastIndexOf(" ");
  if (spaceIndex > maxChars * 0.45) {
    return `${cleaned.slice(0, spaceIndex).trim()}...`;
  }

  return `${cleaned.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

/**
 * Strips inline markdown markers for plain-text card teasers.
 */
export function stripInlineMarkdownMarkers(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(?<!_)_([^_]+)_(?!_)/g, "$1")
    .replace(/\*{1,2}/g, "")
    // Duty-list teasers ("What you'll do") should read as prose, not "- Develop…"
    .replace(/(?:^|[\n\r]|[ \t])[-*•]\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when a block should never be used as the card-face teaser source.
 */
export function isTeaserJunkBlock(text: string): boolean {
  const stripped = stripInlineMarkdownMarkers(text);
  if (!stripped || stripped.length < 40) return true;

  if (MARKDOWN_HEADING_RE.test(stripped)) return true;
  if (BOLD_WRAPPED_LINE_RE.test(text.trim())) return true;
  if (METADATA_LINE_RE.test(stripped)) return true;
  if (isSectionHeadingOnly(stripped)) return true;

  const letters = stripped.replace(/[^A-Za-z]/g, "");
  if (
    letters.length >= 8 &&
    letters === letters.toUpperCase() &&
    !/[.!?]$/.test(stripped) &&
    stripped.split(/\s+/).length <= 8
  ) {
    return true;
  }

  return false;
}

function isRequirementOpener(text: string): boolean {
  return REQUIREMENT_OPENER_RE.test(stripInlineMarkdownMarkers(text));
}

/**
 * Structural company-About cues (career-agnostic).
 */
export function isCompanyAboutBlurb(text: string): boolean {
  const stripped = stripInlineMarkdownMarkers(text);
  return (
    /\bis a (?:modern |leading |global |remote )?(?:space |cloud |software |technology |job )?(?:infrastructure )?company\b/i.test(
      stripped
    ) ||
    /\bis a (?:remote |leading |global )?(?:job )?platform\b/i.test(stripped) ||
    /\bis a (?:modern |leading )?(?:startup|organization|firm)\b/i.test(stripped) ||
    /\bfounded in\s+\d{4}\b/i.test(stripped) ||
    /\bconnects candidates with (?:roles|jobs|opportunities)\b/i.test(stripped) ||
    /\bhelping professionals find\b/i.test(stripped)
  );
}

function looksLikeRoleProse(text: string): boolean {
  const stripped = stripInlineMarkdownMarkers(text);
  if (stripped.length < 40) return false;
  if (isRequirementOpener(stripped)) return false;
  if (isCompanyAboutBlurb(stripped)) return false;
  const sentenceStops = (stripped.match(/[.!?]/g) || []).length;
  return sentenceStops >= 1 || stripped.length >= 80;
}

function isHeadingLikeLine(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (MARKDOWN_HEADING_RE.test(trimmed)) return true;
  if (BOLD_WRAPPED_LINE_RE.test(trimmed)) return true;
  if (isSectionHeadingOnly(trimmed)) return true;
  const peeled = peelLeadingSectionLabel(trimmed);
  // Inline "Company Description Remolity…" counts as heading+body for segmentation.
  return Boolean(peeled);
}

function pushCandidate(
  list: TeaserCandidate[],
  text: string,
  kind: JobSectionKind | "unknown"
) {
  const cleaned = stripInlineMarkdownMarkers(text).trim();
  if (!cleaned) return;
  list.push({ text: cleaned, kind });
}

/**
 * Picks the best plain-text paragraph for the card-face teaser.
 * Prefers role prose; peels Title Case section labels; deprioritizes company About.
 */
export function pickTeaserSourceParagraph(raw: string): string {
  let normalized = raw.replace(/\r\n/g, "\n");
  normalized = normalized
    .replace(
      /(?:^|\n)\s*(?:(?:january|february|march|april|may|june|july|august|september|october|november|december|[a-z]{3})\s+\d{1,2}\s+)?job\s+alert[:\s-][^\n.]{0,80}(?:\.|(?=\s+[A-Z])|$)/gi,
      "\n"
    )
    .replace(/^job\s+alert[:\s-]\s*/i, "")
    .trim();
  if (!normalized) return "";

  const lines = normalized.split("\n").map((l) => l.trim()).filter(Boolean);
  const candidates: TeaserCandidate[] = [];
  let buffer: string[] = [];
  let bufferKind: JobSectionKind | "unknown" = "unknown";

  const pushBuffer = () => {
    if (buffer.length === 0) return;
    pushCandidate(candidates, buffer.join(" "), bufferKind);
    buffer = [];
    bufferKind = "unknown";
  };

  let currentSectionKind: JobSectionKind | "unknown" = "unknown";

  for (const line of lines) {
    if (METADATA_LINE_RE.test(stripInlineMarkdownMarkers(line))) {
      pushBuffer();
      continue;
    }

    const peeled = peelLeadingSectionLabel(line);
    if (peeled) {
      pushBuffer();
      currentSectionKind = peeled.kind;
      if (peeled.body) {
        pushCandidate(candidates, peeled.body, peeled.kind);
      }
      continue;
    }

    if (isHeadingLikeLine(line)) {
      pushBuffer();
      currentSectionKind = kindForHeading(line);
      continue;
    }

    bufferKind = currentSectionKind;
    buffer.push(line);
    const joined = buffer.join(" ");
    if ((joined.match(/[.!?]/g) || []).length >= 2 && joined.length >= 120) {
      pushBuffer();
      bufferKind = currentSectionKind;
    }
  }
  pushBuffer();

  if (candidates.length <= 1 && /\n\n/.test(normalized)) {
    candidates.length = 0;
    currentSectionKind = "unknown";
    for (const block of normalized.split(/\n{2,}/)) {
      const trimmed = block.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
      if (!trimmed) continue;
      const peeled = peelLeadingSectionLabel(trimmed);
      if (peeled) {
        currentSectionKind = peeled.kind;
        if (peeled.body) pushCandidate(candidates, peeled.body, peeled.kind);
        continue;
      }
      if (isSectionHeadingOnly(trimmed)) {
        currentSectionKind = kindForHeading(trimmed);
        continue;
      }
      pushCandidate(candidates, trimmed, currentSectionKind);
    }
  }

  const usable = (c: TeaserCandidate) =>
    !isTeaserJunkBlock(c.text) &&
    !isRequirementOpener(c.text) &&
    (looksLikeRoleProse(c.text) || c.text.length >= 60);

  // Prefer explicit role-kind bodies first.
  const roleHit = candidates.find((c) => c.kind === "role" && usable(c) && !isCompanyAboutBlurb(c.text));
  if (roleHit) return roleHit.text;

  // After overview / unknown: skip company blurbs to the first role-like prose.
  let fallbackCompany: string | null = null;
  let fallbackRequirement: string | null = null;

  for (const c of candidates) {
    if (isTeaserJunkBlock(c.text)) continue;
    if (c.kind === "company" || isCompanyAboutBlurb(c.text)) {
      fallbackCompany ??= c.text;
      continue;
    }
    if (c.kind === "requirements" || isRequirementOpener(c.text)) {
      fallbackRequirement ??= c.text;
      continue;
    }
    if (usable(c)) return c.text;
  }

  return fallbackCompany || fallbackRequirement || "";
}

/**
 * Flattens the full description into plain prose from `preferredStart` onward
 * so short opening paragraphs can continue into following body text.
 */
export function buildTeaserFillStream(raw: string, preferredStart: string): string {
  const preferred = stripInlineMarkdownMarkers(
    stripLeadingSectionLabels(preferProseAfterSectionLabel(preferredStart))
  ).trim();
  if (!preferred) return "";

  const lines = raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const proseParts: string[] = [];
  for (const line of lines) {
    if (METADATA_LINE_RE.test(stripInlineMarkdownMarkers(line))) continue;
    if (isSectionHeadingOnly(line) || MARKDOWN_HEADING_RE.test(line)) continue;
    if (BOLD_WRAPPED_LINE_RE.test(line) && isSectionHeadingOnly(line.replace(/^\*\*(.+)\*\*$/, "$1"))) {
      continue;
    }

    const peeled = peelLeadingSectionLabel(line);
    const body = peeled?.body
      ? stripInlineMarkdownMarkers(peeled.body)
      : stripInlineMarkdownMarkers(line);
    if (!body || (isTeaserJunkBlock(body) && body.length < 60)) continue;
    if (isSectionHeadingOnly(body)) continue;
    proseParts.push(body);
  }

  const fullProse = proseParts.join(" ").replace(/\s+/g, " ").trim();
  if (!fullProse) return preferred;

  const preferredNeedle = preferred.slice(0, Math.min(preferred.length, 80));
  const idx = fullProse.toLowerCase().indexOf(preferredNeedle.toLowerCase());
  if (idx >= 0) {
    return fullProse.slice(idx).trim();
  }

  // Preferred blurb not found verbatim — keep it as the head, then append remaining prose.
  const remainder = proseParts
    .filter((p) => !preferred.toLowerCase().includes(p.slice(0, 40).toLowerCase()))
    .join(" ");
  return stripInlineMarkdownMarkers(`${preferred} ${remainder}`).replace(/\s+/g, " ").trim();
}

/**
 * Fills ~2 card lines with word-boundary ellipsis whenever the stream exceeds maxChars.
 * No early sentence stop without "...".
 */
export function fillTeaserToTwoLines(text: string, maxChars = TEASER_MAX_CHARS): string {
  const cleaned = stripInlineMarkdownMarkers(text).replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (cleaned.length <= maxChars) return cleaned;

  const slice = cleaned.slice(0, maxChars);
  const spaceIndex = slice.lastIndexOf(" ");
  if (spaceIndex > maxChars * 0.5) {
    return `${cleaned.slice(0, Math.min(spaceIndex, maxChars - 3)).trim()}...`;
  }

  return `${cleaned.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True when `text` is only the synthesized metadata overview (or a legacy JobLeads one-liner).
 */
export function isSynthesizedJobOverviewEcho(
  text: string | null | undefined,
  context?: CleanSnippetFallbackContext
): boolean {
  const value = text?.replace(/\s+/g, " ").trim();
  if (!value) return false;

  const synthesized = buildSynthesizedJobOverview(context).replace(/\s+/g, " ").trim();
  if (synthesized) {
    if (value === synthesized) return true;
    if (synthesized.startsWith(value) && value.length >= 24) return true;
  }

  const role = context?.roleTitle?.trim();
  const company = context?.company?.trim();
  const companyKnown = Boolean(company && company !== "Unknown Company");

  // SSOT shape: "Opportunity for {role}[ at {company}].[ Located in ….].[ Compensated at ….]"
  // Strip optional metadata tails first so salary values with "." (e.g. $21.64) still match.
  if (/^Opportunity for /i.test(value) && role && value.includes(role)) {
    if (!companyKnown || value.includes(company!)) {
      const core = value
        .replace(/\s+Compensated at [\s\S]+$/i, "")
        .replace(/\s+Located in [\s\S]+$/i, "")
        .trim();
      const expected = companyKnown
        ? `Opportunity for ${role} at ${company}`
        : `Opportunity for ${role}`;
      // Collapse trailing dots so "Inc." companies still match SSOT's extra period.
      const normalize = (s: string) => s.replace(/\.+$/, "").trim().toLowerCase();
      if (normalize(core) === normalize(expected)) return true;
    }
  }

  // Legacy JobLeads: "{role} at {company}[ in {location}]."
  if (role && companyKnown) {
    const legacy = new RegExp(
      `^${escapeRegExp(role)} at ${escapeRegExp(company!)}(?: in .+)?\\.$`,
      "i"
    );
    if (legacy.test(value)) return true;
  }

  return false;
}

/**
 * Builds a ~2-line card-face teaser from a stored job description.
 * Synthetic / legacy no-JD overviews render as the SSOT "Opportunity for…" line.
 */
export function formatOpportunityCardTeaser(
  raw: string | null | undefined,
  context?: CleanSnippetFallbackContext
): string | null {
  if (!raw?.trim()) return null;

  if (isSynthesizedJobOverviewEcho(raw, context)) {
    return buildSynthesizedJobOverview(context);
  }

  const preferred = pickTeaserSourceParagraph(raw);
  if (!preferred) return null;

  // Continue from the pick through following prose so short paragraphs still fill ~2 lines.
  const stream = buildTeaserFillStream(raw, preferred);
  if (!stream) return null;

  const teaser = fillTeaserToTwoLines(stream);
  if (!teaser.trim()) return null;
  if (isSynthesizedJobOverviewEcho(teaser, context)) {
    return buildSynthesizedJobOverview(context);
  }
  if (isTeaserJunkBlock(teaser) && teaser.length < 60) return null;

  return teaser.trim();
}

/**
 * Structure-preserving body for the full-description dialog.
 * Synthetics have no real JD — do not open a modal for them.
 */
export function formatOpportunityModalBody(
  raw: string | null | undefined,
  context?: CleanSnippetFallbackContext
): string | null {
  if (!raw?.trim()) return null;

  const sanitized = sanitizeJobDescription(raw, 4000);
  if (!sanitized.trim() || sanitized.length < 15) return null;
  if (/^Opportunity for /i.test(sanitized.trim())) return null;
  if (isSynthesizedJobOverviewEcho(sanitized, context)) return null;

  return sanitized.trim();
}
