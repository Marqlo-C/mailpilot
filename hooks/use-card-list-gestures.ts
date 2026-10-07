"use client";

/**
 * Reusable card-list gestures (Subscriptions now; Job Radar later).
 *
 * Default interaction rules (timing in `lib/dnd/constants.ts`):
 * - Short hold → enter multi-select + check that card; keep holding & slide to paint-select.
 * - In multi-select: tap toggles; swipe paint adds or removes (mode from start card;
 *   sole checked card starts paint-add so it isn’t wiped).
 * - Longer hold on a **selected** card → drag all selected (list order).
 *   Unselected cards never start a drag. Empty-space / Escape / view changes
 *   exit multi-select; releasing a drag only ends DnD.
 * - Same-list reorder when `rules.canReorder` (e.g. Custom sort); edge hover flips page.
 *   Near the viewport top/bottom, the page auto-scrolls while the pointer stays there.
 *   While dragging, `drag.previewFullIds` is the live order for the list UI to render.
 * - Cross-list moves via `rules.allowedDropZones` even when reorder is locked
 *   (e.g. Active → Unsubscribed while sorted by clutter / newest).
 *
 * Jobs / kanban: reuse this hook; movement policy lives in
 * `lib/opportunities/movement-rules.ts` (shared by cards + DnD).
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  DND_AUTO_SCROLL_EDGE_PX,
  DND_AUTO_SCROLL_MAX_PX,
  DND_DRAG_LONG_PRESS_MS,
  DND_MOVE_CANCEL_PX,
  DND_PAGE_EDGE_PX,
  DND_PAGE_FLIP_DELAY_MS,
  DND_SELECT_LONG_PRESS_MS,
  getPageFlipLeftEdgePx,
} from "@/lib/dnd/constants";
import {
  captureReorderRects,
  captureSelectionDragGeometry,
  findDropZoneFromPoint,
  findItemIdFromPoint,
  findReorderInsertIndex,
  getDragScrollElement,
  isInteractiveTarget,
  isMultiColumnDndList,
  isOverlayTarget,
  offsetFrozenGeometryByScroll,
  type FrozenItemRect,
  type SelectionDragGeometry,
} from "@/lib/dnd/interactive";
import {
  captureDragGrabGeometry,
  type DragGrabGeometry,
} from "@/lib/dnd/drag-smooth";
import { previewReorderFullIds, reorderIds } from "@/lib/dnd/reorder";
import type { CardListGestureRules } from "@/lib/dnd/types";

export type { CardListGestureRules };
export type { DragGrabGeometry };

export type CardListDragState = {
  active: boolean;
  movedIds: string[];
  originId: string;
  /** Insert index in without-moved space; null when not aiming a list slot. */
  insertIndex: number | null;
  /**
   * Live full-list id order for same-tab rearrange preview (single-column lists).
   * Null for multi-column grids (use insert markers), drop zones, or locked reorder.
   */
  previewFullIds: string[] | null;
  /** False on multi-column grids — DOM live-reorder is unstable there. */
  livePreview: boolean;
  dropZone: string | null;
  pointerX: number;
  pointerY: number;
  /** Union bbox + grab offsets for ghost deadzone / lerp (fixed for the drag). */
  grab: DragGrabGeometry | null;
};

type UseCardListGesturesOptions = {
  /** Ids on the current page (visible slice). */
  pageItemIds: string[];
  /** Full ordered id list for the active filtered set. */
  fullItemIds: string[];
  selectedIds: string[];
  selectionMode: boolean;
  onEnterSelectionMode: (id: string) => void;
  onToggleSelect: (id: string) => void;
  /**
   * Swipe multi-select. `mode` is chosen from the card where the swipe
   * started: unselected → add, selected → remove.
   */
  onPaintSelect: (id: string, mode: "add" | "remove") => void;
  onClearSelection: () => void;
  rules: CardListGestureRules;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  /**
   * Called after a same-list drop. `nextFullIds` is the new filtered order.
   * Return false to reject (e.g. reorder not allowed).
   */
  onReorder: (nextFullIds: string[], movedIds: string[]) => void;
  /** Dropped onto a named zone (e.g. archive tab). */
  onDropZone?: (zoneId: string, movedIds: string[]) => void;
  /**
   * Second long-press when neither reorder nor any drop zone is available
   * (e.g. History with no outbound zones — currently unused for jobs).
   */
  onReorderBlocked?: () => void;
};

