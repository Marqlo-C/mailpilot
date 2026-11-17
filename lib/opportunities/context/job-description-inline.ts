/**
 * Inline markdown tokenization for job-description modal text.
 * Supports bold, italic, and safe http(s) links — no nested emphasis.
 */

export type JobDescriptionInlinePart =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "link"; href: string; value: string };

const SAFE_URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
const BOLD_RE = /\*\*([^*]+)\*\*/;
const ITALIC_RE = /(?<!\*)\*([^*]+)\*(?!\*)/;

type MatchKind = "bold" | "italic" | "link";

/**
 * Splits a text run into plain, bold, italic, and safe http(s) link segments.
 *
 * @param text - Scrubbed plain/markdown inline content (no HTML).
 */
export function splitJobDescriptionInline(
  text: string
): JobDescriptionInlinePart[] {
  if (!text) return [];

  const parts: JobDescriptionInlinePart[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    const bold = BOLD_RE.exec(remaining);
    const italic = ITALIC_RE.exec(remaining);
    SAFE_URL_RE.lastIndex = 0;
    const link = SAFE_URL_RE.exec(remaining);

    type Cand = { kind: MatchKind; index: number; length: number; value: string; href?: string };
    const cands: Cand[] = [];
    if (bold && bold.index !== undefined) {
      cands.push({ kind: "bold", index: bold.index, length: bold[0].length, value: bold[1] });
    }
    if (italic && italic.index !== undefined) {
      cands.push({ kind: "italic", index: italic.index, length: italic[0].length, value: italic[1] });
    }
    if (link && link.index !== undefined) {
      const href = link[0].replace(/[.,;:!?)]+$/, "");
      if (/^https?:\/\//i.test(href)) {
        cands.push({ kind: "link", index: link.index, length: href.length, value: href, href });
      }
    }

    if (cands.length === 0) {
      parts.push({ type: "text", value: remaining });
      break;
    }

    cands.sort((a, b) => a.index - b.index || b.length - a.length);
    const next = cands[0];
    if (next.index > 0) {
      parts.push({ type: "text", value: remaining.slice(0, next.index) });
    }
    if (next.kind === "link" && next.href) {
      parts.push({ type: "link", href: next.href, value: next.value });
    } else if (next.kind === "bold") {
      parts.push({ type: "bold", value: next.value });
    } else {
      parts.push({ type: "italic", value: next.value });
    }
    remaining = remaining.slice(next.index + next.length);
  }

  return parts.length > 0 ? parts : [{ type: "text", value: text }];
}
