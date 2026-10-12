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

  const cleaned = cleanEmailPayload(text).replace(/\s+/g, " ").trim();
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
 * Strips EEO statements, perks/benefits fluff, and culture boilerplate
 * before truncating to natural section breaks or sentence boundaries.
 */
export function sanitizeJobDescription(
  rawText: string,
  maxChars = 4000
): string {
  if (!rawText) return "";

  // 1. Initial cleanup
  let sanitized = cleanEmailPayload(rawText);

  // 2. Strip boilerplate and EEO legalese
  for (const pattern of BOILERPLATE_PATTERNS) {
    sanitized = sanitized.replace(pattern, "\n");
  }

  // 3. Normalize whitespace
  sanitized = sanitized
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // 4. Bound check (4,000 to 6,000 chars)
  const effectiveMax = Math.max(4000, Math.min(6000, maxChars));
  if (sanitized.length <= effectiveMax) {
    return sanitized;
  }

  // 5. Look for paragraph or sentence break near the max limit
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
