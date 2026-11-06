/**
 * ============================================================================
 * HTML TO STRUCTURED MARKDOWN CONVERTER
 * 
 * Deterministic, zero-token HTML-to-Markdown normalizer.
 * Preserves structural document hierarchy (headings, bullet lists, paragraph breaks)
 * from scraped HTML job postings without third-party DOM dependencies.
 * ============================================================================
 */

/**
 * Common HTML entity replacements for zero-token decoding.
 */
const HTML_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&rsquo;": "’",
  "&lsquo;": "‘",
  "&rdquo;": "”",
  "&ldquo;": "“",
  "&ndash;": "–",
  "&mdash;": "—",
  "&bull;": "•",
  "&middot;": "·",
  "&#x27;": "'",
  "&#x2F;": "/",
  "&#47;": "/",
};

const ENTITY_REGEX = /&(?:[a-z]+|#x[0-9a-f]+|#[0-9]+);/gi;

export function decodeHtmlEntities(text: string): string {
  if (!text || !text.includes("&")) return text;
  let decoded = text;
  // Handle double-encoded entities (e.g. &amp;amp; -> &amp; -> &)
  for (let pass = 0; pass < 2; pass++) {
    if (!decoded.includes("&")) break;
    decoded = decoded.replace(ENTITY_REGEX, (match) => {
      const lower = match.toLowerCase();
      if (HTML_ENTITIES[lower]) return HTML_ENTITIES[lower];
      if (lower.startsWith("&#x")) {
        const hex = parseInt(lower.slice(3, -1), 16);
        return !isNaN(hex) ? String.fromCharCode(hex) : match;
      }
      if (lower.startsWith("&#")) {
        const dec = parseInt(lower.slice(2, -1), 10);
        return !isNaN(dec) ? String.fromCharCode(dec) : match;
      }
      return match;
    });
  }
  return decoded;
}

/**
 * Transforms raw HTML into clean, structured Markdown.
 * Preserves headings (###), bullet lists (-), and natural paragraph spacing (\n\n).
 */
export function htmlToStructuredMarkdown(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== "string") return "";

  let s = rawHtml;

  // 1. Strip script, style, svg, and HTML comments
  s = s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  s = s.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
  s = s.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");

  // 1b. Promote inline bullet characters into markdown list items
  s = s.replace(/\s*[•·⁃]\s*/g, "\n- ");

  // 1c. Promote common inline section headers into markdown headings (### Header)
  const SECTION_HEADER_REGEX =
    /(?:^|\n|[.!?]\s+)(What You[’']ll Do|What You Will Do|What We[’']re Looking For|What We Are Looking For|What You Bring|What You[’']ll Bring|Who You Are|Why Join\s+[A-Za-z0-9&.,' -]+?|Who We Are|About Us|About the (?:Role|Position|Job|Company)|Key Responsibilities|Core Responsibilities|Responsibilities|Basic Qualifications|Preferred Qualifications|Minimum Qualifications|Qualifications|Requirements|Benefits|Perks & Benefits|Compensation|Pay Range(?::\s*[\d.-]+)?|Salary Range|Equal Opportunity Employer)(?::|\s+(?=[A-Z])|\n|$)/gi;
  s = s.replace(SECTION_HEADER_REGEX, (match, header) => {
    const cleanHeader = header.trim();
    return `\n\n### ${cleanHeader}\n\n`;
  });

  // 2. Standardize explicit headings (h1 -> #, h2..h4 -> ###)
  s = s.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n\n# $1\n\n");
  s = s.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n\n## $1\n\n");
  s = s.replace(/<h[3-6][^>]*>([\s\S]*?)<\/h[3-6]>/gi, "\n\n### $1\n\n");

  // 3. Detect and promote pseudo-headings:
  // e.g. <p><b><strong>Role Overview</strong></b></p>
  // e.g. <p><strong>Qualifications:</strong></p>
  s = s.replace(
    /<p[^>]*>\s*(?:<b><strong>|<strong><b>|<b>|<strong>)([^<]{2,70}?)(?:<\/strong><\/b>|<\/b><\/strong>|<\/b>|<\/strong>)\s*(?:<\/p>|(?=<p>)|(?=<br\s*\/?>))/gi,
    "\n\n### $1\n\n"
  );

  // 4. Format list items: <li>Item</li> -> \n- Item
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1");
  s = s.replace(/<\/?(?:ul|ol)[^>]*>/gi, "\n");

  // 5. Convert line breaks and paragraph wrappers to newlines
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/?(?:p|div|section|article|blockquote)[^>]*>/gi, "\n\n");

  // 6. Convert inline styling to Markdown
  s = s.replace(/<(?:b|strong)[^>]*>([\s\S]*?)<\/(?:b|strong)>/gi, "**$1**");
  s = s.replace(/<(?:i|em)[^>]*>([\s\S]*?)<\/(?:i|em)>/gi, "*$1*");

  // 7. Strip all remaining HTML tags
  s = s.replace(/<[^>]+>/g, " ");

  // 8. Decode entities
  s = decodeHtmlEntities(s);

  // 9. Normalize whitespace while preserving markdown breaks
  s = s.replace(/[ \t]+/g, " ");
  s = s.replace(/[ \t]*\n[ \t]*/g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");

  // 10. Clean markdown list item indentation
  s = s.replace(/\n\s*-\s+/g, "\n- ");

  // 11. Normalize pseudo-bullet characters (e.g. •, ·, ⁃) to standard markdown "-"
  s = s.replace(/^[•·⁃]\s+/gm, "- ");

  return s.trim();
}
