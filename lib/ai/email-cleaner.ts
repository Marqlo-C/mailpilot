import { normalizeProfileUrl } from "@/lib/utils/url";

export const NON_JOB_NAV_REGEX =
  /(?:unsubscribe|privacy|terms|login|sign-?in|preferences|settings|dashboard|manage-?preferences|opt-?out)/i;

export const DIGEST_CARD_ACTION_REGEX =
  /(?=\b(?:View this role|View job|See job|Apply now|Apply on company site|Apply|View details|Job details)\b|\[(?:View this role|View job|See job|Apply now|Apply on company site|Apply|View details|Job details|View)\]\(https?:\/\/)/i;

/**
 * Structural segmenter that identifies repeating card action blocks in multi-job digests.
 * Splits text into blocks anchored around job card action boundaries.
 */
export function segmentDigestBlocks(text: string): string[] {
  if (!text) return [];

  // 1. Markdown horizontal rule card dividers (---, ***, ___ )
  if (/\n\s*[-*_]{3,}\s*\n/.test(text)) {
    const blocks = text
      .split(/\n\s*[-*_]{3,}\s*\n+/)
      .map((b) => b.trim())
      .filter(Boolean);
    if (blocks.length > 1) {
      return blocks;
    }
  }

  // 2. Action links at the bottom of cards (e.g. [View this role](url)\n\n or [Apply now](url)\n\n)
  const afterActionRegex =
    /(?<=\[(?:View this role|View job|See job|Apply now|Apply on company site|Apply|View details|Job details|View)[^\]]*\]\(https?:\/\/[^\)]+\)[^\n]*)\n+/i;
  if (afterActionRegex.test(text)) {
    const blocks = text
      .split(afterActionRegex)
      .map((b) => b.trim())
      .filter(Boolean);
    if (blocks.length > 1) {
      return blocks;
    }
  }

  // 3. Fallback: split on action boundaries
  const blocks = text
    .split(DIGEST_CARD_ACTION_REGEX)
    .map((b) => b.trim())
    .filter(Boolean);
  return blocks.length > 0 ? blocks : [text];
}

/**
 * Extracts the primary apply or job action URL anchored to a specific card block.
 */
export function extractCardApplyUrl(block: string): string | null {
  if (!block) return null;
  const markdownMatch =
    block.match(
      /\[(?:View this role|View job|See job|Apply now|Apply on company site|Apply|View details|Job details|View)\]\((https?:\/\/[^)\s]+)\)/i
    ) || block.match(/\[(?:[^\]]+)\]\((https?:\/\/[^)\s]+)\)/i);
  if (markdownMatch && markdownMatch[1]) {
    const url = markdownMatch[1].trim();
    if (/^https?:\/\//i.test(url) && !NON_JOB_NAV_REGEX.test(url)) return url;
  }
  const rawUrlMatch = block.match(/\bhttps?:\/\/[^\s<>)"]+/i);
  if (rawUrlMatch && rawUrlMatch[0]) {
    const url = rawUrlMatch[0].trim();
    if (/^https?:\/\//i.test(url) && !NON_JOB_NAV_REGEX.test(url)) return url;
  }
  return null;
}

/**
 * Fast pre-LLM email cleaning: strip HTML bloat, preserve apply links as markdown.
 */
function markdownHref(href: string, text: string): string {
  const cleanText = text.replace(/<[^>]+>/g, "").trim();
  const safeHref = normalizeProfileUrl(href);
  if (!safeHref) return ` ${cleanText} `;

  // Discard non-job navigational anchor targets
  if (NON_JOB_NAV_REGEX.test(safeHref)) {
    return ` ${cleanText} `;
  }

  return cleanText ? ` [${cleanText}](${safeHref}) ` : ` ${safeHref} `;
}

export function cleanEmailPayload(rawHtmlOrText: string): string {
  let cleaned = rawHtmlOrText
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, "")
    .replace(/data:image\/[^;]+;base64,[^\s"']+/gi, "");

  // Insert explicit whitespace at closing block elements before stripping tags
  cleaned = cleaned
    .replace(/<\/(?:div|p|td|tr|th|section|li|h[1-6]|table)>/gi, " \n")
    .replace(/<br\s*\/?>/gi, " \n");

  // Preserve markdown anchors
  cleaned = cleaned.replace(
    /<a\s+(?:[^>]*?\s+)?href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi,
    (_match, _quote: string, href: string, text: string) => markdownHref(href, text)
  );

  cleaned = cleaned.replace(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_match, href: string, text: string) => markdownHref(href, text)
  );

  // Strip remaining tags with padding
  cleaned = cleaned
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/https?:\/\/\S*(?:\/pixel|track\/open)\S*/gi, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();

  // Strip aggregator digest preambles (e.g. "OCTOBER 13BASED ON YOUR SAVED SEARCHMOST RELEVANT JOBS FOR YOU")
  cleaned = cleaned
    .replace(/(?:^|\n)\s*(?:[A-Za-z]+\s*\d{1,2}\s*)?based\s*on\s*your\s*saved\s*search[^\n]*(?:\n|$)/gi, "\n\n")
    .trim();

  return cleaned.slice(0, 10000);
}
