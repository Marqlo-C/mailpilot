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

/** Ace / exit: scrollIntoView only when the line is outside the canvas scrollport. */
export function ensureAnchorInCanvasView(el: HTMLElement) {
  const parent = nearestScrollParent(el);
  if (!parent) return;
  const editable = editableMeasureEl(el);
  const rect = editable.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();
  const offscreen =
    rect.bottom < parentRect.top ||
    rect.top > parentRect.bottom ||
    rect.right < parentRect.left ||
    rect.left > parentRect.right;
  if (!offscreen) return;
  editable.scrollIntoView({ block: "nearest", inline: "nearest" });
}
