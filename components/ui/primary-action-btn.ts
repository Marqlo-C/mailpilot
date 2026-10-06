/**
 * Shared primary CTA treatment (Subscriptions Unsubscribe, Create Snapshot,
 * and other filled primary actions). Dark shell + mint text.
 * Keep as the single source of truth — flyout chips reuse the same shell tone.
 */

/** Dark primary shell — filled CTAs + flyout text/hover. */
const PRIMARY_ACTION_TONE = {
  shellBorder: "border-[#181e26]",
  shellBg: "bg-[#181e26]/85",
  shellHoverBg: "hover:bg-[#181e26]",
  label: "text-[#e4f7f3]",
  labelHover: "hover:text-[#e4f7f3]",
  /**
   * Flyout chips on the dark sidebar shell — mint label from the
   * filled primary (readable on `--sidebar`).
   */
  flyoutText: "text-[#e4f7f3]",
  flyoutHoverBg: "hover:bg-white/10",
  flyoutCountBg: "bg-[#e4f7f3]/15",
  flyoutCountActive:
    "group-data-[state=active]:bg-[#e4f7f3]/15 group-data-[state=active]:text-[#e4f7f3]",
} as const;
const PRIMARY_FILLED_LAYOUT =
  "inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50";

const FLYOUT_TEXT_LAYOUT =
  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50";

export const PRIMARY_ACTION_BTN_CLASSNAME = [
  PRIMARY_FILLED_LAYOUT,
  PRIMARY_ACTION_TONE.shellBorder,
  PRIMARY_ACTION_TONE.shellBg,
  PRIMARY_ACTION_TONE.label,
  PRIMARY_ACTION_TONE.shellHoverBg,
  PRIMARY_ACTION_TONE.labelHover,
].join(" ");

/** Mint text chip for bulk flyout — linked to {@link PRIMARY_ACTION_BTN_CLASSNAME}. */
export const PRIMARY_ACTION_FLYOUT_BTN_CLASSNAME = [
  FLYOUT_TEXT_LAYOUT,
  PRIMARY_ACTION_TONE.flyoutText,
  PRIMARY_ACTION_TONE.flyoutHoverBg,
].join(" ");

/** Count pill tint matching {@link PRIMARY_ACTION_FLYOUT_BTN_CLASSNAME}. */
export const PRIMARY_ACTION_FLYOUT_COUNT_CLASSNAME = [
  PRIMARY_ACTION_TONE.flyoutCountBg,
  PRIMARY_ACTION_TONE.flyoutText,
  PRIMARY_ACTION_TONE.flyoutCountActive,
].join(" ");

/** Soft lavender fill — selected/highlighted row CTAs. */
export const PRIMARY_ACTION_BTN_MUTED_CLASSNAME =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-[#E7E7F7] bg-[#E7E7F7] px-3 py-1.5 text-xs font-medium text-muted-foreground pointer-events-none";

/** Destructive filled tone — Delete Emails / Delete Record. */
const PRIMARY_DESTRUCTIVE_ACTION_TONE = {
  border: "border-[#c21f10]",
  bg: "bg-[#c21f10]",
  label: "text-white",
  hoverBorder: "hover:border-[#a81a0d]",
  hoverBg: "hover:bg-[#a81a0d]",
  hoverLabel: "hover:text-white",
  darkBorder: "dark:border-[#fb6230]",
  darkBg: "dark:bg-[#fb6230]",
  darkLabel: "dark:text-orange-950",
  darkHoverBorder: "dark:hover:border-[#fb4e1c]",
  darkHoverBg: "dark:hover:bg-[#fb4e1c]",
  darkHoverLabel: "dark:hover:text-orange-950",
} as const;

/**
 * Filled primary CTA for destructive confirms (Delete Emails, Delete Record).
 * Same shape weight as PRIMARY_ACTION_BTN; solid hover-weight fill, slightly
 * redder than high-clutter orange (#c2410c → #c21f10).
 */
export const PRIMARY_DESTRUCTIVE_ACTION_BTN_CLASSNAME = [
  PRIMARY_FILLED_LAYOUT,
  PRIMARY_DESTRUCTIVE_ACTION_TONE.border,
  PRIMARY_DESTRUCTIVE_ACTION_TONE.bg,
  PRIMARY_DESTRUCTIVE_ACTION_TONE.label,
  PRIMARY_DESTRUCTIVE_ACTION_TONE.hoverBorder,
  PRIMARY_DESTRUCTIVE_ACTION_TONE.hoverBg,
  PRIMARY_DESTRUCTIVE_ACTION_TONE.hoverLabel,
  PRIMARY_DESTRUCTIVE_ACTION_TONE.darkBorder,
  PRIMARY_DESTRUCTIVE_ACTION_TONE.darkBg,
  PRIMARY_DESTRUCTIVE_ACTION_TONE.darkLabel,
  PRIMARY_DESTRUCTIVE_ACTION_TONE.darkHoverBorder,
  PRIMARY_DESTRUCTIVE_ACTION_TONE.darkHoverBg,
  PRIMARY_DESTRUCTIVE_ACTION_TONE.darkHoverLabel,
].join(" ");
