/**
 * Shared editable-line measurement for float chrome placement.
 */

import {
  resolveEditableAnchorRect,
  resolveEditableMeasureTarget,
} from "@/lib/resume-draft/edit-presentation";

/**
 * Prefer the contenteditable itself (skills wrap a label + editable in one
 * hover target — chrome must sit above the editable text, not the label).
 */
export function editableMeasureEl(el: HTMLElement): HTMLElement {
  const inner = el.querySelector("[contenteditable='true']");
  const choice = resolveEditableMeasureTarget({
    hostIsContentEditable:
      el.isContentEditable || el.getAttribute("contenteditable") === "true",
    hasInnerContentEditable: inner instanceof HTMLElement,
  });
  return choice === "inner" && inner instanceof HTMLElement ? inner : el;
}

/**
 * Anchor box for the float:
 * - Unwrapped editable → full text box (center above it)
 * - Wrapped editable → first client rect only (center above line 1)
 */
export function editableAnchorRect(el: HTMLElement): DOMRect {
  const target = editableMeasureEl(el);
  const rects = Array.from(target.getClientRects()).map((r) => ({
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
  }));
  const bounding = target.getBoundingClientRect();
  const resolved = resolveEditableAnchorRect({
    clientRects: rects,
    boundingRect: {
      x: bounding.x,
      y: bounding.y,
      width: bounding.width,
      height: bounding.height,
    },
  });
  return new DOMRect(resolved.x, resolved.y, resolved.width, resolved.height);
}
