import {
  DND_AUTO_SCROLL_EDGE_PX,
  DND_REORDER_EDGE_PX,
} from "@/lib/dnd/constants";

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

/** Top edge of the visible `[data-dnd-list]` (toolbar/chrome sits above this). */
export function getDndListTopPx(): number {
  if (typeof document === "undefined") return DND_AUTO_SCROLL_EDGE_PX;
  for (const node of document.querySelectorAll("[data-dnd-list]")) {
    const r = node.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return r.top;
  }
  return DND_AUTO_SCROLL_EDGE_PX;
}

/** Visible triage list bounds (`[data-dnd-list]`), or null if none. */
export function getDndListBounds(): {
  top: number;
  left: number;
  right: number;
  bottom: number;
} | null {
  if (typeof document === "undefined") return null;
  for (const node of document.querySelectorAll("[data-dnd-list]")) {
    const r = node.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      return {
        top: r.top,
        left: r.left,
        right: r.right,
        bottom: r.bottom,
      };
    }
  }
  return null;
}

/** True when the pointer is outside the visible triage list rect. */
export function isPointerOutsideDndList(
  clientX: number,
  clientY: number
): boolean {
  const bounds = getDndListBounds();
  if (!bounds) return true;
  return (
    clientX < bounds.left ||
    clientX > bounds.right ||
    clientY < bounds.top ||
    clientY > bounds.bottom
  );
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
 * Contiguous selected run in list order that contains `anchorId`
 * (falls back to the first moved id).
 */
export function contiguousMovedRunIds(
  fullIds: readonly string[],
  movedIds: readonly string[],
  anchorId?: string
): string[] {
  const movedSet = new Set(movedIds);
  const moving = fullIds.filter((id) => movedSet.has(id));
  if (moving.length === 0) return [];

  const anchor =
    anchorId && movedSet.has(anchorId) ? anchorId : moving[0]!;
  const anchorIdx = fullIds.indexOf(anchor);
  if (anchorIdx < 0) return [anchor];

  let runStart = anchorIdx;
  let runEnd = anchorIdx;
  while (runStart > 0 && movedSet.has(fullIds[runStart - 1]!)) runStart -= 1;
  while (
    runEnd < fullIds.length - 1 &&
    movedSet.has(fullIds[runEnd + 1]!)
  ) {
    runEnd += 1;
  }
  return fullIds.slice(runStart, runEnd + 1);
}

/**
 * Geometry for “snap when the pointer leaves the selected block”.
 * Without this, insert only changed at the next *non-selected* center — a gap
 * as tall as the whole multi-select (logs: +240px to move one slot with 3 selected).
 *
 * `originId` (grabbed card) sets homeIndex so live preview gathers at the grab
 * cluster — not at the first selected id in list order (which snapped bottom
 * grabs to the top: debug snap-top homeIndex=1 while origin was at y≈570).
 */
export function captureSelectionDragGeometry(
  fullIds: string[],
  movedIds: string[],
  rects: Map<string, FrozenItemRect>,
  originId?: string
): SelectionDragGeometry | null {
  const movedSet = new Set(movedIds);
  const moving = fullIds.filter((id) => movedSet.has(id));
  if (moving.length === 0) return null;

  const anchorId =
    originId && movedSet.has(originId) ? originId : moving[0]!;
  const anchorIdx = fullIds.indexOf(anchorId);
  if (anchorIdx < 0) return null;

  // Home slot = without-moved index of the grabbed card (not the first selected).
  let homeIndex = 0;
  for (let i = 0; i < anchorIdx; i++) {
    if (!movedSet.has(fullIds[i]!)) homeIndex += 1;
  }

  // Edge bounds from the contiguous run under the pointer only — scattered
  // off-screen selections must not create a viewport-tall “inside” dead zone.
  const runIds = contiguousMovedRunIds(fullIds, movedIds, anchorId);
  let selectionTop = Infinity;
  let selectionBottom = -Infinity;
  for (const id of runIds) {
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

/** Live viewport bounds for a set of card ids (visible node only). */
export function measureIdsViewportBounds(
  ids: readonly string[]
): { top: number; bottom: number } | null {
  if (typeof document === "undefined" || ids.length === 0) return null;
  let top = Infinity;
  let bottom = -Infinity;
  for (const id of ids) {
    const nodes = document.querySelectorAll(
      `[data-dnd-item-id="${CSS.escape(id)}"]`
    );
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      top = Math.min(top, rect.top);
      bottom = Math.max(bottom, rect.bottom);
      break;
    }
  }
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) return null;
  return { top, bottom };
}

/**
 * Without-row centers that are actually on-screen. Off-page ids have no DOM
 * node — skipping them without remapping left insertIndex stuck on the origin
 * page after an edge flip (logs: pageFlip→re-enter still insertIndex=3).
 */
function measureVisibleWithoutCenters(
  without: string[],
  rects: Map<string, FrozenItemRect>
): { index: number; cy: number; cx: number; id: string }[] {
  const live = captureReorderRects(without);
  const measured: { index: number; cy: number; cx: number; id: string }[] = [];
  for (let i = 0; i < without.length; i++) {
    const id = without[i]!;
    const rect = live.get(id) ?? rects.get(id);
    if (!rect) continue;
    if (typeof window !== "undefined" && rect.top >= window.innerHeight) {
      break;
    }
    // Ignore rows fully above the viewport (other pages / scrolled away).
    if (typeof window !== "undefined" && rect.bottom <= 0) continue;
    measured.push({
      index: i,
      id,
      cy: rect.top + rect.height / 2,
      cx: rect.left + rect.width / 2,
    });
  }
  return measured;
}

/**
 * Single-column list insert index.
 * - Over live moved-card body → keep prev insert (no ±1 force — that looped).
 * - Still at home inside frozen grab footprint → homeIndex (origin page only).
 * - Else midY among *visible* without-row centers (cross-page safe).
 */
function findListInsertIndexFromFrozenY(
  clientY: number,
  without: string[],
  rects: Map<string, FrozenItemRect>,
  selection: SelectionDragGeometry | null,
  movedIds: readonly string[],
  prevInsertIndex?: number | null
): number {
  if (without.length === 0) return 0;

  const measured = measureVisibleWithoutCenters(without, rects);
  const listTop = getDndListTopPx();

  // Top of the visible triage page → insert before the first on-screen row
  // (not full-list 0 — that pinned previews to page 1 after a flip).
  if (
    measured.length > 0 &&
    (clientY <= listTop + 4 || clientY < DND_AUTO_SCROLL_EDGE_PX)
  ) {
    return measured[0]!.index;
  }

  // Pointer still over the live selection block after preview reflow —
  // sticky only (never force sticky±1; that + live remasure oscillated).
  const liveSel = measureIdsViewportBounds(movedIds);
  if (
    liveSel &&
    clientY >= liveSel.top &&
    clientY <= liveSel.bottom &&
    prevInsertIndex != null
  ) {
    return prevInsertIndex;
  }

  // Initial hold inside the *frozen* grab footprint (origin page only).
  if (selection) {
    const home = Math.max(0, Math.min(selection.homeIndex, without.length));
    const stillAtHome =
      prevInsertIndex == null || prevInsertIndex === home;
    if (
      stillAtHome &&
      clientY >= selection.selectionTop &&
      clientY <= selection.selectionBottom
    ) {
      return home;
    }
  }

  if (measured.length === 0) {
    return prevInsertIndex ?? 0;
  }

  let insertIndex = measured[0]!.index;
  for (const row of measured) {
    if (clientY < row.cy) {
      insertIndex = row.index;
      break;
    }
    insertIndex = row.index + 1;
  }

  // Hysteresis: ignore single-slot flicker around the active boundary.
  if (
    prevInsertIndex != null &&
    insertIndex !== prevInsertIndex &&
    Math.abs(insertIndex - prevInsertIndex) === 1
  ) {
    const boundary = Math.min(insertIndex, prevInsertIndex);
    const row = measured.find((m) => m.index === boundary);
    if (row && Math.abs(clientY - row.cy) < 10) return prevInsertIndex;
  }

  return insertIndex;
}

/**
 * Multi-column grid (marker mode): nearest *visible* cell, then before/after
 * from pointer vs that cell’s center.
 */
function findGridInsertIndexFromFrozen(
  clientX: number,
  clientY: number,
  without: string[],
  rects: Map<string, FrozenItemRect>
): number {
  const measured = measureVisibleWithoutCenters(without, rects);
  if (measured.length === 0) return 0;

  let best = measured[0]!;
  let bestDist = Infinity;
  for (const row of measured) {
    const dist = (clientX - row.cx) ** 2 + (clientY - row.cy) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = row;
    }
  }
  const rect = rects.get(best.id) ?? captureReorderRects([best.id]).get(best.id);
  if (!rect) return best.index;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const past =
    clientY > cy + 4 ||
    (Math.abs(clientY - cy) <= rect.height / 2 && clientX > cx);
  return past ? best.index + 1 : best.index;
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
  selectionGeometry?: SelectionDragGeometry | null,
  prevInsertIndex?: number | null
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
    // Selection may be null after a page flip (moved cards not on this page).
    // Still target from visible without-rows so triage rearrange can resume.
    return findListInsertIndexFromFrozenY(
      clientY,
      without,
      frozenRects,
      selection,
      movedIds,
      prevInsertIndex
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
