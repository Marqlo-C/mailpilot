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
  "bg-[linear-gradient(135deg,hsla(238,72%,90%,0.96)_0%,hsla(238,68%,91%,0.95)_50%,hsla(174,45%,93%,0.9)_100%)]";

/**
 * Row stacking + soft radius — pair with overflow-visible so a border glow
 * can paint over neighbors when enabled.
 */
export const SELECT_HIGHLIGHT_ROW_LAYOUT_CLASSNAME =
  "relative z-10 rounded-sm";

/**
 * Outer border glow for densetabled rows. Toggle off per surface
 * (e.g. Subscriptions) via {@link selectHighlightRowClassName}.
 */
export const SELECT_HIGHLIGHT_BORDER_CLASSNAME =
  "shadow-[0_0_0_1px_hsla(238,90%,32%,0.26),0_0_16px_hsla(174,85%,42%,0.28)]";

/**
 * Dense-table row highlight. Border glow on by default; pass `{ border: false }`
 * to keep layout/fill pairing without the halo.
 */
export function selectHighlightRowClassName(
  options: { border?: boolean } = {}
): string {
  const { border = true } = options;
  return [
    SELECT_HIGHLIGHT_ROW_LAYOUT_CLASSNAME,
    border ? SELECT_HIGHLIGHT_BORDER_CLASSNAME : "",
  ]
    .filter(Boolean)
    .join(" ");
}
