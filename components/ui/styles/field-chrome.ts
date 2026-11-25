/**
 * Search-bar field chrome — single source of truth for text / numeric / toolbar
 * inputs. Consumed by `TextField`, `NumericField`, and toolbar search.
 */

/** Outer plate: h-8, rounded-lg, soft border, focus-within lift. */
export const FIELD_SHELL_CLASSNAME =
  "flex h-8 w-full min-w-0 items-center rounded-lg border border-border/50 bg-card/75 text-foreground/75 shadow-sm transition-[box-shadow,border-color] focus-within:border-border focus-within:shadow";

/**
 * Tall composer plate — Ace email / resume viewport chrome.
 * Desktop split gives each pane its own plate with a thin bar between.
 */
// No overflow-hidden here — it clips box-shadow. Clip on an inner wrapper.
export const COMPOSER_SPLIT_PLATE_CLASSNAME =
  "flex min-h-0 w-full min-w-0 flex-1 rounded-lg border border-border/50 bg-card/75 text-foreground shadow-sm transition-[box-shadow,border-color]";

/**
 * Same lift as `FIELD_SHELL_*` (`focus-within:border-border focus-within:shadow`).
 */
export const COMPOSER_SPLIT_PLATE_FOCUS_CLASSNAME = "border-border shadow";

/**
 * Outer window inset (16px) — gutter around composer plates / dialog body.
 * Nested plate chrome steps down to `COMPOSER_NESTED_INSET_*`.
 */
export const COMPOSER_INSET_CLASSNAME = "p-4";
export const COMPOSER_INSET_X_CLASSNAME = "px-4";
export const COMPOSER_INSET_Y_CLASSNAME = "py-4";

/** Nested card inset (12px) — toolbars, fields, canvas inside a plate. */
export const COMPOSER_NESTED_INSET_CLASSNAME = "p-3";
export const COMPOSER_NESTED_INSET_X_CLASSNAME = "px-3";
export const COMPOSER_NESTED_INSET_Y_CLASSNAME = "py-3";

/**
 * Seam between composer regions (email ↔ resume handle, panes ↔ Ace bar).
 * Matches the existing resizable handle width (`w-2.5` = 10px).
 */
export const COMPOSER_PANE_GAP_CLASSNAME = "gap-2.5";
export const COMPOSER_PANE_SEPARATOR_CLASSNAME = "w-2.5";

/**
 * Gap between leading icon and text. Slightly under `pl-3` so Lucide’s
 * viewBox inset doesn’t make the post-icon space read wider than the left.
 * Without a leading icon: `gap-1.5`.
 */
export const FIELD_SHELL_GAP_WITH_ICON_CLASSNAME = "gap-2";
export const FIELD_SHELL_GAP_CLASSNAME = "gap-1.5";

/** Default horizontal padding when a trailing ghost action may appear. */
export const FIELD_SHELL_PAD_CLASSNAME = "pl-3 pr-1.5";

/** Compact padding for numeric / no-trailing shells. */
export const FIELD_SHELL_PAD_COMPACT_CLASSNAME = "pl-2 pr-2";

/** Transparent text control inside the shell. */
export const FIELD_INPUT_CLASSNAME =
  "h-full min-w-0 flex-1 border-0 bg-transparent py-0 text-xs text-foreground shadow-none outline-none placeholder:text-muted-foreground focus:outline-none focus:ring-0 disabled:cursor-not-allowed";

/** Leading Lucide (or similar) icon inside the shell. */
export const FIELD_LEADING_ICON_CLASSNAME =
  "pointer-events-none size-4 shrink-0 text-muted-foreground";

/**
 * Clear / mic / filter / save ghosts — circular muted fill with 44px hit padding.
 * Matches toolbar search trailing actions.
 */
export const FIELD_TRAILING_GHOST_CLASSNAME =
  "relative inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-muted/70 text-[hsl(var(--sidebar))] shadow-none transition-colors hover:bg-[hsl(var(--sidebar))] hover:text-[hsl(var(--sidebar-foreground))] before:absolute before:-inset-2 before:content-[''] disabled:pointer-events-none disabled:opacity-40";

/** Inline / card-embedded fields that intentionally drop the shell. */
export const FIELD_BARE_CLASSNAME =
  "h-auto w-full border-0 bg-transparent px-0 py-0 text-[11px] text-muted-foreground shadow-none outline-none placeholder:text-muted-foreground focus:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Dark sidebar-flyout shell — same plate as `appMenuClassNames.dark.trigger`
 * (`bg-[#282c30]` + `border-white/10`).
 */
export const FIELD_SIDEBAR_SHELL_CLASSNAME =
  "flex h-8 w-full min-w-0 items-center rounded-lg border border-white/10 bg-[#282c30] text-[#e4f7f3] shadow-none transition-colors focus-within:ring-1 focus-within:ring-white/20";

export const FIELD_SIDEBAR_INPUT_CLASSNAME =
  "h-full min-w-0 flex-1 border-0 bg-transparent py-0 text-xs text-[#e4f7f3] shadow-none outline-none placeholder:text-[#e4f7f3]/35 focus:outline-none focus:ring-0 disabled:cursor-not-allowed";

export const FIELD_SIDEBAR_LEADING_ICON_CLASSNAME =
  "pointer-events-none size-4 shrink-0 text-[#e4f7f3]/55";

export const FIELD_SIDEBAR_TRAILING_GHOST_CLASSNAME =
  "relative inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-white/10 text-[#e4f7f3]/80 shadow-none transition-colors hover:bg-[#353a40] hover:text-[#e4f7f3] before:absolute before:-inset-2 before:content-[''] disabled:pointer-events-none disabled:opacity-40";

/** @deprecated Prefer shell + input split; kept for any direct class consumers. */
export const FIELD_SIDEBAR_CLASSNAME = FIELD_SIDEBAR_SHELL_CLASSNAME;

/** Multiline shell: grow with content, keep the same plate language. */
export const FIELD_SHELL_MULTILINE_CLASSNAME =
  "flex min-h-20 w-full min-w-0 items-start rounded-lg border border-border/50 bg-card/75 px-3 py-2 text-foreground/75 shadow-sm transition-[box-shadow,border-color] focus-within:border-border focus-within:shadow";

export const FIELD_SIDEBAR_SHELL_MULTILINE_CLASSNAME =
  "flex min-h-20 w-full min-w-0 items-start rounded-lg border border-white/10 bg-[#282c30] px-3 py-2 text-[#e4f7f3] shadow-none transition-colors focus-within:ring-1 focus-within:ring-white/20";

export const FIELD_TEXTAREA_CLASSNAME =
  "min-h-[4.5rem] w-full min-w-0 flex-1 resize-y border-0 bg-transparent py-0 text-xs leading-relaxed text-foreground shadow-none outline-none placeholder:text-muted-foreground focus:outline-none focus:ring-0 disabled:cursor-not-allowed";
