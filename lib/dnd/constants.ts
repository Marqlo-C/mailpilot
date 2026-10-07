/** Hold duration to enter multi-select. */
export const DND_SELECT_LONG_PRESS_MS = 280;

/** Hold duration to arm drag while already in multi-select (longer than select). */
export const DND_DRAG_LONG_PRESS_MS = 400;

/** Pointer travel that cancels a pending long-press (px). */
export const DND_MOVE_CANCEL_PX = 10;

/**
 * How far into a frozen card (from its top) counts as “past” it for list
 * reorder. Small = snappy border cross on Subscriptions-style rows.
 */
export const DND_REORDER_EDGE_PX = 6;

/** Edge band width for cross-page flip while dragging (px). */
export const DND_PAGE_EDGE_PX = 56;

/** Hover time on a page edge before flipping (ms). */
export const DND_PAGE_FLIP_DELAY_MS = 380;

/** Viewport top/bottom band that triggers auto-scroll while dragging (px). */
export const DND_AUTO_SCROLL_EDGE_PX = 56;

/** Max vertical auto-scroll speed while dragging (px per animation frame). */
export const DND_AUTO_SCROLL_MAX_PX = 40;

/**
 * Left flip threshold: sidebar width (via --app-sidebar-width) plus the
 * edge band, so you only need to reach the sidebar — not the viewport edge.
 */
export function getPageFlipLeftEdgePx(): number {
  if (typeof document === "undefined") return DND_PAGE_EDGE_PX;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--app-sidebar-width")
    .trim();
  const sidebar = Number.parseFloat(raw);
  const sidebarPx = Number.isFinite(sidebar) ? sidebar : 0;
  return sidebarPx + DND_PAGE_EDGE_PX;
}
