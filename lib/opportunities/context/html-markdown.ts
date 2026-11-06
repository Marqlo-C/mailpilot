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

  // 2. Strip bold and italic tags inside explicit headings (h1..h6) so they are not contaminated with **
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (m, level, content) => {
    const hashes = "#".repeat(Math.min(Number(level), 3));
    const text = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return text ? `\n\n${hashes} ${text}\n\n` : "\n\n";
  });

  // 3. Move leading/trailing whitespace and <br> outside bold and italic elements
  // e.g. <b><br>\n\nAbout the role</b> -> <br>\n\n<b>About the role</b>
  // e.g. <b>\n\nCompany Culture</b> -> \n\n<b>Company Culture</b>
  s = s.replace(
    /<(b|strong)\b[^>]*>((?:<br\s*\/?>|\s)*)([\s\S]*?)((?:<br\s*\/?>|\s)*)<\/\1>/gi,
    (m, tag, pre, text, post) => {
      const trimmed = text.trim();
      if (!trimmed) return `${pre}${post}`;
      return `${pre}<${tag}>${trimmed}</${tag}>${post}`;
    }
  );

  // 4. Detect and promote pseudo-headings in p or div:
  // e.g. <p><b>Company Culture</b></p>
  // e.g. <div><b>About the role</b></div>
  // e.g. <p><strong>Qualifications</strong></p>
  s = s.replace(
    /<(?:p|div|section)[^>]*>\s*(?:<br\s*\/?>\s*)*<(?:b|strong)>([\s\S]*?)<\/(?:b|strong)>(?:\s*<br\s*\/?>)*\s*(?:<\/(?:p|div|section)>|(?=<p>)|(?=<div)|$)/gi,
    (m, content) => {
      const text = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (text && text.length >= 2 && text.length <= 80 && !text.startsWith("-")) {
        return `\n\n### ${text}\n\n`;
      }
      return m;
    }
  );

  // 5. Promote inline bullet characters into markdown list items
  s = s.replace(/\s*[•·⁃]\s*/g, "\n- ");

  // 6. Format list items: both closed <li>...</li> and unclosed <li>...<li>
  s = s.replace(/<li[^>]*>/gi, "\n- ");
  s = s.replace(/<\/li>/gi, "");
  s = s.replace(/<\/?(?:ul|ol)[^>]*>/gi, "\n");

  // 7. Convert line breaks and paragraph wrappers to newlines
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/?(?:p|div|section|article|blockquote)[^>]*>/gi, "\n\n");

  // 8. Convert inline styling to Markdown
  s = s.replace(/<(?:b|strong)[^>]*>([\s\S]*?)<\/(?:b|strong)>/gi, (m, inner) => {
    const trimmed = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return trimmed ? `**${trimmed}**` : "";
  });
  s = s.replace(/<(?:i|em)[^>]*>([\s\S]*?)<\/(?:i|em)>/gi, (m, inner) => {
    const trimmed = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return trimmed ? `*${trimmed}*` : "";
  });

  // 9. Strip all remaining HTML tags
  s = s.replace(/<[^>]+>/g, " ");

  // 10. Decode entities
  s = decodeHtmlEntities(s);

  // 11. Normalize whitespace while preserving markdown breaks
  s = s.replace(/[ \t]+/g, " ");
  s = s.replace(/[ \t]*\n[ \t]*/g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");

  // 12. Clean list item formatting
  s = s.replace(/\n[ \t]*-[ \t]*\n+/g, "\n- ");
  s = s.replace(/\n\s*-\s+/g, "\n- ");
  s = s.replace(/^[•·⁃]\s+/gm, "- ");

  // 13. Promote standalone section header lines that aren't already formatted
  const SECTION_HEADER_REGEX =
    /(?:^|\n)[ \t]*(What You[’']ll Do|What You Will Do|What We[’']re Looking For|What We Are Looking For|What You Bring|What You[’']ll Bring|Who You Are|Why Join\s+[A-Za-z0-9&.,' -]+?|Who We Are|About Us|About the (?:Role|Position|Job|Company)|Key Responsibilities|Core Responsibilities|Responsibilities|Basic Qualifications|Preferred Qualifications|Minimum Qualifications|Qualifications|Requirements|Benefits|Perks & Benefits|Compensation|Pay Range(?::\s*[\d.-]+)?|Salary Range|Equal Opportunity Employer):?[ \t]*(?=\n|$)/gi;
  s = s.replace(SECTION_HEADER_REGEX, (match, header) => {
    const cleanHeader = header.trim();
    return `\n\n### ${cleanHeader}\n\n`;
  });

  // 14. Clean orphaned markdown markers
  // Empty headings (e.g. ### or ## with no text)
  s = s.replace(/^#{1,6}\s*$/gm, "");
  // Lines that only contain asterisks (e.g. ** or ****)
  s = s.replace(/^[ \t]*\*{2,4}[ \t]*$/gm, "");
  // Fix lines ending with ** but missing opening **
  s = s.replace(/^([A-Za-z0-9&/,\x27 -]{2,80})\*\*[ \t]*$/gm, "**$1**");
  // Fix lines starting with ** but missing closing **
  s = s.replace(/^[ \t]*\*\*([A-Za-z0-9&/,\x27 -]{2,80})$/gm, "**$1**");

  return s.replace(/\n{3,}/g, "\n\n").trim();
}
