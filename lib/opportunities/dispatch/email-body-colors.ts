/**
 * Allowlisted composer colors for TipTap + MIME sanitize.
 * Keep the set small — arbitrary CSS colors are stripped on send.
 */

export type EmailBodySwatch = {
  /** Stable id for UI keys. */
  id: string;
  label: string;
  /** Hex value applied to TipTap; null clears the mark. */
  value: string | null;
};

/** Foreground text colors (email-safe). */
export const EMAIL_TEXT_COLORS: readonly EmailBodySwatch[] = [
  { id: "default", label: "Default", value: null },
  { id: "gray", label: "Gray", value: "#4b5563" },
  { id: "red", label: "Red", value: "#b91c1c" },
  { id: "amber", label: "Amber", value: "#b45309" },
  { id: "green", label: "Green", value: "#15803d" },
  { id: "blue", label: "Blue", value: "#1d4ed8" },
] as const;

/** Highlight / background colors (email-safe; clients vary). */
export const EMAIL_HIGHLIGHT_COLORS: readonly EmailBodySwatch[] = [
  { id: "none", label: "None", value: null },
  { id: "yellow", label: "Yellow", value: "#fef08a" },
  { id: "green", label: "Green", value: "#bbf7d0" },
  { id: "blue", label: "Blue", value: "#bfdbfe" },
  { id: "pink", label: "Pink", value: "#fbcfe8" },
  { id: "orange", label: "Orange", value: "#fed7aa" },
] as const;

const TEXT_SET = new Set(
  EMAIL_TEXT_COLORS.map((s) => s.value?.toLowerCase()).filter(
    (v): v is string => Boolean(v)
  )
);

const HIGHLIGHT_SET = new Set(
  EMAIL_HIGHLIGHT_COLORS.map((s) => s.value?.toLowerCase()).filter(
    (v): v is string => Boolean(v)
  )
);

/** Normalize #RGB / #RRGGBB (and optional alpha) to lowercase #rrggbb when valid. */
export function normalizeHexColor(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  const short = /^#([0-9a-f]{3})$/i.exec(value);
  if (short) {
    const [r, g, b] = short[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  const full = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value);
  if (!full) return null;
  return `#${full[1]}`;
}

export function isAllowedEmailTextColor(raw: string): boolean {
  const hex = normalizeHexColor(raw);
  return hex !== null && TEXT_SET.has(hex);
}

export function isAllowedEmailHighlightColor(raw: string): boolean {
  const hex = normalizeHexColor(raw);
  return hex !== null && HIGHLIGHT_SET.has(hex);
}
