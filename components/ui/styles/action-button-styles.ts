/**
 * ============================================================================
 * BOXY ACTION BUTTON STYLES
 *
 * Reusable button styles matching the clean, boxy geometry of the Sync Inbox
 * trigger and the height of the segmented dark/light tab rails.
 * ============================================================================
 */

import { PRIMARY_ACTION_SURFACE_CLASSNAME } from "@/components/ui/styles/primary-action-btn";
import { cn } from "@/lib/utils";

/** Base geometry matching the tab rail height and standard telemetry & sync icons. */
export const BOXY_ACTION_BTN_BASE =
  "inline-flex items-center justify-center h-8 px-3.5 text-xs font-medium rounded-lg border gap-2 shadow-md transition-colors shrink-0 cursor-pointer disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-3.5 [&_svg]:shrink-0";

/**
 * Secondary variant: clean border and card surface.
 * Dark variant uses the Disconnect primary surface: #181e26 shell, mint label.
 */
export const RAIL_ACTION_SURFACE_LIGHT =
  "border-input bg-card text-foreground hover:bg-accent hover:text-accent-foreground";

export const RAIL_ACTION_SURFACE_DARK = PRIMARY_ACTION_SURFACE_CLASSNAME;

export const BOXY_ACTION_BTN_SECONDARY = cn(
  BOXY_ACTION_BTN_BASE,
  RAIL_ACTION_SURFACE_LIGHT
);

export function railActionSecondaryClass(variant: "light" | "dark"): string {
  return cn(
    BOXY_ACTION_BTN_BASE,
    variant === "dark" ? RAIL_ACTION_SURFACE_DARK : RAIL_ACTION_SURFACE_LIGHT
  );
}

/**
 * Primary variant: Solid dark/brand shell fill for primary CTAs (e.g. Link Gmail Account).
 */
export const BOXY_ACTION_BTN_PRIMARY = cn(
  BOXY_ACTION_BTN_BASE,
  "border-[#181e26] bg-[#181e26]/90 text-[#e4f7f3] shadow-md hover:bg-[#181e26] hover:text-[#e4f7f3] dark:border-border/60 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90"
);

/**
 * Destructive variant: Solid filled red CTA for destructive actions (e.g. Log Out Session).
 */
export const BOXY_ACTION_BTN_DESTRUCTIVE = cn(
  BOXY_ACTION_BTN_BASE,
  "border-[#c21f10] bg-[#c21f10] text-white shadow-md hover:border-[#a81a0d] hover:bg-[#a81a0d] hover:text-white dark:border-[#fb6230] dark:bg-[#fb6230] dark:text-orange-950 dark:hover:border-[#fb4e1c] dark:hover:bg-[#fb4e1c] dark:hover:text-orange-950"
);

