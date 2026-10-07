import { DND_REORDER_EDGE_PX } from "@/lib/dnd/constants";

/** Targets that must not start long-press / paint-select / drag. */
const INTERACTIVE_SELECTOR = [
  "button",
  "a",
  "input",
  "select",
  "textarea",
  "label",
  "[role='button']",
  "[role='menuitem']",
  "[role='option']",
  "[data-dnd-ignore]",
].join(",");

/** Overlays where empty-space clicks must not exit multi-select. */
const OVERLAY_SELECTOR = [
  "[role='dialog']",
  "[role='menu']",
  "[role='listbox']",
  "[data-radix-popper-content-wrapper]",
  "[data-sonner-toaster]",
  "[data-bulk-actions]",
].join(",");

export type FrozenItemRect = {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

function asElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  // Clicks on text nodes still belong to their parent element.
  if (target instanceof Node) return target.parentElement;
  return null;
}

export function isInteractiveTarget(target: EventTarget | null): boolean {
  const el = asElement(target);
  if (!el) return false;
  return Boolean(el.closest(INTERACTIVE_SELECTOR));
}

/** True when the event is inside a dialog/menu/popover/flyout portal. */
export function isOverlayTarget(target: EventTarget | null): boolean {
  const el = asElement(target);
  if (!el) return false;
  return Boolean(el.closest(OVERLAY_SELECTOR));
}

export function findItemIdFromPoint(clientX: number, clientY: number): string | null {
  if (typeof document === "undefined") return null;
  const el = document.elementFromPoint(clientX, clientY);
  if (!(el instanceof Element)) return null;
  const item = el.closest("[data-dnd-item-id]");
  if (!(item instanceof HTMLElement)) return null;
  return item.dataset.dndItemId ?? null;
}

export function findDropZoneFromPoint(
  clientX: number,
  clientY: number
): string | null {
  if (typeof document === "undefined") return null;
  const el = document.elementFromPoint(clientX, clientY);
  if (!(el instanceof Element)) return null;
  const zone = el.closest("[data-dnd-drop-zone]");
  if (!(zone instanceof HTMLElement)) return null;
  return zone.dataset.dndDropZone ?? null;
}

export function findInsertIndexFromPoint(
  clientX: number,
  clientY: number,
  pageItemIds: string[]
): number | null {
  if (typeof document === "undefined" || pageItemIds.length === 0) return null;

  const el = document.elementFromPoint(clientX, clientY);
  if (!(el instanceof Element)) return null;
  const item = el.closest("[data-dnd-item-id]");
  if (!(item instanceof HTMLElement)) return null;

  const id = item.dataset.dndItemId;
  if (!id) return null;
  const indexInPage = pageItemIds.indexOf(id);
  if (indexInPage < 0) return null;

  const rect = item.getBoundingClientRect();
  const after = clientY > rect.top + rect.height / 2;
  return after ? indexInPage + 1 : indexInPage;
}

/** Snapshot card geometry before preview reflow (avoids hit-test feedback loops). */
export function captureReorderRects(
  ids: readonly string[]
): Map<string, FrozenItemRect> {
  const map = new Map<string, FrozenItemRect>();
  if (typeof document === "undefined") return map;

  for (const id of ids) {
    // Desktop + mobile duplicates share ids; skip display:none (0×0) nodes.
    const nodes = document.querySelectorAll(
      `[data-dnd-item-id="${CSS.escape(id)}"]`
    );
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      map.set(id, {
        id,
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      });
      break;
    }
  }
  return map;
}

/**
 * True when the visible `[data-dnd-list]` lays out items in multiple columns
 * (two+ cards share a row). Do not parse `grid-template-columns` tokens —
 * values like `repeat(1, minmax(0, 1fr))` falsely look multi-column.
 */
