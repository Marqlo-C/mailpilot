/**
 * Shared Settings surface chrome — matches Job Radar / Subscriptions
 * toolbar cards (translucent card, soft border, blur).
 */
export const SETTINGS_CARD_CLASSNAME =
  "border-border/50 bg-card/80 shadow-md backdrop-blur-sm transition-shadow hover:shadow-md";

/**
 * Soft teal for Level 1 section icons — `primary` token (same ink as toolbar links).
 */
export const SETTINGS_SECTION_ICON_CLASSNAME =
  "text-primary [&_svg]:!text-primary";

/** Nested control rows inside settings cards. */
export const SETTINGS_ROW_CLASSNAME =
  "rounded-lg border border-border/50 bg-card/70 p-3 transition-colors duration-150 ease-apple-snappy hover:bg-muted/20 motion-safe:active:bg-muted/35";

/**
 * @deprecated Prefer {@link AppMenuSelect} (`surface="light"`).
 * Kept for any leftover native `<select>` call sites.
 */
export const SETTINGS_SELECT_CLASSNAME =
  "h-9 cursor-pointer rounded-md border border-border/50 bg-card px-3 text-sm text-foreground shadow-sm outline-none transition-colors hover:bg-card focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export {
  BOXY_ACTION_BTN_BASE,
  BOXY_ACTION_BTN_SECONDARY,
  BOXY_ACTION_BTN_PRIMARY,
  BOXY_ACTION_BTN_DESTRUCTIVE,
  RAIL_ACTION_SURFACE_LIGHT,
  RAIL_ACTION_SURFACE_DARK,
  railActionSecondaryClass,
} from "@/components/ui/styles/action-button-styles";

