/**
 * Brand selection chrome — teal fill + tab-rail active-edge glow.
 * Glow token: CSS `--brand-selection-glow` (globals.css), twin of `--brand`.
 */

import { cn } from "@/lib/utils";

/** Soft teal bloom on the selected tab-rail / nav edge mark. */
export const BRAND_SELECTION_GLOW_CLASSNAME =
  "shadow-[var(--brand-selection-glow)]";

/** Solid teal + glow — sidebar / tab-rail vertical edge indicator. */
export const BRAND_SELECTION_EDGE_CLASSNAME = cn(
  "bg-brand",
  BRAND_SELECTION_GLOW_CLASSNAME
);

/**
 * `::before` active edge on tab-rail triggers (light + dark rails).
 * Geometry matches the sidebar nav mark; color/glow via brand tokens.
 */
export const BRAND_SELECTION_EDGE_BEFORE_CLASSNAME = cn(
  "data-[state=active]:before:pointer-events-none",
  "data-[state=active]:before:absolute",
  "data-[state=active]:before:-right-2",
  "data-[state=active]:before:bottom-1",
  "data-[state=active]:before:top-1",
  "data-[state=active]:before:w-[3px]",
  "data-[state=active]:before:rounded-r-full",
  "data-[state=active]:before:bg-brand",
  "data-[state=active]:before:shadow-[var(--brand-selection-glow)]",
  "data-[state=active]:before:content-['']"
);

/**
 * Pressed/selected icon toggle in draft toolbars (show summary, attach resume).
 * Same surface as outline hover (`bg-accent`); on-state is brand label + glow.
 */
export const BRAND_SELECTION_TOGGLE_ACTIVE_CLASSNAME = cn(
  "border-input bg-accent text-brand",
  "hover:border-input hover:bg-accent hover:text-brand",
  BRAND_SELECTION_GLOW_CLASSNAME
);