export function isMultiColumnDndList(): boolean {
  if (typeof document === "undefined") return false;

  let list: Element | null = null;
  for (const el of document.querySelectorAll("[data-dnd-list]")) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      list = el;
      break;
    }
  }
  if (!list) return false;

  const items = [...list.querySelectorAll("[data-dnd-item-id]")].filter(
    (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }
  );
  if (items.length < 2) return false;

  const top0 = items[0]!.getBoundingClientRect().top;
  return items.some(
    (el, i) =>
      i > 0 && Math.abs(el.getBoundingClientRect().top - top0) < 8
  );
}

/** Frozen selection footprint + home slot (without-moved index at drag start). */
export type SelectionDragGeometry = {
  homeIndex: number;
  selectionTop: number;
  selectionBottom: number;
};

/**
 * After the page scrolls, viewport-relative frozen rects must shift by the
 * opposite of the scroll delta (content moves up when scrollTop increases).
 */
export function offsetFrozenGeometryByScroll(
  rects: Map<string, FrozenItemRect> | null | undefined,
  selection: SelectionDragGeometry | null | undefined,
  scrollDeltaY: number
): void {
  if (!scrollDeltaY) return;
  const dy = -scrollDeltaY;
  if (rects) {
    for (const rect of rects.values()) {
      rect.top += dy;
      rect.bottom += dy;
    }
  }
  if (selection) {
    selection.selectionTop += dy;
    selection.selectionBottom += dy;
  }
}

/** Nearest vertical scrollport for the active card list, else the document. */
export function getDragScrollElement(): Element | null {
  if (typeof document === "undefined") return null;
  let el: Element | null = null;
  for (const node of document.querySelectorAll("[data-dnd-list]")) {
    const r = node.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      el = node;
      break;
    }
  }
  while (el && el !== document.documentElement) {
    if (el instanceof HTMLElement) {
      const overflowY = getComputedStyle(el).overflowY;
      if (
        (overflowY === "auto" ||
          overflowY === "scroll" ||
          overflowY === "overlay") &&
        el.scrollHeight > el.clientHeight + 1
      ) {
        return el;
      }
    }
    el = el.parentElement;
  }
  return document.scrollingElement ?? document.documentElement;
}

/**
 * Geometry for “snap when the pointer leaves the selected block”.
 * Without this, insert only changed at the next *non-selected* center — a gap
 * as tall as the whole multi-select (logs: +240px to move one slot with 3 selected).
 */
export function captureSelectionDragGeometry(
  fullIds: string[],
  movedIds: string[],
  rects: Map<string, FrozenItemRect>
): SelectionDragGeometry | null {
  const movedSet = new Set(movedIds);
  const moving = fullIds.filter((id) => movedSet.has(id));
  if (moving.length === 0) return null;

  let homeIndex = 0;
  const firstMovedIdx = fullIds.indexOf(moving[0]!);
  for (let i = 0; i < firstMovedIdx; i++) {
    if (!movedSet.has(fullIds[i]!)) homeIndex += 1;
  }

  let selectionTop = Infinity;
  let selectionBottom = -Infinity;
  for (const id of moving) {
    const rect = rects.get(id);
    if (!rect) continue;
    selectionTop = Math.min(selectionTop, rect.top);
    selectionBottom = Math.max(selectionBottom, rect.bottom);
  }
  if (!Number.isFinite(selectionTop) || !Number.isFinite(selectionBottom)) {
    return null;
  }

  return { homeIndex, selectionTop, selectionBottom };
}

/**
 * Single-column list insert index.
 * - Inside the frozen selection bounds → stay at homeIndex.
 * - Cross the selection edge → step at least one slot immediately, then
 *   advance per non-selected row center (no multi-row dead zone).
 */
