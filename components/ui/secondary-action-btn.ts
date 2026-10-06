/**
 * Shared secondary CTA treatments (outline + tint).
 * Teal: Create Snapshot and other non-destructive secondaries.
 * Orange-red: Snapshot popup Delete — solid hover-weight tone,
 * slightly redder than high-clutter (#c2410c → #c21f10).
 * Keep as the single source of truth.
 */

/** Teal secondary tone — outline CTAs. */
const SECONDARY_ACTION_TONE = {
  text: "text-[#3c837b]",
  borderSoft: "border-[#3c837b]/40",
  hoverBorder: "hover:border-[#3c837b]",
  hoverBg: "hover:bg-[#3c837b]/10",
} as const;

/** Destructive secondary tone — outline CTAs. */
const SECONDARY_DESTRUCTIVE_ACTION_TONE = {
  text: "text-[#c21f10]",
  borderSoft: "border-[#c21f10]/45",
  hoverBorder: "hover:border-[#c21f10]",
  hoverBg: "hover:bg-[#c21f10]/12",
  darkText: "dark:text-[#fb6230]",
  darkBorderSoft: "dark:border-[#fb6230]/45",
  darkHoverBorder: "dark:hover:border-[#fb6230]",
  darkHoverBg: "dark:hover:bg-[#fb6230]/12",
} as const;

const SECONDARY_OUTLINE_LAYOUT =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50";

export const SECONDARY_ACTION_BTN_CLASSNAME = [
  SECONDARY_OUTLINE_LAYOUT,
  SECONDARY_ACTION_TONE.borderSoft,
  SECONDARY_ACTION_TONE.text,
  SECONDARY_ACTION_TONE.hoverBorder,
  SECONDARY_ACTION_TONE.hoverBg,
].join(" ");

/** Gray outline secondary — selected/locked row CTAs. */
export const SECONDARY_ACTION_BTN_MUTED_CLASSNAME =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#899499] bg-transparent px-3 py-1.5 text-xs font-medium text-[#899499] pointer-events-none";

export const SECONDARY_DESTRUCTIVE_ACTION_BTN_CLASSNAME = [
  SECONDARY_OUTLINE_LAYOUT,
  SECONDARY_DESTRUCTIVE_ACTION_TONE.borderSoft,
  SECONDARY_DESTRUCTIVE_ACTION_TONE.text,
  SECONDARY_DESTRUCTIVE_ACTION_TONE.hoverBorder,
  SECONDARY_DESTRUCTIVE_ACTION_TONE.hoverBg,
  SECONDARY_DESTRUCTIVE_ACTION_TONE.darkBorderSoft,
  SECONDARY_DESTRUCTIVE_ACTION_TONE.darkText,
  SECONDARY_DESTRUCTIVE_ACTION_TONE.darkHoverBorder,
  SECONDARY_DESTRUCTIVE_ACTION_TONE.darkHoverBg,
].join(" ");
