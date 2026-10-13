import { normalizeProfileUrl } from "@/lib/utils/url";

/**
 * Fast pre-LLM email cleaning: strip HTML bloat, preserve apply links as markdown.
 */
function markdownHref(href: string, text: string): string {
  const cleanText = text.replace(/<[^>]+>/g, "").trim();
  const safeHref = normalizeProfileUrl(href);
  if (!safeHref) return ` ${cleanText} `;
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
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();

  return cleaned.slice(0, 10000);
}
