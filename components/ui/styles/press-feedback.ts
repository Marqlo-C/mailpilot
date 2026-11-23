/**
 * Shared press / settle motion for interactive surfaces.
 * Prefer these over one-off `active:scale-*` so Operate chrome stays consistent.
 */

/** Dense chips, icon buttons, compact CTAs. */
export const PRESS_SCALE_CHIP =
  "motion-safe:active:scale-95 transition-transform duration-150 ease-apple-snappy";

/** Cards and table/settings rows — barely perceptible. */
export const PRESS_SCALE_ROW =
  "motion-safe:active:scale-[0.99] transition-transform duration-150 ease-apple-snappy";

/** Filled / outline action buttons (primary + secondary SSOT). */
export const PRESS_SCALE_BTN =
  "motion-safe:active:scale-[0.98] transition-[transform,colors] duration-150 ease-apple-snappy";
