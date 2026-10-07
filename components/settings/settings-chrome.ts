/**
 * Shared Settings surface chrome — matches Job Radar / Subscriptions
 * toolbar cards (translucent card, soft border, blur).
 */
export const SETTINGS_CARD_CLASSNAME =
  "border-border/50 bg-card/80 shadow-md backdrop-blur-sm transition-shadow hover:shadow-md";

/** Nested control rows inside settings cards. */
export const SETTINGS_ROW_CLASSNAME =
  "rounded-lg border border-border/50 bg-card/70 p-3";

/** Native selects inside settings cards (bg-card, not global background). */
export const SETTINGS_SELECT_CLASSNAME =
  "h-9 cursor-pointer rounded-md border border-border/50 bg-card px-3 text-sm text-foreground shadow-sm outline-none transition-colors hover:bg-card focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
