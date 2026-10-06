/**
 * Shared selected-card glow (Job Radar).
 * Blue edge + soft teal outer wash; no fill.
 */
export const SELECT_HIGHLIGHT_CLASSNAME =
  "border-[hsl(238_90%_28%)]/35 shadow-[0_0_0_1px_hsla(238,90%,28%,0.16),0_0_10px_hsla(238,90%,32%,0.12),0_0_26px_hsla(174,85%,42%,0.42)] ring-2 ring-[hsl(238_90%_32%)]/12";

/**
 * Soft fill from the same blue→teal glow palette (Subscriptions rows/cards).
 */
export const SELECT_HIGHLIGHT_FILL_CLASSNAME =
  "bg-[linear-gradient(135deg,hsla(238,55%,94%,0.95),hsla(174,45%,93%,0.9))]";

/**
 * Outer glow for densetabled rows — pair with overflow-visible + z-index so
 * the halo can paint over neighbors (overflow-hidden shells clip this).
 * Soft radius is subscription-row only (not Job Radar cards).
 */
export const SELECT_HIGHLIGHT_ROW_CLASSNAME =
  "relative z-10 rounded-sm shadow-[0_0_0_1px_hsla(238,90%,32%,0.35),0_0_18px_hsla(174,85%,42%,0.4)]";
