/**
 * ============================================================================
 * JOB CONTEXT SCRUBBER & TEXT RAMP-UP
 * 
 * Implements sentence-boundary snippet extraction (max 1,500 chars) and
 * boilerplate-stripped job description sanitization (4,000–6,000 chars).
 * ============================================================================
 */

import { cleanEmailPayload } from "@/lib/ai/email-cleaner";

/** Common boilerplate headers and EEO legalese patterns to remove */
const BOILERPLATE_PATTERNS = [
  /equal\s+opportunity\s+(?:employer|affirmative\s+action)[\s\S]*?(?=(?:\n\s*\n|\b(?:qualifications|responsibilities|requirements|role|about|skills)\b|$))/gi,
  /(?:we\s+are\s+an?\s+equal\s+opportunity|all\s+qualified\s+applicants\s+will\s+receive\s+consideration)[\s\S]*?(?=(?:\n\s*\n|$))/gi,
  /(?:we\s+(?:celebrate|value)\s+diversity|diversity\s+and\s+inclusion)[\s\S]*?(?=(?:\n\s*\n|$))/gi,
  /(?:benefits|perks|what\s+we\s+offer):\s*[\s\S]*?(?=(?:\n\s*\n\b[A-Z]|\b(?:about\s+us|requirements|qualifications)\b|$))/gi,
  /(?:covid-?19|vaccination\s+requirements?)[\s\S]*?(?=(?:\n\s*\n|$))/gi,
  /privacy\s+policy|terms\s+of\s+service|unsubscribe|view\s+in\s+browser/gi,
];

/** Leading portal wrapper headings that add no semantic value */
const PORTAL_WRAPPER_HEADING_REGEX =
  /^(?:Job\s+(?:Details|Description|Overview|Snapshot|Summary)|Position\s+Overview|Role\s+Summary)[:\s-]*/i;

