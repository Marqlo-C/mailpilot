"use client";

/**
 * Reusable card-list gestures (Subscriptions now; Job Radar later).
 *
 * Default interaction rules (timing in `lib/dnd/constants.ts`):
 * - Short hold → enter multi-select + check that card; keep holding & slide to paint-select.
 * - In multi-select: tap toggles; swipe paint adds or removes (mode from start card;
 *   sole checked card starts paint-add so it isn’t wiped).
 * - Longer hold while items are selected → drag (checked card moves all selected;
 *   unchecked moves alone). Empty-space / Escape / view changes exit multi-select;
 *   releasing a drag only ends DnD.
 * - Same-list reorder when `rules.canReorder` (e.g. Custom sort); edge hover flips page.
 * - Cross-list moves only via `rules.allowedDropZones` (e.g. Active → Unsubscribed).
 *
 * Jobs / kanban later: reuse this hook; swap movement policy through
 * `CardListGestureRules` + drop-zone handlers (tab/column targets), not a new gesture stack.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  DND_DRAG_LONG_PRESS_MS,
  DND_MOVE_CANCEL_PX,
  DND_PAGE_EDGE_PX,
  DND_PAGE_FLIP_DELAY_MS,
  DND_SELECT_LONG_PRESS_MS,
  getPageFlipLeftEdgePx,
} from "@/lib/dnd/constants";
import {
  findDropZoneFromPoint,
  findInsertIndexFromPoint,
  findItemIdFromPoint,
  isInteractiveTarget,
  isOverlayTarget,
} from "@/lib/dnd/interactive";
import { reorderIds } from "@/lib/dnd/reorder";

export type CardListGestureRules = {
  /** Same-list rearrange allowed right now. */
  canReorder: boolean;
  /** Drop-zone ids that accept the current drag (e.g. "archive"). */
  allowedDropZones?: readonly string[];
};

export type CardListDragState = {
  active: boolean;
  movedIds: string[];
  originId: string;
  insertIndex: number | null;
  dropZone: string | null;
  pointerX: number;
  pointerY: number;
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
  /** Second long-press while reorder is locked (e.g. not on Custom sort). */
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
  const pendingRef = useRef<Pending | null>(null);
  const pageFlipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageFlipDirRef = useRef<-1 | 1 | null>(null);
  /** Ignore synthetic click that browsers fire after pointerup from a drag. */
  const suppressEmptySpaceUntilRef = useRef(0);

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

  const clearPendingTimer = useCallback(() => {
    const pending = pendingRef.current;
    if (pending?.kind === "longpress") {
      clearTimeout(pending.timer);
    }
  }, []);

  const endDrag = useCallback(() => {
    clearPageFlip();
    pendingRef.current = null;
    setDrag(null);
    // pointerup is often followed by a click on the list shell — don't treat
    // that as an empty-space multi-select exit.
    suppressEmptySpaceUntilRef.current = Date.now() + 500;
  }, [clearPageFlip]);

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
    };
  }, [clearPendingTimer, clearPageFlip]);

  const startDrag = useCallback(
    (pointerId: number, originId: string, x: number, y: number) => {
      const selected = selectedRef.current;
      const movedIds = selected.includes(originId) ? [...selected] : [originId];
      pendingRef.current = {
        kind: "drag",
        pointerId,
        movedIds,
        originId,
      };
      setDrag({
        active: true,
        movedIds,
        originId,
        insertIndex: null,
        dropZone: null,
        pointerX: x,
        pointerY: y,
      });
    },
    []
  );

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

        // Longer hold while items are selected → drag (if rules allow).
        if (!rulesRef.current.canReorder) {
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
        const dropZone = findDropZoneFromPoint(event.clientX, event.clientY);
        const allowed = rulesRef.current.allowedDropZones ?? [];
        const zone =
          dropZone && allowed.includes(dropZone) ? dropZone : null;

        let insertIndex: number | null = null;
        if (!zone && rulesRef.current.canReorder) {
          const pageIndex = findInsertIndexFromPoint(
            event.clientX,
            event.clientY,
            pageIdsRef.current
          );
          if (pageIndex != null) {
            const { currentPage: page, pageSize: size } = pageMetaRef.current;
            insertIndex = (page - 1) * size + pageIndex;
          }
        }

        setDrag({
          active: true,
          movedIds: pending.movedIds,
          originId: pending.originId,
          insertIndex,
          dropZone: zone,
          pointerX: event.clientX,
          pointerY: event.clientY,
        });

        // Cross-page edge flip (same tab only; not while over a drop zone).
        if (!zone && rulesRef.current.canReorder) {
          const { currentPage: page, totalPages: pages } = pageMetaRef.current;
          let dir: -1 | 1 | null = null;
          const leftEdge = getPageFlipLeftEdgePx();
          if (event.clientX <= leftEdge && page > 1) dir = -1;
          else if (
            event.clientX >= window.innerWidth - DND_PAGE_EDGE_PX &&
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
      }
    },
    [clearPageFlip, onPaintSelect, onPageChange]
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
          const pageIndex = findInsertIndexFromPoint(
            event.clientX,
            event.clientY,
            pageIdsRef.current
          );
          if (pageIndex != null) {
            const { currentPage: page, pageSize: size } = pageMetaRef.current;
            const absoluteIndex = (page - 1) * size + pageIndex;
            // Adjust target for removals before the insert point.
            const full = fullIdsRef.current;
            const movedSet = new Set(pending.movedIds);
            let adjusted = absoluteIndex;
            for (let i = 0; i < absoluteIndex && i < full.length; i++) {
              if (movedSet.has(full[i]!)) adjusted -= 1;
            }
            const next = reorderIds(full, pending.movedIds, adjusted);
            onReorder(next, pending.movedIds);
          }
        }

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
      // #region agent log
      fetch("http://127.0.0.1:7809/ingest/151252f8-c719-4220-ad29-b58c7990906d", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "3c315a",
        },
        body: JSON.stringify({
          sessionId: "3c315a",
          hypothesisId: "A",
          location: "use-card-list-gestures.ts:onBackgroundPointerDown",
          message: "empty-space clear via background handler",
          data: {
            target:
              event.target instanceof Element
                ? event.target.tagName
                : typeof event.target,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
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
      // #region agent log
      fetch("http://127.0.0.1:7809/ingest/151252f8-c719-4220-ad29-b58c7990906d", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "3c315a",
        },
        body: JSON.stringify({
          sessionId: "3c315a",
          hypothesisId: "A",
          location: "use-card-list-gestures.ts:onDocClick",
          message: "empty-space clear via document click",
          data: {
            target:
              event.target instanceof Element
                ? `${event.target.tagName}.${event.target.className?.toString?.().slice?.(0, 80) ?? ""}`
                : typeof event.target,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      onClearSelection();
    }

    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
  }, [selectionMode, onClearSelection, shouldIgnoreEmptySpaceExit]);

  const bindItem = useCallback(
    (id: string) => ({
      "data-dnd-item-id": id,
      onPointerDown: (event: ReactPointerEvent) =>
        onPointerDownItem(event, id),
      style: {
        touchAction: "pan-y" as const,
        opacity:
          drag?.active && drag.movedIds.includes(id) ? 0.45 : undefined,
      },
    }),
    [drag, onPointerDownItem]
  );

  return {
    drag,
    bindItem,
    onBackgroundPointerDown,
    endDrag,
  };
}
