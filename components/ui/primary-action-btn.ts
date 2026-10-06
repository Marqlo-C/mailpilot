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
  /** Text/hover for flyout chips (shell as ink, not fill). */
  flyoutText: "text-[#181e26]",
  flyoutHoverBg: "hover:bg-[#181e26]/10",
  /** Count pill tint matching flyout text. */
  flyoutCountBg: "bg-[#181e26]/15",
  flyoutCountActive:
    "group-data-[state=active]:bg-[#181e26]/15 group-data-[state=active]:text-[#181e26]",
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

/** Dark text chip for bulk flyout — linked to {@link PRIMARY_ACTION_BTN_CLASSNAME}. */
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

/** Light gray filled primary — selected/locked row CTAs (lighter kin of muted secondary). */
export const PRIMARY_ACTION_BTN_MUTED_CLASSNAME =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-[#b4b9bb] bg-[#b4b9bb] px-3 py-1.5 text-xs font-medium text-white pointer-events-none";

/**
 * Filled primary CTA for destructive confirms (Delete Emails, Delete Record).
 * Same shape weight as PRIMARY_ACTION_BTN; solid hover-weight fill, slightly
 * redder than high-clutter orange (#c2410c → #c21f10).
 */
export const PRIMARY_DESTRUCTIVE_ACTION_BTN_CLASSNAME =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-[#c21f10] bg-[#c21f10] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:border-[#a81a0d] hover:bg-[#a81a0d] hover:text-white disabled:pointer-events-none disabled:opacity-50 dark:border-[#fb6230] dark:bg-[#fb6230] dark:text-orange-950 dark:hover:border-[#fb4e1c] dark:hover:bg-[#fb4e1c] dark:hover:text-orange-950";
