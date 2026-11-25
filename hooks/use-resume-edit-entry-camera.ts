"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type MutableRefObject,
  type RefObject,
} from "react";

import {
  RESUME_EDIT_ENTRY_LERP_MS,
  RESUME_EDIT_ENTRY_ZOOM,
  classifyResumeEditTarget,
  easeAppleSnappy,
  lerp,
  screenToPageLocal,
  scrollForContentPointAtScreen,
  type ResumeDraftZoomChoice,
  type ResumeEditPageLocal,
  type ResumeEditScreenPoint,
} from "@/lib/resume-draft/edit-presentation";
import { editableMeasureEl } from "@/lib/resume-draft/line-measure";

export type ResumeEditEntryCameraApi = {
  /** Split finished expanding — run pending entry camera once. */
  onExpanded: () => void;
  cancel: () => void;
};

/** Zoom chip + custom scale before entry camera mutates them. */
export type ResumeEditZoomSnapshot = {
  choice: ResumeDraftZoomChoice;
  manualScale: number;
};

type PendingScrollApply = {
  contentLocal: ResumeEditPageLocal;
  mouseScreen: ResumeEditScreenPoint;
  scale: number;
};

type UseResumeEditEntryCameraArgs = {
  viewportRef: RefObject<HTMLDivElement | null>;
  pagesContainerRef: RefObject<HTMLDivElement | null>;
  /** Current rendered scale so layout effects stay in sync with Fit/zoom commits. */
  liveZoom?: number;
  getLiveZoom: () => number;
  /** Resolve the real max-pane edit zoom for the live device & orientation. */
  getTargetZoom?: () => number;
  applyManualZoom: (scale: number) => void;
  /** Capture Fit/100/125/custom before the entry lerp overwrites it. */
  getZoomSnapshot: () => ResumeEditZoomSnapshot;
  /** Restore the pre-edit zoom when leaving edit mode. */
  restoreZoom: (snapshot: ResumeEditZoomSnapshot) => void;
  editMode: boolean;
  /** Active Ace line-refine node id — anchors entry camera when entering via Refine button. */
  refineFor?: string | null;
  viewportActive: boolean;
  /**
   * When true, rAF-lerp scale + scroll together; when false, jump to end state.
   */
  animate?: boolean;
  /** Optional API surface for split `onExpanded` handoff. */
  apiRef?: MutableRefObject<ResumeEditEntryCameraApi | null>;
};

/**
 * First edit-entry camera: stash page-local on editable pointerdown, then after
 * pane expand move scale to the real max-pane fit zoom for the current device
 * orientation and scroll so that point sits under the live mouse.
 * A→B hops while already editing do not re-arm.
 */
