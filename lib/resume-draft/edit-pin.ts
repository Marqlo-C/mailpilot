/**
 * Light DOM helpers for resume line edit chrome (scroll-into-view only).
 * Zoom-around-cursor pin/settle was removed — caret placement is native.
 */

import { editableMeasureEl } from "@/lib/resume-draft/line-measure";

export function nearestScrollParent(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const { overflowX, overflowY } = getComputedStyle(node);
    const y =
      overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
    const x =
      overflowX === "auto" || overflowX === "scroll" || overflowX === "overlay";
    if (x || y) return node;
    node = node.parentElement;
  }
  return null;
}

/** Visual breathing room (px) when clamping an offscreen line back into view. */
const CANVAS_CLAMP_PAD_PX = 16;

/**
 * Ace / exit: clamp `el` back into the canvas scrollport using live post-transform
 * rects (native `scrollIntoView` miscalculates offsets under `transform: scale()`).
 */
export function ensureAnchorInCanvasView(el: HTMLElement) {
  const parent = nearestScrollParent(el);
  if (!parent) return;
  const editable = editableMeasureEl(el);
  const rect = editable.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();
  if (parentRect.width <= 0 || parentRect.height <= 0) return;

  const padY = Math.min(CANVAS_CLAMP_PAD_PX, parentRect.height / 4);
  const padX = Math.min(CANVAS_CLAMP_PAD_PX, parentRect.width / 4);

  let nextTop = parent.scrollTop;
  if (rect.top < parentRect.top + padY) {
    nextTop += rect.top - (parentRect.top + padY);
  } else if (rect.bottom > parentRect.bottom - padY) {
    nextTop += rect.bottom - (parentRect.bottom - padY);
  }

  let nextLeft = parent.scrollLeft;
  if (rect.left < parentRect.left + padX) {
    nextLeft += rect.left - (parentRect.left + padX);
  } else if (rect.right > parentRect.right - padX) {
    nextLeft += rect.right - (parentRect.right - padX);
  }

  const maxTop = Math.max(0, parent.scrollHeight - parent.clientHeight);
  const maxLeft = Math.max(0, parent.scrollWidth - parent.clientWidth);
  const clampedTop = Math.min(maxTop, Math.max(0, nextTop));
  const clampedLeft = Math.min(maxLeft, Math.max(0, nextLeft));

  if (
    Math.abs(clampedTop - parent.scrollTop) < 0.5 &&
    Math.abs(clampedLeft - parent.scrollLeft) < 0.5
  ) {
    return;
  }

  parent.scrollTop = clampedTop;
  parent.scrollLeft = clampedLeft;
}
