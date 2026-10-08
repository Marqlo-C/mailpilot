/** Hold duration to enter multi-select. */
export const DND_SELECT_LONG_PRESS_MS = 280;

/** Hold duration to arm drag while already in multi-select (longer than select). */
export const DND_DRAG_LONG_PRESS_MS = 350;

/** Pointer travel that cancels a pending long-press (px). */
export const DND_MOVE_CANCEL_PX = 10;

/**
 * How far into a frozen card (from its top) counts as “past” it for list
 * reorder. Small = snappy border cross on Subscriptions-style rows.
 */
export const DND_REORDER_EDGE_PX = 6;

/**
 * Horizontal slot that holds each page-flip button (px).
 * The button is centered in this slot; flips only hit the button, not the slot.
 */
export const DND_PAGE_EDGE_PX = 56;

/** Mobile top-bar height matching AppShell `h-[4.25rem]`. Desktop has no top bar. */
const PAGE_FLIP_TOP_REM = 4.25;
/** Page-flip button size matching `size-7`. */
const PAGE_FLIP_BUTTON_REM = 1.75;
/** Extra px around the button so the pointer can land on it. */
const PAGE_FLIP_HIT_PAD_PX = 8;

/** Hover time on a page edge before flipping (ms). */
export const DND_PAGE_FLIP_DELAY_MS = 380;

/** Viewport top/bottom band that triggers auto-scroll while dragging (px). */
export const DND_AUTO_SCROLL_EDGE_PX = 56;

/** Max vertical auto-scroll speed while dragging (px per animation frame). */
export const DND_AUTO_SCROLL_MAX_PX = 40;

/**
 * Vertical deadzone for the drag ghost: top/bottom bands of the grab bbox.
 * Free zone is the middle strip between these ratios (20% when 0.4 / 0.6).
 */
export const DND_DEADZONE_TOP_RATIO = 0.4;
export const DND_DEADZONE_BOTTOM_RATIO = 0.6;

/**
 * Per-frame lerp factor toward the deadzone target (≈60fps).
 * Higher = snappier; keep in ~0.12–0.20 for smooth follow.
 */
export const DND_LERP_ALPHA = 0.16;

/**
 * Extra px between the pointer and the ghost’s top-left lerp target
 * (card sits slightly down/right of the cursor tip).
 */
export const DND_GHOST_POINTER_GRACE_PX = 12;

function cssLengthPx(prop: string, fallback: number): number {
  if (typeof document === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(prop)
    .trim();
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

function remToPx(rem: number): number {
  if (typeof document === "undefined") return rem * 16;
  const font = Number.parseFloat(
    getComputedStyle(document.documentElement).fontSize
  );
  return rem * (Number.isFinite(font) ? font : 16);
}

/**
 * Page flip only when the pointer is on a flip button (centered in the
 * content well), not anywhere along the side band.
 */
export function pageFlipDirFromPointer(
  clientX: number,
  clientY: number,
  page: number,
  totalPages: number
): -1 | 1 | null {
  if (typeof window === "undefined" || totalPages <= 1) return null;

  const desktop = window.matchMedia("(min-width: 768px)").matches;
  const wellTop = desktop ? 0 : remToPx(PAGE_FLIP_TOP_REM);
  const wellBottom =
    window.innerHeight - cssLengthPx("--app-mobile-bottom-inset", 0);
  const centerY = (wellTop + wellBottom) / 2;
  const half = remToPx(PAGE_FLIP_BUTTON_REM) / 2 + PAGE_FLIP_HIT_PAD_PX;
  if (clientY < centerY - half || clientY > centerY + half) return null;

  const sidebar = cssLengthPx("--app-sidebar-width", 0);
  if (page > 1) {
    const centerX = sidebar + DND_PAGE_EDGE_PX / 2;
    if (clientX >= centerX - half && clientX <= centerX + half) return -1;
  }
  if (page < totalPages) {
    const centerX = window.innerWidth - DND_PAGE_EDGE_PX / 2;
    if (clientX >= centerX - half && clientX <= centerX + half) return 1;
  }
  return null;
}
