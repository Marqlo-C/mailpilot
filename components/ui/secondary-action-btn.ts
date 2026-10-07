/**
 * Shared secondary CTA treatments (outline + tint).
 * Muted slider-teal outline: Create Snapshot and other non-destructive secondaries.
 * Red outline: row Delete Snapshot — same #c21f10 as Delete Emails fill.
 * Flyout Delete Snapshots uses BULK_ACTION_DESTRUCTIVE_* text chips.
 */

/** Secondary outline — muted teal label + border; full slider teal on hover. */
const SECONDARY_ACTION_TONE = {
  text: "text-[hsl(174_32%_42%)]",
  borderSoft: "border-[hsl(174_32%_42%)]",
  hoverText: "hover:text-[#1ab5af]",
  hoverBorder: "hover:border-[#1ab5af]",
  hoverBg: "hover:bg-[#1ab5af]/10",
  flyoutText: "text-[hsl(174_32%_48%)]",
  flyoutHoverBg: "hover:bg-[#1ab5af]/15",
  flyoutCountBg: "bg-[hsl(174_32%_42%/0.18)]",
  flyoutCountActive:
    "group-data-[state=active]:bg-[hsl(174_32%_42%/0.18)] group-data-[state=active]:text-[hsl(174_32%_48%)]",
} as const;

const FLYOUT_TEXT_LAYOUT =
  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50";

/** Destructive secondary tone — outline CTAs (row Delete Snapshot). */
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
  SECONDARY_ACTION_TONE.hoverText,
  SECONDARY_ACTION_TONE.hoverBorder,
  SECONDARY_ACTION_TONE.hoverBg,
].join(" ");

/** Text chip for bulk flyout — muted teal at rest; slider teal on hover. */
export const SECONDARY_ACTION_FLYOUT_BTN_CLASSNAME = [
  FLYOUT_TEXT_LAYOUT,
  SECONDARY_ACTION_TONE.flyoutText,
  SECONDARY_ACTION_TONE.flyoutHoverBg,
  "hover:text-[#1ab5af]",
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
  SECONDARY_DESTRUCTIVE_ACTION_TONE.hoverBorder,
  SECONDARY_DESTRUCTIVE_ACTION_TONE.hoverBg,
  SECONDARY_DESTRUCTIVE_ACTION_TONE.darkBorderSoft,
  SECONDARY_DESTRUCTIVE_ACTION_TONE.darkText,
  SECONDARY_DESTRUCTIVE_ACTION_TONE.darkHoverBorder,
  SECONDARY_DESTRUCTIVE_ACTION_TONE.darkHoverBg,
].join(" ");