type Pending =
  | {
      kind: "longpress";
      pointerId: number;
      originId: string;
      x: number;
      y: number;
      timer: ReturnType<typeof setTimeout>;
    }
  | {
      kind: "paint";
      pointerId: number;
      visited: Set<string>;
      mode: "add" | "remove";
    }
  | {
      kind: "drag";
      pointerId: number;
      movedIds: string[];
      originId: string;
    };

export function useCardListGestures({
  pageItemIds,
  fullItemIds,
  selectedIds,
  selectionMode,
  onEnterSelectionMode,
  onToggleSelect,
  onPaintSelect,
  onClearSelection,
  rules,
  currentPage,
  totalPages,
  pageSize,
  onPageChange,
  onReorder,
  onDropZone,
  onReorderBlocked,
}: UseCardListGesturesOptions) {
  const [drag, setDrag] = useState<CardListDragState | null>(null);
  const dragRef = useRef<CardListDragState | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const pageFlipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageFlipDirRef = useRef<-1 | 1 | null>(null);
  const autoScrollRafRef = useRef<number | null>(null);
  const autoScrollSpeedRef = useRef(0);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  /** Ignore synthetic click that browsers fire after pointerup from a drag. */
  const suppressEmptySpaceUntilRef = useRef(0);
  /** Card geometry at drag start (or after page flip) — not updated by preview. */
  const frozenRectsRef = useRef<Map<string, FrozenItemRect> | null>(null);
  const selectionGeometryRef = useRef<SelectionDragGeometry | null>(null);
  const livePreviewRef = useRef(true);

  dragRef.current = drag;

  const selectedRef = useRef(selectedIds);
  const selectionModeRef = useRef(selectionMode);
  const pageIdsRef = useRef(pageItemIds);
  const fullIdsRef = useRef(fullItemIds);
  const rulesRef = useRef(rules);
  const pageMetaRef = useRef({ currentPage, totalPages, pageSize });

  selectedRef.current = selectedIds;
  selectionModeRef.current = selectionMode;
  pageIdsRef.current = pageItemIds;
  fullIdsRef.current = fullItemIds;
  rulesRef.current = rules;
  pageMetaRef.current = { currentPage, totalPages, pageSize };

  const clearPageFlip = useCallback(() => {
    if (pageFlipTimerRef.current) {
      clearTimeout(pageFlipTimerRef.current);
      pageFlipTimerRef.current = null;
    }
    pageFlipDirRef.current = null;
  }, []);

  const clearAutoScroll = useCallback(() => {
    if (autoScrollRafRef.current != null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
    autoScrollSpeedRef.current = 0;
  }, []);

  const clearPendingTimer = useCallback(() => {
    const pending = pendingRef.current;
    if (pending?.kind === "longpress") {
      clearTimeout(pending.timer);
    }
  }, []);

  const endDrag = useCallback(() => {
    clearPageFlip();
    clearAutoScroll();
    pendingRef.current = null;
    frozenRectsRef.current = null;
    selectionGeometryRef.current = null;
    setDrag(null);
    // pointerup is often followed by a click on the list shell — don't treat
    // that as an empty-space multi-select exit.
    suppressEmptySpaceUntilRef.current = Date.now() + 500;
  }, [clearAutoScroll, clearPageFlip]);

  /** Update reorder preview / drop-zone highlight from a pointer position. */
  const updateDragFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const pending = pendingRef.current;
      if (pending?.kind !== "drag") return;

      const dropZone = findDropZoneFromPoint(clientX, clientY);
      const allowed = rulesRef.current.allowedDropZones ?? [];
      const zone =
        dropZone && allowed.includes(dropZone) ? dropZone : null;

      let insertIndex: number | null = null;
      let previewFullIds: string[] | null = null;
      const livePreview = livePreviewRef.current;
      if (!zone && rulesRef.current.canReorder) {
        const prev = dragRef.current;
        const nextInsert = findReorderInsertIndex(
          clientX,
          clientY,
          fullIdsRef.current,
          pending.movedIds,
          frozenRectsRef.current,
          livePreview,
          selectionGeometryRef.current,
          prev?.insertIndex
        );
        insertIndex = nextInsert ?? prev?.insertIndex ?? null;
        previewFullIds = livePreview
          ? previewReorderFullIds(
              fullIdsRef.current,
              pending.movedIds,
              insertIndex
            )
          : null;
      }

      setDrag({
        active: true,
        movedIds: pending.movedIds,
        originId: pending.originId,
        insertIndex,
        previewFullIds,
        livePreview,
        dropZone: zone,
        pointerX: clientX,
        pointerY: clientY,
        grab: dragRef.current?.grab ?? null,
      });

      // Cross-page edge flip (same tab only; not while over a drop zone).
      if (!zone && rulesRef.current.canReorder) {
        const { currentPage: page, totalPages: pages } = pageMetaRef.current;
        let dir: -1 | 1 | null = null;
        const leftEdge = getPageFlipLeftEdgePx();
        if (clientX <= leftEdge && page > 1) dir = -1;
        else if (
          clientX >= window.innerWidth - DND_PAGE_EDGE_PX &&
          page < pages
        ) {
          dir = 1;
        }

        if (dir !== pageFlipDirRef.current) {
          clearPageFlip();
          pageFlipDirRef.current = dir;
          if (dir != null) {
            pageFlipTimerRef.current = setTimeout(() => {
              const meta = pageMetaRef.current;
              const next = meta.currentPage + (dir as -1 | 1);
              if (next >= 1 && next <= meta.totalPages) {
                onPageChange(next);
              }
              pageFlipTimerRef.current = null;
              pageFlipDirRef.current = null;
            }, DND_PAGE_FLIP_DELAY_MS);
          }
        }
      } else {
        clearPageFlip();
      }

      return zone;
    },
    [clearPageFlip, onPageChange]
  );

  const syncAutoScroll = useCallback(
    (clientY: number, overDropZone: boolean) => {
      let speed = 0;
      if (!overDropZone) {
        const edge = DND_AUTO_SCROLL_EDGE_PX;
        const viewH = window.innerHeight;
        if (clientY < edge) {
          const t = Math.min(1, (edge - clientY) / edge);
          speed = -DND_AUTO_SCROLL_MAX_PX * t * t;
        } else if (clientY > viewH - edge) {
          const t = Math.min(1, (clientY - (viewH - edge)) / edge);
          speed = DND_AUTO_SCROLL_MAX_PX * t * t;
        }
      }

      autoScrollSpeedRef.current = speed;
      if (speed === 0) {
        clearAutoScroll();
        return;
      }
      if (autoScrollRafRef.current != null) return;

      const tick = () => {
        autoScrollRafRef.current = null;
        const pending = pendingRef.current;
        const step = autoScrollSpeedRef.current;
        if (!step || pending?.kind !== "drag") {
          autoScrollSpeedRef.current = 0;
          return;
        }

        const scroller = getDragScrollElement();
        if (!scroller) {
          autoScrollSpeedRef.current = 0;
          return;
        }

        const before = scroller.scrollTop;
        const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        const next = Math.max(0, Math.min(max, before + step));
        const delta = next - before;
        if (delta !== 0) {
          scroller.scrollTop = next;
          offsetFrozenGeometryByScroll(
            frozenRectsRef.current,
            selectionGeometryRef.current,
            delta
          );
          const { x, y } = lastPointerRef.current;
          updateDragFromPointer(x, y);
        }

        const atTop = scroller.scrollTop <= 0;
        const atBottom = scroller.scrollTop >= max - 0.5;
        const stuck = (step < 0 && atTop) || (step > 0 && atBottom);
        if (stuck || autoScrollSpeedRef.current === 0) {
          if (stuck) autoScrollSpeedRef.current = 0;
          return;
        }
        autoScrollRafRef.current = requestAnimationFrame(tick);
      };

      autoScrollRafRef.current = requestAnimationFrame(tick);
    },
    [clearAutoScroll, updateDragFromPointer]
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Escape cancels an in-flight drag, then always leaves multi-select.
      if (pendingRef.current?.kind === "drag" || drag) {
        endDrag();
      }
      if (selectionModeRef.current) {
        onClearSelection();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drag, endDrag, onClearSelection]);

  useEffect(() => {
    return () => {
      clearPendingTimer();
      clearPageFlip();
      clearAutoScroll();
    };
  }, [clearPendingTimer, clearPageFlip, clearAutoScroll]);

  const startDrag = useCallback(
    (pointerId: number, originId: string, x: number, y: number) => {
      const selectedSet = new Set(selectedRef.current);
      // Only selected cards drag; block order follows the filtered list.
      if (!selectedSet.has(originId)) return;
      const movedIds = fullIdsRef.current.filter((id) => selectedSet.has(id));
      if (movedIds.length === 0) return;

      pendingRef.current = {
        kind: "drag",
        pointerId,
        movedIds,
        originId,
      };
      // Freeze geometry before any preview reflow. Multi-column grids skip
      // live DOM reorder (insert marker only) — it feedback-loops badly.
      frozenRectsRef.current = captureReorderRects(fullIdsRef.current);
      selectionGeometryRef.current = captureSelectionDragGeometry(
        fullIdsRef.current,
        movedIds,
        frozenRectsRef.current,
        originId
      );
      const grab = captureDragGrabGeometry(
        movedIds,
        x,
        y,
        frozenRectsRef.current,
        originId,
        fullIdsRef.current
      );
      const livePreview = !isMultiColumnDndList();
      livePreviewRef.current = livePreview;
      lastPointerRef.current = { x, y };
      const homeIndex = selectionGeometryRef.current?.homeIndex ?? null;
      setDrag({
        active: true,
        movedIds,
        originId,
        insertIndex: homeIndex,
        previewFullIds: null,
        livePreview,
        dropZone: null,
        pointerX: x,
        pointerY: y,
        grab,
      });
    },
    []
  );

  // Remeasure ONLY after a page-edge flip. Never remasure when drag starts
  // or while preview is live — that captured already-shifted DOM and caused
  // insertIndex thrashing on Subscriptions.
  const dragPageRef = useRef<number | null>(null);
  useEffect(() => {
    if (!drag?.active) {
      dragPageRef.current = null;
      return;
    }
    if (dragPageRef.current == null) {
      dragPageRef.current = currentPage;
      return;
    }
    if (dragPageRef.current === currentPage) return;
    dragPageRef.current = currentPage;
    const frame = window.requestAnimationFrame(() => {
      frozenRectsRef.current = captureReorderRects(fullIdsRef.current);
      const pending = pendingRef.current;
      if (pending?.kind === "drag") {
        selectionGeometryRef.current = captureSelectionDragGeometry(
          fullIdsRef.current,
          pending.movedIds,
          frozenRectsRef.current,
          pending.originId
        );
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentPage, drag?.active]);

  const onPointerDownItem = useCallback(
    (event: ReactPointerEvent, id: string) => {
      if (event.button !== 0) return;
      if (isInteractiveTarget(event.target)) return;

      clearPendingTimer();
      const armingDrag =
        selectionModeRef.current && selectedRef.current.length > 0;
      const holdMs = armingDrag
        ? DND_DRAG_LONG_PRESS_MS
        : DND_SELECT_LONG_PRESS_MS;
      const timer = setTimeout(() => {
        const pending = pendingRef.current;
        if (!pending || pending.kind !== "longpress") return;
        if (pending.originId !== id) return;

        // Enter / re-enter multi-select when not actively selecting anything.
        // Stay in a paint-add gesture so the user can keep holding and slide
        // to select more without lifting.
        if (
          !selectionModeRef.current ||
          selectedRef.current.length === 0
        ) {
          onEnterSelectionMode(id);
          pendingRef.current = {
            kind: "paint",
            pointerId: pending.pointerId,
            visited: new Set<string>([id]),
            mode: "add",
          };
          return;
        }

        // Longer hold → drag only from a selected card (moves entire selection).
        if (!selectedRef.current.includes(id)) {
          pendingRef.current = null;
          return;
        }

        const zones = rulesRef.current.allowedDropZones ?? [];
        const canDrag = rulesRef.current.canReorder || zones.length > 0;
        if (!canDrag) {
          pendingRef.current = null;
          onReorderBlocked?.();
          return;
        }

        try {
          event.currentTarget.setPointerCapture?.(pending.pointerId);
        } catch {
          // Ignore capture failures.
        }
        startDrag(pending.pointerId, id, pending.x, pending.y);
      }, holdMs);

      pendingRef.current = {
        kind: "longpress",
        pointerId: event.pointerId,
        originId: id,
        x: event.clientX,
        y: event.clientY,
        timer,
      };
    },
    [clearPendingTimer, onEnterSelectionMode, onReorderBlocked, startDrag]
  );

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      const pending = pendingRef.current;
      if (!pending || pending.pointerId !== event.pointerId) return;

      if (pending.kind === "longpress") {
        const dx = event.clientX - pending.x;
        const dy = event.clientY - pending.y;
        if (Math.hypot(dx, dy) > DND_MOVE_CANCEL_PX) {
          clearTimeout(pending.timer);
          if (selectionModeRef.current) {
            const visited = new Set<string>([pending.originId]);
            const originSelected = selectedRef.current.includes(
              pending.originId
            );
            // Sole checked card: keep adding as you slide (don't uncheck it).
            // Multiple checked + start on one → paint-unselect.
            const mode: "add" | "remove" =
              originSelected && selectedRef.current.length > 1
                ? "remove"
                : "add";
            if (mode === "add" && !originSelected) {
              onPaintSelect(pending.originId, mode);
            } else if (mode === "remove") {
              onPaintSelect(pending.originId, mode);
            }
            // mode === "add" && originSelected: leave it checked; paint others.
            pendingRef.current = {
              kind: "paint",
              pointerId: event.pointerId,
              visited,
              mode,
            };
          } else {
            pendingRef.current = null;
          }
        }
        return;
      }

      if (pending.kind === "paint") {
        const overId = findItemIdFromPoint(event.clientX, event.clientY);
        if (overId && !pending.visited.has(overId)) {
          pending.visited.add(overId);
          onPaintSelect(overId, pending.mode);
        }
        return;
      }

      if (pending.kind === "drag") {
        lastPointerRef.current = { x: event.clientX, y: event.clientY };
        const zone = updateDragFromPointer(event.clientX, event.clientY);
        syncAutoScroll(event.clientY, Boolean(zone));
      }
    },
    [onPaintSelect, syncAutoScroll, updateDragFromPointer]
  );

  const onPointerUp = useCallback(
    (event: PointerEvent) => {
      const pending = pendingRef.current;
      if (!pending || pending.pointerId !== event.pointerId) return;

      if (pending.kind === "longpress") {
        clearTimeout(pending.timer);
        pendingRef.current = null;
        if (selectionModeRef.current) {
          const dx = event.clientX - pending.x;
          const dy = event.clientY - pending.y;
          if (Math.hypot(dx, dy) <= DND_MOVE_CANCEL_PX) {
            onToggleSelect(pending.originId);
          }
        }
        return;
      }

      if (pending.kind === "paint") {
        pendingRef.current = null;
        return;
      }

      if (pending.kind === "drag") {
        const dropZone = findDropZoneFromPoint(event.clientX, event.clientY);
        const allowed = rulesRef.current.allowedDropZones ?? [];
        if (dropZone && allowed.includes(dropZone)) {
          onDropZone?.(dropZone, pending.movedIds);
          endDrag();
          return;
        }

        if (rulesRef.current.canReorder) {
          const prev = dragRef.current;
          const insertIndex =
            findReorderInsertIndex(
              event.clientX,
              event.clientY,
              fullIdsRef.current,
              pending.movedIds,
              frozenRectsRef.current,
              livePreviewRef.current,
              selectionGeometryRef.current,
              prev?.insertIndex
            ) ?? prev?.insertIndex;
          if (insertIndex != null) {
            const next = reorderIds(
              fullIdsRef.current,
              pending.movedIds,
              insertIndex
            );
            onReorder(next, pending.movedIds);
          }
        }
        // Same-list release while reorder is locked: silent cancel.
        // Do not toast — users drag from non-Custom to hit tab drop zones.

        endDrag();
      }
    },
    [endDrag, onDropZone, onReorder, onToggleSelect]
  );

  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  const shouldIgnoreEmptySpaceExit = useCallback(
    (target: EventTarget | null) => {
      // Flyout / dialogs / menus never count as free space.
      if (isOverlayTarget(target) || isInteractiveTarget(target)) return true;
      const el =
        target instanceof Element
          ? target
          : target instanceof Node
            ? target.parentElement
            : null;
      if (!el) return false;
      if (el.closest("[data-bulk-actions]")) return true;
      // List chrome (table shell / card list) is not free space — clicks often
      // land here after a drag or between rows.
      if (el.closest("[data-dnd-list]")) return true;
      if (el.closest("[data-dnd-item-id]")) return true;
      if (el.closest("[data-dnd-drop-zone]")) return true;
      return false;
    },
    []
  );

  const onBackgroundPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if (event.button !== 0) return;
      if (!selectionModeRef.current) return;
      // Releasing / clicking during drag only ends DnD via pointerup — don't
      // treat that as an empty-space multi-select exit.
      if (pendingRef.current?.kind === "drag" || drag) return;
      if (Date.now() < suppressEmptySpaceUntilRef.current) return;
      if (shouldIgnoreEmptySpaceExit(event.target)) return;
      onClearSelection();
    },
    [drag, onClearSelection, shouldIgnoreEmptySpaceExit]
  );

  // Use click (not pointerdown) so we don't race the gesture that just entered
  // multi-select. Prefer event.target.closest over elementFromPoint.
  useEffect(() => {
    if (!selectionMode) return;

    function onDocClick(event: MouseEvent) {
      if (pendingRef.current?.kind === "drag") return;
      if (Date.now() < suppressEmptySpaceUntilRef.current) return;
      if (shouldIgnoreEmptySpaceExit(event.target)) return;
      onClearSelection();
    }

    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
  }, [selectionMode, onClearSelection, shouldIgnoreEmptySpaceExit]);

  const bindItem = useCallback(
    (id: string) => {
      const isMoved =
        Boolean(drag?.active) && Boolean(drag?.movedIds.includes(id));
      return {
        "data-dnd-item-id": id,
        onPointerDown: (event: ReactPointerEvent) =>
          onPointerDownItem(event, id),
        style: {
          touchAction: "pan-y" as const,
          // Pass hits through moved cards so insert targeting stays stable
          // while the list reflows under the live preview.
          pointerEvents: isMoved ? ("none" as const) : undefined,
          opacity: isMoved ? 0.4 : undefined,
          // Opacity only — layout order snaps immediately (no transform lag).
          transition: drag?.active ? "opacity 80ms ease" : undefined,
        },
      };
    },
    [drag, onPointerDownItem]
  );

  return {
    drag,
    bindItem,
    onBackgroundPointerDown,
    endDrag,
  };
}
