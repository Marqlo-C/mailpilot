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

/** Layout-invariant core role section headers across disciplines */
const CORE_ROLE_SECTION_REGEX =
  /^(?:#+\s*)?(?:About\s+the\s+(?:Role|Job|Position)|The\s+Role|Role\s+Overview|Position\s+Overview|Job\s+Summary|Role\s+Summary|Responsibilities|What\s+You(?:'ll|\s+will)\s+Do|Key\s+Responsibilities|Core\s+Duties|Duties|Day\s+in\s+the\s+Life|Requirements|Qualifications|What\s+You(?:'ll|\s+will)\s+Bring|What\s+We(?:'re|\s+are)\s+Looking\s+For|Minimum\s+(?:Qualifications|Requirements)|Basic\s+(?:Qualifications|Requirements)|Required\s+(?:Qualifications|Requirements)|Preferred\s+(?:Qualifications|Requirements)|Must\s+Have)[:\s-]*/i;

/** Leading corporate marketing, mission, or company overview headers */
const CORPORATE_MARKETING_HEADING_REGEX =
  /^(?:#+\s*)?(?:About\s+(?:the\s+)?(?:Company|Organization|Business|Firm)|About\s+[A-Za-z0-9&.,' -]{1,40}|Company\s+Overview|Organization\s+Overview|Who\s+We\s+Are|Our\s+Mission|Our\s+Story)[:\s-]*/i;

/** Common standard core section headers across disciplines */
const CORE_SECTION_HEADER_REGEX =
  /^(?:#+\s*)?(?:About\s+(?:the\s+)?(?:Role|Job|Position|Us|Our\s+Team)|The\s+Role|Role\s+Overview|Responsibilities|What\s+You(?:'ll|\s+will)\s+Do|Key\s+Responsibilities|Core\s+Duties|Duties|Summary|Overview|Requirements|Qualifications|Minimum\s+(?:Qualifications|Requirements)|Basic\s+(?:Qualifications|Requirements)|Required\s+(?:Qualifications|Requirements)|Preferred\s+(?:Qualifications|Requirements)|Must\s+Have)[:\s-]*/i;

/** Common metadata key-value line pattern (e.g., Location: New York, Job ID: 12345) */
const METADATA_KEY_VALUE_REGEX =
  /^[A-Za-z\s/&_-]{1,35}:\s*.{0,120}$/;

/** Loose navigation crumbs, action buttons, or table of contents */
const NAV_OR_CRUMB_REGEX =
  /^(?:Home|Careers?|Jobs?|Search(?:\s+Jobs)?|Back\s+to\s+Search|Apply(?:\s+Now)?|Share|Save(?:\s+Job)?|Print|Email(?:\s+Job)?)(?:\s*[>|•·/\\-]\s*.*)?$/i;

/** Leading aggregator alert and platform marketing headers to strip */
const AGGREGATOR_ALERT_HEADER_REGEX =
  /(?:^|\n)\s*(?:Job\s+alert:\s*(?:[^\n]{0,80}\n|[^\n]{0,60}$)|Jobs?\s+(?:tailored|recommended)\s+for\s+you[^\n]*(?:\n|$)|One\s+job\s+we\s+think\s+you'll\s+love[^\n]*(?:\n|$)|#1\s+Job\s+Platform[^\n]*(?:\n|$)|Why\s+it\s+matches:[^\n]*(?:\n|$))/gi;

const AGGREGATOR_ALERT_LINE_REGEX =
  /^(?:Job\s+alert:\s*.{0,60}|Jobs?\s+(?:tailored|recommended)\s+for\s+you.*|One\s+job\s+we\s+think\s+you'll\s+love.*|#1\s+Job\s+Platform.*|Why\s+it\s+matches:.*)$/i;

const SAVED_SEARCH_HEADER_REGEX =
  /(?:^|\n)\s*(?:(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\s*based on your saved search[^\n]*(?:\n|$)|based on your saved search[^\n]*(?:\n|$))/gi;

export interface CleanSnippetFallbackContext {
  roleTitle?: string | null;
  company?: string | null;
  location?: string | null;
  salary?: string | null;
}

export function buildSynthesizedJobOverview(
  context?: CleanSnippetFallbackContext
): string {
  const role = context?.roleTitle?.trim() || "Role";
  const comp = context?.company?.trim();
  const companyPart = comp && comp !== "Unknown Company" ? ` at ${comp}` : "";
  const locationPart = context?.location?.trim()
    ? ` Located in ${context.location.trim()}.`
    : "";
  const salaryPart = context?.salary?.trim()
    ? ` Compensated at ${context.salary.trim()}.`
    : "";
  return `Opportunity for ${role}${companyPart}.${locationPart}${salaryPart}`.trim();
}

/** Trailing benefits, perks, and discount listings */
const TRAILING_BENEFITS_REGEX =
  /(?:\n\s*\n|\n|^)(?:#+\s*)?(?:(?:\+\s*\d+|\d+)\s+benefits|(?:our\s+)?(?:benefits|perks|what\s+we\s+offer|compensation\s+(?:&|and)\s+benefits|why\s+join\s+us|company\s+discounts)(?:\s*(?:&|and)\s*(?:perks|benefits))?)[:\s-]*[\s\S]*?(?=(?:\n\s*\n\b(?:#+\s*)?(?:responsibilities|qualifications|requirements|core\s+duties|what\s+you(?:'ll|\s+will)\s+do|the\s+role|about\s+the\s+role)\b|$))/gi;

/** Standalone trailing benefit mentions (e.g., "+17 benefits", "Company Discounts", "401(K) Match | Stock Purchase Plan | +10") */
const TRAILING_BENEFIT_ITEMS_REGEX =
  /(?:\n|^)\s*(?:[•\-\*]\s*)?(?:(?:\+\s*\d+|\d+)\s+benefits|company\s+discounts|401\s*\(?k\)?\s*match\s*(?:\||\/|•)\s*stock\s*purchase\s*plan\s*(?:\||\/|•)\s*\+\s*\d+.*)(?:\s*[•\-\*]|\s*$)/gim;

/** Synthetic placeholder patterns to filter from snippets */
const PLACEHOLDER_SENTENCE_PATTERNS = [
  /^synthesized from single-job classification fields/i,
  /^(?:no\s+)?(?:job\s+)?description(?:\s+not)?\s+provided/i,
  /^click\s+here\s+to\s+(?:view|apply)/i,
  /^view\s+(?:the\s+)?(?:full\s+)?job\s+(?:posting|details|description)/i,
];

function filterPlaceholderSentences(text: string): string {
  if (!text) return "";
  const sentences = text.split(/(?<=[.!?])\s+/);
  const cleanedSentences: string[] = [];
  for (const s of sentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    if (PLACEHOLDER_SENTENCE_PATTERNS.some((p) => p.test(trimmed))) continue;
    if (
      cleanedSentences.length > 0 &&
      cleanedSentences[cleanedSentences.length - 1].toLowerCase() === trimmed.toLowerCase()
    ) {
      continue;
    }
    cleanedSentences.push(trimmed);
  }
  return cleanedSentences.join(" ");
}

/**
 * Strips portal wrapper headings, leading metadata key-value blocks,
 * and loose navigation crumbs before the core job description content.
 */
export function stripPortalPreambles(text: string): string {
  if (!text) return "";

  const preProcessed = text
    .replace(AGGREGATOR_ALERT_HEADER_REGEX, "\n")
    .replace(SAVED_SEARCH_HEADER_REGEX, "\n");
  const lines = preProcessed.replace(/\r\n/g, "\n").split("\n");

  // 1. If document starts with corporate marketing or portal wrappers before a core role section, anchor at the core role section
  const firstCoreRoleIdx = lines.findIndex((line, idx) => {
    if (idx > 40) return false;
    return CORE_ROLE_SECTION_REGEX.test(line.trim());
  });

  if (firstCoreRoleIdx > 0) {
    const precedingLines = lines.slice(0, firstCoreRoleIdx);
    const hasMarketingOrPreamble = precedingLines.some((line) => {
      const trimmed = line.trim();
      return (
        CORPORATE_MARKETING_HEADING_REGEX.test(trimmed) ||
        PORTAL_WRAPPER_HEADING_REGEX.test(trimmed) ||
        METADATA_KEY_VALUE_REGEX.test(trimmed) ||
        AGGREGATOR_ALERT_LINE_REGEX.test(trimmed)
      );
    });

    if (hasMarketingOrPreamble) {
      lines.splice(0, firstCoreRoleIdx);
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
    if (CORE_ROLE_SECTION_REGEX.test(firstLine) || CORE_SECTION_HEADER_REGEX.test(firstLine)) {
      break;
    }

    if (/^(?:Job alert|Jobs tailored for you|Recommended jobs):/i.test(firstLine)) {
      const remainder = firstLine
        .replace(/^(?:Job alert:\s*|Jobs tailored for you:\s*|Recommended jobs:\s*)/i, "")
        .trim();
      if (remainder.length >= 40) {
        lines[0] = remainder;
        break;
      } else {
        lines.shift();
        continue;
      }
    }

    if (AGGREGATOR_ALERT_LINE_REGEX.test(firstLine) || SAVED_SEARCH_HEADER_REGEX.test(firstLine)) {
      lines.shift();
      continue;
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
  maxChars = 1500,
  fallbackContext?: CleanSnippetFallbackContext
): string {
  const synthesizedFallback = buildSynthesizedJobOverview(fallbackContext);

  if (!text) {
    if (fallbackContext?.roleTitle || fallbackContext?.company) {
      return synthesizedFallback;
    }
    return "";
  }

  const hadJobAlert = /job\s+alert/i.test(text);

  const preamblesStripped = stripPortalPreambles(cleanEmailPayload(text));
  const deduplicated = filterPlaceholderSentences(preamblesStripped);
  let cleaned = deduplicated.replace(/\s+/g, " ").trim();

  // Clean leading alert text
  cleaned = cleaned
    .replace(/^(?:Job alert:\s*|Jobs tailored for you:\s*|Recommended jobs:\s*)/i, "")
    .trim();

  // If the snippet after stripping consists solely of an alert header, marketing noise, or < 40 chars when alert was present
  const isAlertOrMarketingOnly =
    !cleaned ||
    (hadJobAlert && cleaned.length < 40) ||
    cleaned.length < 15 ||
    /^job alert/i.test(cleaned) ||
    AGGREGATOR_ALERT_LINE_REGEX.test(cleaned) ||
    /(?:#1\s+Job\s+Platform|One\s+job\s+we\s+think\s+you'll\s+love|Why\s+it\s+matches)/i.test(cleaned) ||
    /^(?:Job\s+alert|#1\s+Job\s+Platform|One\s+job\s+we\s+think|Why\s+it\s+matches)/i.test(cleaned);

  if (isAlertOrMarketingOnly) {
    if (fallbackContext?.roleTitle || fallbackContext?.company) {
      return synthesizedFallback;
    }
    return "";
  }

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

  // Look for the last sentence boundary before maxChars
  const lastSentenceBeforeMax = cleaned.slice(0, maxChars).search(/[.!?](?=[^.!?]*$)/);
  if (lastSentenceBeforeMax >= minChars * 0.5) {
    return cleaned.slice(0, lastSentenceBeforeMax + 1).trim();
  }

  // If no punctuation boundary found, find the last space before maxChars
  if (cleaned.length > maxChars) {
    const spaceIndex = cleaned.lastIndexOf(" ", maxChars - 3);
    if (spaceIndex > minChars * 0.5) {
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
  maxChars = 4000,
  fallbackContext?: CleanSnippetFallbackContext
): string {
  if (!rawText) {
    if (fallbackContext?.roleTitle || fallbackContext?.company) {
      return buildSynthesizedJobOverview(fallbackContext);
    }
    return "";
  }

  const hadJobAlert = /job\s+alert/i.test(rawText);

  // 1. Initial cleanup
  let sanitized = cleanEmailPayload(rawText);

  // 2. Strip structural portal preambles & metadata blocks
  sanitized = stripPortalPreambles(sanitized);

  // 3. Strip boilerplate and EEO legalese
  for (const pattern of BOILERPLATE_PATTERNS) {
    sanitized = sanitized.replace(pattern, "\n");
  }

  // 4. Strip trailing benefit itemizations
  sanitized = sanitized.replace(TRAILING_BENEFITS_REGEX, "\n");
  sanitized = sanitized.replace(TRAILING_BENEFIT_ITEMS_REGEX, "\n");

  // 5. Clean alert lines and saved search preambles unconditionally
  sanitized = sanitized
    .replace(
      /(?:^|\n)\s*(?:(?:january|february|march|april|may|june|july|august|september|october|november|december|[a-z]{3})\s+\d{1,2}\s+)?job\s+alert[:\s-][^\n]*/gi,
      "\n"
    )
    .replace(/(?:^|\n)\s*Job alert[^\n]*/gi, "\n")
    .replace(SAVED_SEARCH_HEADER_REGEX, "\n");

  // 6. Clean leading punctuation artifacts (stray colons, hyphens, bullets, pipes)
  sanitized = sanitized.replace(/^[\s:;•\-\*\>\|]+/, "").trim();

  // 7. Normalize whitespace
  sanitized = sanitized
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Strip leading alert banner if still present
  sanitized = sanitized
    .replace(
      /^(?:(?:(?:january|february|march|april|may|june|july|august|september|october|november|december|[a-z]{3})\s+\d{1,2}\s+)?Job\s+alert[:\s-][^\n]*|Job alert:\s*|Jobs tailored for you:\s*|Recommended jobs:\s*)/i,
      ""
    )
    .trim();

  if ((hadJobAlert && sanitized.length < 40) || sanitized.length < 15 || /^job alert/i.test(sanitized)) {
    if (fallbackContext?.roleTitle || fallbackContext?.company) {
      return buildSynthesizedJobOverview(fallbackContext);
    }
  }

  // 8. Bound check (4,000 to 6,000 chars)
  const effectiveMax = Math.max(4000, Math.min(6000, maxChars));
  if (sanitized.length <= effectiveMax) {
    return sanitized;
  }

  // 9. Look for paragraph or sentence break near the max limit
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
