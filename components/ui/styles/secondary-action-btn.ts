/**
 * Shared secondary CTA treatments (outline + tint).
 * Rest: border + label = Unsubscribe shell `#181e26`, transparent fill.
 * Hover: fill with Unsubscribe mint label `#e4f7f3`; border + text unchanged.
 * Red outline: row Delete Snapshot — same #c21f10 as Delete Emails fill.
 * Flyout Delete Snapshots uses BULK_ACTION_DESTRUCTIVE_* text chips.
 *
 * Tailwind needs full class literals below for scanning (do not interpolate hex).
 */

/** Unsubscribe shell — secondary rest ink (border + label). */
export const SECONDARY_ACTION_INK = "#181e26";
/** Unsubscribe mint label — secondary hover fill. */
export const SECONDARY_ACTION_HOVER_FILL = "#e4f7f3";

const SECONDARY_ACTION_TONE = {
  text: "text-[#181e26]",
  borderSoft: "border-[#181e26]",
  hoverBg: "hover:bg-[#e4f7f3]",
  flyoutText: "text-[#181e26]/80",
  flyoutHoverBg: "hover:bg-[#e4f7f3]",
  flyoutCountBg: "bg-[#181e26]/12",
  flyoutCountActive:
    "group-data-[state=active]:bg-[#181e26]/12 group-data-[state=active]:text-[#181e26]",
} as const;

const FLYOUT_TEXT_LAYOUT =
  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50";

/** Destructive secondary tone — outline CTAs (row Delete Snapshot). */
const SECONDARY_DESTRUCTIVE_ACTION_TONE = {
  text: "text-[#c21f10]",
  borderSoft: "border-[#c21f10]",
  hoverText: "hover:text-[#C21E11]",
  hoverBorder: "hover:border-[#C21E11]",
  hoverBg: "hover:bg-[#C21E11]/15",
  darkText: "dark:text-[#fb6230]",
  darkBorderSoft: "dark:border-[#fb6230]",
  darkHoverText: "dark:hover:text-[#fb6230]",
  darkHoverBorder: "dark:hover:border-[#fb6230]",
  darkHoverBg: "dark:hover:bg-[#fb6230]/15",
} as const;

const SECONDARY_OUTLINE_LAYOUT =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border bg-transparent px-3 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50";

export const SECONDARY_ACTION_BTN_CLASSNAME = [
  SECONDARY_OUTLINE_LAYOUT,
  SECONDARY_ACTION_TONE.borderSoft,
  SECONDARY_ACTION_TONE.text,
  SECONDARY_ACTION_TONE.hoverBg,
].join(" ");

/** Text chip for bulk flyout — shell ink; mint fill on hover. */
export const SECONDARY_ACTION_FLYOUT_BTN_CLASSNAME = [
  FLYOUT_TEXT_LAYOUT,
  SECONDARY_ACTION_TONE.flyoutText,
  SECONDARY_ACTION_TONE.flyoutHoverBg,
].join(" ");

/** Count pill tint matching {@link SECONDARY_ACTION_FLYOUT_BTN_CLASSNAME}. */
export const SECONDARY_ACTION_FLYOUT_COUNT_CLASSNAME = [
  SECONDARY_ACTION_TONE.flyoutCountBg,
  SECONDARY_ACTION_TONE.flyoutText,
  SECONDARY_ACTION_TONE.flyoutCountActive,
].join(" ");

/** Gray outline secondary — selected/locked row CTAs. */
export const SECONDARY_ACTION_BTN_MUTED_CLASSNAME =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#899499] bg-transparent px-3 py-1.5 text-xs font-medium text-[#899499] pointer-events-none";

export const SECONDARY_DESTRUCTIVE_ACTION_BTN_CLASSNAME = [
  SECONDARY_OUTLINE_LAYOUT,
  SECONDARY_DESTRUCTIVE_ACTION_TONE.borderSoft,
  SECONDARY_DESTRUCTIVE_ACTION_TONE.text,
  SECONDARY_DESTRUCTIVE_ACTION_TONE.hoverText,
  SECONDARY_DESTRUCTIVE_ACTION_TONE.hoverBorder,
  SECONDARY_DESTRUCTIVE_ACTION_TONE.hoverBg,
  SECONDARY_DESTRUCTIVE_ACTION_TONE.darkBorderSoft,
  SECONDARY_DESTRUCTIVE_ACTION_TONE.darkText,
  SECONDARY_DESTRUCTIVE_ACTION_TONE.darkHoverText,
  SECONDARY_DESTRUCTIVE_ACTION_TONE.darkHoverBorder,
  SECONDARY_DESTRUCTIVE_ACTION_TONE.darkHoverBg,
].join(" ");
