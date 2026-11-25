/**
 * Plain ↔ email-safe HTML bridges for the TipTap composer and MIME multipart/alternative.
 * Keep marks limited to what recruiters' clients reliably render.
 */

import {
  isAllowedEmailHighlightColor,
  isAllowedEmailTextColor,
  normalizeHexColor,
} from "@/lib/opportunities/dispatch/email-body-colors";

const BLOCK_BREAK = /<\/(p|div|h[1-6]|li|tr)[^>]*>/gi;
const BR_TAG = /<br\s*\/?>/gi;
const TAG = /<[^>]+>/g;
const ENTITY: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

/** True when the string looks like HTML markup rather than plain prose. */
export function looksLikeEmailHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

/**
 * Strip tags to plain text suitable for text/plain MIME and Ace refine I/O.
 * Preserves paragraph breaks from block tags / `<br>`.
 */
export function htmlToPlainEmail(html: string): string {
  if (!html.trim()) return "";
  if (!looksLikeEmailHtml(html)) return html.replace(/\r\n/g, "\n");

  // Block closes become paragraph breaks; <br> stays a soft newline.
  let text = html
    .replace(BR_TAG, "\n")
    .replace(BLOCK_BREAK, "\n\n")
    .replace(TAG, "");

  for (const [entity, ch] of Object.entries(ENTITY)) {
    text = text.split(entity).join(ch);
  }

  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Wrap plain Ace/LLM output as simple paragraph HTML for TipTap.
 * Already-HTML input is sanitized instead of double-wrapped.
 */
export function plainToEmailHtml(plain: string): string {
  const trimmed = plain.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return "<p></p>";
  if (looksLikeEmailHtml(trimmed)) return sanitizeEmailHtml(trimmed);

  return trimmed
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n").map((line) => escapeHtml(line));
      return `<p>${lines.join("<br>")}</p>`;
    })
    .join("");
}

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "span",
  "mark",
]);

function extractStyleBlock(attrs: string): string {
  const match = /\bstyle\s*=\s*["']([^"']*)["']/i.exec(attrs);
  return match?.[1] ?? "";
}

function parseAlign(style: string, attrs: string): string | null {
  const fromStyle =
    /text-align\s*:\s*(left|center|right|justify)/i.exec(style)?.[1];
  const fromAttr =
    /\balign\s*=\s*["']?(left|center|right|justify)/i.exec(attrs)?.[1];
  const value = (fromStyle ?? fromAttr)?.toLowerCase();
  if (value === "left" || value === "center" || value === "right") return value;
  return null;
}

function parseAllowedColor(
  style: string,
  prop: "color" | "background-color"
): string | null {
  const re =
    prop === "color"
      ? /(?:^|;)\s*color\s*:\s*([^;]+)/i
      : /(?:^|;)\s*background-color\s*:\s*([^;]+)/i;
  const raw = re.exec(style)?.[1]?.trim();
  if (!raw) return null;
  const hex = normalizeHexColor(raw);
  if (!hex) return null;
  if (prop === "color" && isAllowedEmailTextColor(hex)) return hex;
  if (prop === "background-color" && isAllowedEmailHighlightColor(hex)) {
    return hex;
  }
  return null;
}

function buildSafeStyle(parts: string[]): string {
  if (parts.length === 0) return "";
  return ` style="${parts.join("; ")}"`;
}

/**
 * Allowlist sanitize for composer HTML. Drops scripts/styles/unknown tags;
 * keeps text-align and allowlisted color / highlight styles.
 */
export function sanitizeEmailHtml(html: string): string {
  if (!html.trim()) return "<p></p>";

  // Node-safe: no DOMParser. Tokenize tags and rebuild.
  const parts = html.split(/(<[^>]+>)/g);
  const out: string[] = [];
  const openStack: string[] = [];

  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("<")) {
      const close = /^<\/\s*([a-z0-9]+)\s*>$/i.exec(part);
      if (close) {
        const name = close[1].toLowerCase();
        if (!ALLOWED_TAGS.has(name) || name === "br") continue;
        const idx = openStack.lastIndexOf(name);
        if (idx === -1) continue;
        openStack.splice(idx);
        out.push(`</${name}>`);
        continue;
      }

      const selfBr = /^<\s*br\s*\/?\s*>$/i.exec(part);
      if (selfBr) {
        out.push("<br>");
        continue;
      }

      const open = /^<\s*([a-z0-9]+)(\s[^>]*)?>$/i.exec(part);
      if (!open) continue;
      const name = open[1].toLowerCase();
      if (!ALLOWED_TAGS.has(name) || name === "br") continue;

      const attrs = open[2] ?? "";
      const style = extractStyleBlock(attrs);
      const styleParts: string[] = [];

      if (name === "p" || name === "span") {
        const align = parseAlign(style, attrs);
        if (align) styleParts.push(`text-align: ${align}`);
      }

      if (name === "span" || name === "mark") {
        const color = parseAllowedColor(style, "color");
        if (color) styleParts.push(`color: ${color}`);
        const bg = parseAllowedColor(style, "background-color");
        if (bg) styleParts.push(`background-color: ${bg}`);
      }

      // TipTap highlight may also set data-color — keep only if allowlisted.
      let dataColor = "";
      if (name === "mark") {
        const dataMatch =
          /\bdata-color\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
        const normalized = dataMatch ? normalizeHexColor(dataMatch) : null;
        if (normalized && isAllowedEmailHighlightColor(normalized)) {
          dataColor = ` data-color="${normalized}"`;
          if (!styleParts.some((p) => p.startsWith("background-color:"))) {
            styleParts.push(`background-color: ${normalized}`);
          }
        }
      }

      out.push(`<${name}${dataColor}${buildSafeStyle(styleParts)}>`);
      openStack.push(name);
      continue;
    }

    out.push(escapeHtml(unescapeBasicEntities(part)));
  }

  while (openStack.length > 0) {
    out.push(`</${openStack.pop()}>`);
  }

  const result = out.join("").trim();
  return result.length > 0 ? result : "<p></p>";
}

function unescapeBasicEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'");
}

/**
 * Normalize composer body for MIME: returns both plain and sanitized HTML.
 * Plain input is wrapped; HTML input is stripped + sanitized.
 */
export function normalizeEmailBodyParts(body: string): {
  plain: string;
  html: string;
} {
  const html = looksLikeEmailHtml(body)
    ? sanitizeEmailHtml(body)
    : plainToEmailHtml(body);
  return {
    plain: htmlToPlainEmail(html),
    html,
  };
}
