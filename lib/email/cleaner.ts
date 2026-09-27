/**
 * Fast pre-LLM email cleaning: strip HTML bloat, preserve apply links as markdown.
 */
export function cleanEmailPayload(rawHtmlOrText: string): string {
  let cleaned = rawHtmlOrText
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, "")
    .replace(/data:image\/[^;]+;base64,[^\s"']+/gi, "");

  // Convert HTML anchors to markdown so the LLM can extract apply URLs.
  cleaned = cleaned.replace(
    /<a\s+(?:[^>]*?\s+)?href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi,
    (_match, _quote: string, href: string, text: string) => {
      const cleanText = text.replace(/<[^>]+>/g, "").trim();
      const safeHref = href.trim();
      if (!safeHref) return ` ${cleanText} `;
      return cleanText ? ` [${cleanText}](${safeHref}) ` : ` ${safeHref} `;
    }
  );

  // Catch remaining <a href="..."> variants (attribute order differs).
  cleaned = cleaned.replace(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_match, href: string, text: string) => {
      const cleanText = text.replace(/<[^>]+>/g, "").trim();
      const safeHref = href.trim();
      if (!safeHref) return ` ${cleanText} `;
      return cleanText ? ` [${cleanText}](${safeHref}) ` : ` ${safeHref} `;
    }
  );

  cleaned = cleaned
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    // Drop pure tracking pixels, keep aggregator apply/view URLs
    .replace(/https?:\/\/\S*(?:\/pixel|track\/open)\S*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Expanded capacity so job digests keep more listing links.
  return cleaned.slice(0, 8000);
}