function findListInsertIndexFromFrozenY(
  clientY: number,
  without: string[],
  rects: Map<string, FrozenItemRect>,
  selection: SelectionDragGeometry
): number {
  if (without.length === 0) return 0;

  const { homeIndex, selectionTop, selectionBottom } = selection;
  const home = Math.max(0, Math.min(homeIndex, without.length));

  // Still over the selected block → no move yet.
  if (clientY >= selectionTop && clientY <= selectionBottom) {
    return home;
  }

  // Left upward past the selection → at least one slot up, then by centers.
  if (clientY < selectionTop) {
    if (home <= 0) return 0;
    let insertIndex = 0;
    for (let i = 0; i < home; i++) {
      const rect = rects.get(without[i]!);
      if (!rect) continue;
      const cy = rect.top + rect.height / 2;
      if (clientY > cy) insertIndex = i + 1;
      else break;
    }
    return Math.min(insertIndex, home - 1);
  }

  // Left downward past the selection → at least one slot down, then by centers.
  if (home >= without.length) return without.length;
  let insertIndex = home;
  for (let i = home; i < without.length; i++) {
    const rect = rects.get(without[i]!);
    if (!rect) continue;
    const cy = rect.top + rect.height / 2;
    if (clientY > cy) insertIndex = i + 1;
    else break;
  }
  return Math.max(insertIndex, home + 1);
}

/**
 * Multi-column grid (marker mode): nearest frozen cell, then before/after
 * from pointer vs that cell’s center (stable — rects never move).
 */
function findGridInsertIndexFromFrozen(
  clientX: number,
  clientY: number,
  without: string[],
  rects: Map<string, FrozenItemRect>
): number {
  let bestId: string | null = null;
  let bestDist = Infinity;
  for (const id of without) {
    const rect = rects.get(id);
    if (!rect) continue;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dist = (clientX - cx) ** 2 + (clientY - cy) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      bestId = id;
    }
  }
  if (!bestId) return 0;
  const index = without.indexOf(bestId);
  if (index < 0) return 0;
  const rect = rects.get(bestId)!;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  // Reading-order “past” this cell: below center, or same band and to the right.
  const past =
    clientY > cy + 4 ||
    (Math.abs(clientY - cy) <= rect.height / 2 && clientX > cx);
  return past ? index + 1 : index;
}

/**
 * Insert index in without-moved space using **frozen** rects from drag start.
 * `listMode` uses selection-edge snapping; grid mode uses nearest-cell markers.
 */
export function findReorderInsertIndex(
  clientX: number,
  clientY: number,
  fullIds: string[],
  movedIds: string[],
  frozenRects: Map<string, FrozenItemRect> | null | undefined,
  listMode = true,
  selectionGeometry?: SelectionDragGeometry | null
): number | null {
  if (fullIds.length === 0) return null;

  const movedSet = new Set(movedIds);
  const without = fullIds.filter((id) => !movedSet.has(id));
  if (without.length === 0) return 0;

  if (!frozenRects || frozenRects.size === 0) return null;

  if (listMode) {
    const selection =
      selectionGeometry ??
      captureSelectionDragGeometry(fullIds, movedIds, frozenRects);
    if (!selection) return null;
    return findListInsertIndexFromFrozenY(
      clientY,
      without,
      frozenRects,
      selection
    );
  }
  return findGridInsertIndexFromFrozen(
    clientX,
    clientY,
    without,
    frozenRects
  );
}

/** Map without-moved insert index → id that should show an insert-before marker. */
export function insertBeforeIdForIndex(
  fullIds: string[],
  movedIds: string[],
  insertIndex: number | null
): { insertBeforeId: string | null; insertAfterLast: boolean } {
  if (insertIndex == null) {
    return { insertBeforeId: null, insertAfterLast: false };
  }
  const movedSet = new Set(movedIds);
  const without = fullIds.filter((id) => !movedSet.has(id));
  if (insertIndex >= without.length) {
    return { insertBeforeId: null, insertAfterLast: without.length > 0 };
  }
  return {
    insertBeforeId: without[insertIndex] ?? null,
    insertAfterLast: false,
  };
}