/** Common standard core section headers across disciplines */
const CORE_SECTION_HEADER_REGEX =
  /^(?:#+\s*)?(?:About\s+(?:the\s+)?(?:Role|Job|Position|Us|Our\s+Team)|The\s+Role|Role\s+Overview|Responsibilities|What\s+You(?:'ll|\s+will)\s+Do|Key\s+Responsibilities|Core\s+Duties|Duties|Summary|Overview|Requirements|Qualifications|Minimum\s+(?:Qualifications|Requirements)|Basic\s+(?:Qualifications|Requirements)|Required\s+(?:Qualifications|Requirements)|Preferred\s+(?:Qualifications|Requirements)|Must\s+Have)[:\s-]*/i;

/** Common metadata key-value line pattern (e.g., Location: New York, Job ID: 12345) */
const METADATA_KEY_VALUE_REGEX =
  /^[A-Za-z\s/&_-]{1,35}:\s*.{0,120}$/;

/** Loose navigation crumbs, action buttons, or table of contents */
const NAV_OR_CRUMB_REGEX =
  /^(?:Home|Careers?|Jobs?|Search(?:\s+Jobs)?|Back\s+to\s+Search|Apply(?:\s+Now)?|Share|Save(?:\s+Job)?|Print|Email(?:\s+Job)?)(?:\s*[>|•·/\\-]\s*.*)?$/i;

/**
 * Strips portal wrapper headings, leading metadata key-value blocks,
 * and loose navigation crumbs before the core job description content.
 */
export function stripPortalPreambles(text: string): string {
  if (!text) return "";

  const lines = text.replace(/\r\n/g, "\n").split("\n");

  // 1. Check if a core section header exists in the initial section of the document
  const coreHeaderIndex = lines.findIndex((line, idx) => {
    if (idx > 30) return false;
    return CORE_SECTION_HEADER_REGEX.test(line.trim());
  });

  if (coreHeaderIndex > 0) {
    const precedingLines = lines.slice(0, coreHeaderIndex);
    const isPreamble = precedingLines.every((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      return (
        PORTAL_WRAPPER_HEADING_REGEX.test(trimmed) ||
        METADATA_KEY_VALUE_REGEX.test(trimmed) ||
        NAV_OR_CRUMB_REGEX.test(trimmed) ||
        trimmed.includes(" > ") ||
        trimmed.endsWith(":") ||
        trimmed.length < 80
      );
    });

    if (isPreamble) {
      lines.splice(0, coreHeaderIndex);
    }
  }

  // 2. Drop leading lines that are wrapper headings, metadata pairs, or end in colons
  while (lines.length > 0) {
    const firstLine = lines[0].trim();
    if (!firstLine) {
      lines.shift();
      continue;
    }

    // Anchor at core section header
    if (CORE_SECTION_HEADER_REGEX.test(firstLine)) {
      break;
    }

    if (PORTAL_WRAPPER_HEADING_REGEX.test(firstLine)) {
      const remainder = firstLine.replace(PORTAL_WRAPPER_HEADING_REGEX, "").trim();
      if (remainder) {
        lines[0] = remainder;
        break;
      } else {
        lines.shift();
        continue;
      }
    }

    const colonIdx = firstLine.indexOf(":");
    const hasValueAfterColon = colonIdx > 0 && firstLine.slice(colonIdx + 1).trim().length > 0;
    const isKeyValueMetadata = METADATA_KEY_VALUE_REGEX.test(firstLine) && hasValueAfterColon;

    if (
      isKeyValueMetadata ||
      NAV_OR_CRUMB_REGEX.test(firstLine) ||
      (firstLine.endsWith(":") && firstLine.length < 50 && !CORE_SECTION_HEADER_REGEX.test(firstLine))
    ) {
      lines.shift();
      continue;
    }

    break;
  }

  let result = lines.join("\n");

  // 3. Clean leading punctuation artifacts (stray colons, hyphens, bullets, pipes)
  result = result.replace(/^[\s:;•\-\*\>\|]+/, "").trim();

  return result;
}

/**
 * Extracts a smart preview snippet from email text.
 * Ramps up to natural sentence boundaries (`[.!?]`), avoiding abrupt cuts,
 * bounded between `minChars` and `maxChars`.
 */
export function extractCleanSnippet(
  text: string,
  minChars = 500,
  maxChars = 1500
): string {
  if (!text) return "";

  const preamblesStripped = stripPortalPreambles(cleanEmailPayload(text));
  const cleaned = preamblesStripped.replace(/\s+/g, " ").trim();
  if (cleaned.length <= minChars) {
    return cleaned;
  }

  // Look for natural sentence boundary between minChars and maxChars
  const targetWindow = cleaned.slice(minChars, maxChars);
  const sentenceMatch = targetWindow.match(/[.!?](\s+|$)/);

  if (sentenceMatch && sentenceMatch.index !== undefined) {
    const cutoff = minChars + sentenceMatch.index + 1;
    return cleaned.slice(0, cutoff).trim();
  }

  // If no punctuation boundary found, find the last space before maxChars
  if (cleaned.length > maxChars) {
    const spaceIndex = cleaned.lastIndexOf(" ", maxChars - 3);
    if (spaceIndex > minChars) {
      return `${cleaned.slice(0, spaceIndex).trim()}...`;
    }
    return `${cleaned.slice(0, maxChars - 3).trim()}...`;
  }

  return cleaned;
}

/**
 * Strips EEO statements, perks/benefits fluff, portal preambles, and culture boilerplate
 * before truncating to natural section breaks or sentence boundaries.
 */
export function sanitizeJobDescription(
  rawText: string,
  maxChars = 4000
): string {
  if (!rawText) return "";

  // 1. Initial cleanup
  let sanitized = cleanEmailPayload(rawText);

  // 2. Strip structural portal preambles & metadata blocks
  sanitized = stripPortalPreambles(sanitized);

  // 3. Strip boilerplate and EEO legalese
  for (const pattern of BOILERPLATE_PATTERNS) {
    sanitized = sanitized.replace(pattern, "\n");
  }

  // 4. Clean leading punctuation artifacts (stray colons, hyphens, bullets, pipes)
  sanitized = sanitized.replace(/^[\s:;•\-\*\>\|]+/, "").trim();

  // 5. Normalize whitespace
  sanitized = sanitized
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // 6. Bound check (4,000 to 6,000 chars)
  const effectiveMax = Math.max(4000, Math.min(6000, maxChars));
  if (sanitized.length <= effectiveMax) {
    return sanitized;
  }

  // 7. Look for paragraph or sentence break near the max limit
  const slice = sanitized.slice(0, effectiveMax);
  const paragraphBreak = slice.lastIndexOf("\n\n");
  if (paragraphBreak > effectiveMax * 0.75) {
    return sanitized.slice(0, paragraphBreak).trim();
  }

  const sentenceBreak = slice.search(/[.!?](?=[^.!?]*$)/);
  if (sentenceBreak > effectiveMax * 0.75) {
    return sanitized.slice(0, sentenceBreak + 1).trim();
  }

  const wordBreak = slice.lastIndexOf(" ");
  if (wordBreak > 0) {
    return `${sanitized.slice(0, wordBreak).trim()}...`;
  }

  return `${sanitized.slice(0, effectiveMax - 3).trim()}...`;
}