export function useResumeEditEntryCamera({
  viewportRef,
  pagesContainerRef,
  liveZoom,
  getLiveZoom,
  getTargetZoom,
  applyManualZoom,
  getZoomSnapshot,
  restoreZoom,
  editMode,
  refineFor = null,
  viewportActive,
  animate = true,
  apiRef,
}: UseResumeEditEntryCameraArgs) {
  const pointerScreenRef = useRef<ResumeEditScreenPoint>({ x: 0, y: 0 });
  const pendingLocalRef = useRef<ResumeEditPageLocal | null>(null);
  const pendingScrollRef = useRef<PendingScrollApply | null>(null);
  const preEditZoomRef = useRef<ResumeEditZoomSnapshot | null>(null);
  const lastEditedLineIdRef = useRef<string | null>(null);
  const exitPinRef = useRef<{
    contentLocal: ResumeEditPageLocal;
    screenPos: ResumeEditScreenPoint;
  } | null>(null);
  const exitPinTimerRef = useRef<number | null>(null);
  const consumedRef = useRef(false);
  const editModeRef = useRef(editMode);
  const refineForRef = useRef<string | null>(refineFor);
  const pinchActiveRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const animateRef = useRef(animate);

  useEffect(() => {
    editModeRef.current = editMode;
  }, [editMode]);

  useEffect(() => {
    refineForRef.current = refineFor;
    if (refineFor) lastEditedLineIdRef.current = refineFor;
  }, [refineFor]);

  useEffect(() => {
    animateRef.current = animate;
  }, [animate]);

  const cancelRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }
  }, []);

  const clearExitPin = useCallback(() => {
    exitPinRef.current = null;
    if (exitPinTimerRef.current !== null) {
      window.clearTimeout(exitPinTimerRef.current);
      exitPinTimerRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    cancelRaf();
    clearExitPin();
    pendingLocalRef.current = null;
    pendingScrollRef.current = null;
    const viewport = viewportRef.current;
    if (viewport) viewport.style.scrollBehavior = "";
  }, [cancelRaf, clearExitPin, viewportRef]);

  const measurePagesContentOrigin = useCallback(() => {
    const viewport = viewportRef.current;
    const pages = pagesContainerRef.current;
    if (!viewport || !pages) return null;
    const vRect = viewport.getBoundingClientRect();
    const pRect = pages.getBoundingClientRect();
    return {
      viewportOrigin: { x: vRect.left, y: vRect.top },
      pagesContentOrigin: {
        x: pRect.left - vRect.left + viewport.scrollLeft,
        y: pRect.top - vRect.top + viewport.scrollTop,
      },
      maxScrollLeft: Math.max(0, viewport.scrollWidth - viewport.clientWidth),
      maxScrollTop: Math.max(0, viewport.scrollHeight - viewport.clientHeight),
    };
  }, [pagesContainerRef, viewportRef]);

  const applyScrollForPending = useCallback(() => {
    const pending = pendingScrollRef.current;
    const viewport = viewportRef.current;
    if (!pending || !viewport) return false;

    const geom = measurePagesContentOrigin();
    if (!geom) return false;

    const target = scrollForContentPointAtScreen({
      contentLocal: pending.contentLocal,
      mouseScreen: pending.mouseScreen,
      viewportOrigin: geom.viewportOrigin,
      pagesContentOrigin: geom.pagesContentOrigin,
      scale: pending.scale,
      maxScrollLeft: geom.maxScrollLeft,
      maxScrollTop: geom.maxScrollTop,
    });

    viewport.style.scrollBehavior = "auto";
    viewport.scrollLeft = target.scrollLeft;
    viewport.scrollTop = target.scrollTop;
    viewport.style.scrollBehavior = "";
    pendingScrollRef.current = null;
    return true;
  }, [measurePagesContentOrigin, viewportRef]);

  /**
   * Queue scroll for the React commit path (layout) and a next-frame fallback
   * when scale is unchanged and setState bails out.
   */
  const queueScaleAndScroll = useCallback(
    (
      scale: number,
      contentLocal: ResumeEditPageLocal,
      mouseScreen: ResumeEditScreenPoint
    ) => {
      pendingScrollRef.current = { contentLocal, mouseScreen, scale };
      applyManualZoom(scale);
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        if (pendingScrollRef.current) applyScrollForPending();
      });
    },
    [applyManualZoom, applyScrollForPending]
  );

  const runLerp = useCallback(
    (
      contentLocal: ResumeEditPageLocal,
      mouseScreen: ResumeEditScreenPoint,
      targetZoom: number
    ) => {
      cancelRaf();
      const startZoom = getLiveZoom();
      if (Math.abs(targetZoom - startZoom) < 0.005) {
        queueScaleAndScroll(targetZoom, contentLocal, mouseScreen);
        return;
      }
      const duration = RESUME_EDIT_ENTRY_LERP_MS;
      const t0 = performance.now();

      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / duration);
        const e = easeAppleSnappy(t);
        const scale = lerp(startZoom, targetZoom, e);
        queueScaleAndScroll(scale, contentLocal, mouseScreen);

        if (t >= 1) {
          rafRef.current = null;
          queueScaleAndScroll(targetZoom, contentLocal, mouseScreen);
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    },
    [cancelRaf, getLiveZoom, queueScaleAndScroll]
  );

  /**
   * Consume a pending page-local pin (once per edit session) and move the camera.
   * When entering edit mode via the Refine button (no editable pointerdown),
   * anchors on the refined line so the sheet zooms to fill the expanded pane.
   */
  const runEditEntryCamera = useCallback(() => {
    if (consumedRef.current) return;
    if (pinchActiveRef.current) return;

    let contentLocal = pendingLocalRef.current;
    let mouseScreen: ResumeEditScreenPoint = { ...pointerScreenRef.current };

    if (!contentLocal) {
      const refineId = refineForRef.current;
      const viewport = viewportRef.current;
      const pages = pagesContainerRef.current;
      if (!refineId || !viewport || !pages) return;
      const line = Array.from(
        pages.querySelectorAll<HTMLElement>("[data-resume-line]")
      ).find((el) => el.getAttribute("data-resume-line") === refineId);
      if (!line) return;
      const editable = editableMeasureEl(line);
      const tRect = editable.getBoundingClientRect();
      const pRect = pages.getBoundingClientRect();
      const vRect = viewport.getBoundingClientRect();
      const center: ResumeEditScreenPoint = {
        x: tRect.left + tRect.width / 2,
        y: tRect.top + tRect.height / 2,
      };
      contentLocal = screenToPageLocal(
        center,
        { x: pRect.left, y: pRect.top },
        getLiveZoom()
      );
      const padY = Math.min(48, vRect.height / 4);
      const padX = Math.min(24, vRect.width / 4);
      mouseScreen = {
        x: Math.min(vRect.right - padX, Math.max(vRect.left + padX, center.x)),
        y: Math.min(vRect.bottom - padY, Math.max(vRect.top + padY, center.y)),
      };
    }

    consumedRef.current = true;
    pendingLocalRef.current = null;
    // Snapshot before lerp mutates choice → custom / max-pane fit zoom.
    preEditZoomRef.current = getZoomSnapshot();
    const targetZoom = getTargetZoom
      ? getTargetZoom()
      : RESUME_EDIT_ENTRY_ZOOM;

    if (!animateRef.current) {
      queueScaleAndScroll(targetZoom, contentLocal, mouseScreen);
      return;
    }

    runLerp(contentLocal, mouseScreen, targetZoom);
  }, [
    getLiveZoom,
    getTargetZoom,
    getZoomSnapshot,
    pagesContainerRef,
    queueScaleAndScroll,
    runLerp,
    viewportRef,
  ]);

  // Primary scroll apply: after React commits the new scale to the canvas.
  useLayoutEffect(() => {
    if (pendingScrollRef.current) {
      applyScrollForPending();
      return;
    }
    const exitPin = exitPinRef.current;
    const viewport = viewportRef.current;
    if (!exitPin || !viewport || editModeRef.current) return;
    const geom = measurePagesContentOrigin();
    if (!geom) return;
    const scale =
      typeof liveZoom === "number" && Number.isFinite(liveZoom)
        ? liveZoom
        : getLiveZoom();
    const target = scrollForContentPointAtScreen({
      contentLocal: exitPin.contentLocal,
      mouseScreen: exitPin.screenPos,
      viewportOrigin: geom.viewportOrigin,
      pagesContentOrigin: geom.pagesContentOrigin,
      scale,
      maxScrollLeft: geom.maxScrollLeft,
      maxScrollTop: geom.maxScrollTop,
    });
    viewport.style.scrollBehavior = "auto";
    viewport.scrollLeft = target.scrollLeft;
    viewport.scrollTop = target.scrollTop;
    viewport.style.scrollBehavior = "";
  });

  useEffect(() => {
    const track = (event: PointerEvent) => {
      pointerScreenRef.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener("pointerdown", track, { passive: true });
    window.addEventListener("pointermove", track, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", track);
      window.removeEventListener("pointermove", track);
    };
  }, []);

  useEffect(() => {
    if (!viewportActive) return;
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      clearExitPin();
      if (editModeRef.current) {
        // Stop an already-running entry camera lerp so the sheet does not move
        // under an A -> B hop click, but keep any unconsumed pre-expand anchor
        // intact so a fast double-click still scrolls to the clicked line.
        if (rafRef.current !== null || scrollRafRef.current !== null) {
          cancelRaf();
          pendingScrollRef.current = null;
        }
        return;
      }
      const pages = pagesContainerRef.current;
      if (!pages) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const editable = target.closest("[contenteditable='true']");
      if (!editable || !pages.contains(editable)) return;

      const pagesRect = pages.getBoundingClientRect();
      pendingLocalRef.current = screenToPageLocal(
        { x: event.clientX, y: event.clientY },
        { x: pagesRect.left, y: pagesRect.top },
        getLiveZoom()
      );
      pointerScreenRef.current = { x: event.clientX, y: event.clientY };
    };

    const onFocusIn = (event: FocusEvent) => {
      const pages = pagesContainerRef.current;
      if (!pages || !(event.target instanceof Element)) return;
      const line = event.target.closest("[data-resume-line]");
      if (!line || !pages.contains(line)) return;
      const lineId = line.getAttribute("data-resume-line");
      if (lineId) lastEditedLineIdRef.current = lineId;
    };

    viewport.addEventListener("pointerdown", onPointerDown, true);
    viewport.addEventListener("focusin", onFocusIn);
    return () => {
      viewport.removeEventListener("pointerdown", onPointerDown, true);
      viewport.removeEventListener("focusin", onFocusIn);
    };
  }, [cancelRaf, clearExitPin, getLiveZoom, pagesContainerRef, viewportActive, viewportRef]);

  useEffect(() => {
    if (!viewportActive) return;
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onTouchStart = (event: TouchEvent) => {
      clearExitPin();
      if (event.touches.length < 2) return;
      pinchActiveRef.current = true;
      cancelRaf();
      pendingScrollRef.current = null;
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) pinchActiveRef.current = false;
    };
    const onWheel = (event: WheelEvent) => {
      clearExitPin();
      if (!event.ctrlKey) return;
      pinchActiveRef.current = true;
      cancelRaf();
      pendingScrollRef.current = null;
    };
    const clearPinch = () => {
      pinchActiveRef.current = false;
    };

    viewport.addEventListener("touchstart", onTouchStart, { passive: true });
    viewport.addEventListener("touchend", onTouchEnd);
    viewport.addEventListener("touchcancel", onTouchEnd);
    viewport.addEventListener("wheel", onWheel, { passive: true });
    viewport.addEventListener("pointerup", clearPinch);
    return () => {
      viewport.removeEventListener("touchstart", onTouchStart);
      viewport.removeEventListener("touchend", onTouchEnd);
      viewport.removeEventListener("touchcancel", onTouchEnd);
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("pointerup", clearPinch);
    };
  }, [cancelRaf, clearExitPin, viewportActive, viewportRef]);

  // Tight single-frame guard matching `useResumeEditSplit` so split + zoom restore together.
  // Pin the last edited line's visual position across the zoom + Fit-scale revert so
  // `scrollTop` scales down cleanly instead of ratcheting upward on repeated edits.
  useEffect(() => {
    if (editMode) {
      clearExitPin();
      return;
    }
    const restoreTimer = window.setTimeout(() => {
      if (editModeRef.current) return;
      const root = document.querySelector("[data-resume-draft-root]");
      const stillEditing =
        classifyResumeEditTarget(document.activeElement, root) === "editable";
      if (stillEditing) return;
      consumedRef.current = false;
      cancel();

      const lineId = lastEditedLineIdRef.current;
      lastEditedLineIdRef.current = null;
      const viewport = viewportRef.current;
      const pages = pagesContainerRef.current;
      if (lineId && viewport && pages) {
        const line = Array.from(
          pages.querySelectorAll<HTMLElement>("[data-resume-line]")
        ).find((el) => el.getAttribute("data-resume-line") === lineId);
        if (line) {
          const editable = editableMeasureEl(line);
          const tRect = editable.getBoundingClientRect();
          const pRect = pages.getBoundingClientRect();
          const vRect = viewport.getBoundingClientRect();
          if (vRect.width > 0 && vRect.height > 0) {
            const rawCenter: ResumeEditScreenPoint = {
              x: tRect.left + tRect.width / 2,
              y: tRect.top + tRect.height / 2,
            };
            const contentLocal = screenToPageLocal(
              rawCenter,
              { x: pRect.left, y: pRect.top },
              getLiveZoom()
            );
            const padY = Math.min(24, vRect.height / 4);
            const padX = Math.min(24, vRect.width / 4);
            const screenPos: ResumeEditScreenPoint = {
              x: Math.min(
                vRect.right - padX,
                Math.max(vRect.left + padX, rawCenter.x)
              ),
              y: Math.min(
                vRect.bottom - padY,
                Math.max(vRect.top + padY, rawCenter.y)
              ),
            };
            exitPinRef.current = { contentLocal, screenPos };
            exitPinTimerRef.current = window.setTimeout(clearExitPin, 220);
          }
        }
      }

      const snapshot = preEditZoomRef.current;
      preEditZoomRef.current = null;
      if (snapshot) restoreZoom(snapshot);
    }, 32);
    return () => window.clearTimeout(restoreTimer);
  }, [
    cancel,
    clearExitPin,
    editMode,
    getLiveZoom,
    pagesContainerRef,
    restoreZoom,
    viewportRef,
  ]);

  // Fallback when split expand never fires (no desktop split / keyboard path).
  useEffect(() => {
    if (!editMode) return;
    if (!pendingLocalRef.current && !refineFor) return;
    const fallback = window.setTimeout(() => {
      runEditEntryCamera();
    }, 360);
    return () => window.clearTimeout(fallback);
  }, [editMode, refineFor, runEditEntryCamera]);

  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      onExpanded: runEditEntryCamera,
      cancel,
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, cancel, runEditEntryCamera]);

  useEffect(() => () => cancel(), [cancel]);

  return {
    runEditEntryCamera,
    cancelEditEntryCamera: cancel,
  };
}
