"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type MutableRefObject,
} from "react";

import { ensureAnchorInCanvasView } from "@/lib/resume-draft/edit-pin";

function lineIdFrom(el: Element | null): string | null {
  return (
    el?.closest("[data-resume-line]")?.getAttribute("data-resume-line") ?? null
  );
}

function isLineToolbar(el: Element | null): boolean {
  return Boolean(el?.closest("[data-resume-line-toolbar]"));
}

/**
 * Edit-line lifecycle for resume draft chrome: editing id, Ace pin highlight,
 * and float restore after blur. Caret placement is left to the browser.
 */
export function useResumeEditPin({
  targetRefs,
  editingIdRef,
  pinnedId,
  measure,
  setActiveId,
  setEditingId,
  dismissToolbar,
}: {
  targetRefs: MutableRefObject<Map<string, HTMLElement>>;
  editingIdRef: MutableRefObject<string | null>;
  pinnedId: string | null;
  /** Kept for call-site compatibility; float RO lives in the provider. */
  activeId: string | null;
  measure: (nodeId: string) => void;
  setActiveId: (nodeId: string | null) => void;
  setEditingId: (
    value: string | null | ((current: string | null) => string | null)
  ) => void;
  dismissToolbar: () => void;
}) {
  const pointerRef = useRef({ x: 0, y: 0 });
  const restoreTimerRef = useRef<number | null>(null);
  const pinnedIdRef = useRef<string | null>(pinnedId);
  pinnedIdRef.current = pinnedId;

  const restoreToolbarIfHovered = useCallback(
    (nodeId: string) => {
      if (restoreTimerRef.current !== null) {
        window.clearTimeout(restoreTimerRef.current);
        restoreTimerRef.current = null;
      }
      restoreTimerRef.current = window.setTimeout(() => {
        restoreTimerRef.current = null;
        if (editingIdRef.current) return;
        const hit = document.elementFromPoint(
          pointerRef.current.x,
          pointerRef.current.y
        );
        if (lineIdFrom(hit) !== nodeId && !isLineToolbar(hit)) return;
        setActiveId(nodeId);
        measure(nodeId);
      }, 260);
    },
    [editingIdRef, measure, setActiveId]
  );

  const onEditStart = useCallback(
    (nodeId: string) => {
      if (restoreTimerRef.current !== null) {
        window.clearTimeout(restoreTimerRef.current);
        restoreTimerRef.current = null;
      }
      setEditingId(nodeId);
      setActiveId(nodeId);
      measure(nodeId);
    },
    [measure, setActiveId, setEditingId]
  );

  const onEditEnd = useCallback(
    (nodeId: string) => {
      const wasEditing = editingIdRef.current === nodeId;
      setEditingId((current) => (current === nodeId ? null : current));
      // Ace refine can keep the line pinned — don't dismiss float then.
      if (pinnedIdRef.current !== nodeId) {
        dismissToolbar();
        restoreToolbarIfHovered(nodeId);
      }
      // After pane shrink, nearest-clamp if the line left the canvas.
      if (wasEditing && pinnedIdRef.current !== nodeId) {
        window.setTimeout(() => {
          const line = targetRefs.current.get(nodeId);
          if (!line) return;
          ensureAnchorInCanvasView(line);
        }, 0);
      }
    },
    [
      dismissToolbar,
      editingIdRef,
      restoreToolbarIfHovered,
      setEditingId,
      targetRefs,
    ]
  );

  // Ace wand: keep the refined line highlighted while the panel is open.
  useEffect(() => {
    if (!pinnedId) return;
    if (restoreTimerRef.current !== null) {
      window.clearTimeout(restoreTimerRef.current);
      restoreTimerRef.current = null;
    }
    const el = targetRefs.current.get(pinnedId);
    if (!el) return;
    setActiveId(pinnedId);
    measure(pinnedId);
    ensureAnchorInCanvasView(el);
  }, [measure, pinnedId, setActiveId, targetRefs]);

  useEffect(() => {
    const trackMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener("pointermove", trackMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", trackMove);
    };
  }, []);

  useEffect(
    () => () => {
      if (restoreTimerRef.current !== null) {
        window.clearTimeout(restoreTimerRef.current);
        restoreTimerRef.current = null;
      }
    },
    []
  );

  return {
    onEditStart,
    onEditEnd,
  };
}
