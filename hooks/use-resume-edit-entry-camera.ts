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
  getLiveZoom: () => number;
  applyManualZoom: (scale: number) => void;
  /** Capture Fit/100/125/custom before the entry lerp overwrites it. */
  getZoomSnapshot: () => ResumeEditZoomSnapshot;
  /** Restore the pre-edit zoom when leaving edit mode. */
  restoreZoom: (snapshot: ResumeEditZoomSnapshot) => void;
  editMode: boolean;
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
 * pane expand move scale→125% and scroll so that point sits under the live mouse.
 * A→B hops while already editing do not re-arm.
 */
export function useResumeEditEntryCamera({
  viewportRef,
  pagesContainerRef,
  getLiveZoom,
  applyManualZoom,
  getZoomSnapshot,
  restoreZoom,
  editMode,
  viewportActive,
  animate = true,
  apiRef,
}: UseResumeEditEntryCameraArgs) {
  const pointerScreenRef = useRef<ResumeEditScreenPoint>({ x: 0, y: 0 });
  const pendingLocalRef = useRef<ResumeEditPageLocal | null>(null);
  const pendingScrollRef = useRef<PendingScrollApply | null>(null);
  const preEditZoomRef = useRef<ResumeEditZoomSnapshot | null>(null);
  const consumedRef = useRef(false);
  const editModeRef = useRef(editMode);
  const pinchActiveRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const animateRef = useRef(animate);

  useEffect(() => {
    editModeRef.current = editMode;
  }, [editMode]);

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

  const cancel = useCallback(() => {
    cancelRaf();
    pendingLocalRef.current = null;
    pendingScrollRef.current = null;
    const viewport = viewportRef.current;
    if (viewport) viewport.style.scrollBehavior = "";
  }, [cancelRaf, viewportRef]);

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
    (contentLocal: ResumeEditPageLocal, mouseScreen: ResumeEditScreenPoint) => {
      cancelRaf();
      const startZoom = getLiveZoom();
      const duration = RESUME_EDIT_ENTRY_LERP_MS;
      const t0 = performance.now();

      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / duration);
        const e = easeAppleSnappy(t);
        const scale = lerp(startZoom, RESUME_EDIT_ENTRY_ZOOM, e);
        queueScaleAndScroll(scale, contentLocal, mouseScreen);

        if (t >= 1) {
          rafRef.current = null;
          queueScaleAndScroll(
            RESUME_EDIT_ENTRY_ZOOM,
            contentLocal,
            mouseScreen
          );
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
   */
  const runEditEntryCamera = useCallback(() => {
    if (consumedRef.current) return;
    if (pinchActiveRef.current) return;
    const contentLocal = pendingLocalRef.current;
    if (!contentLocal) return;

    consumedRef.current = true;
    pendingLocalRef.current = null;
    // Snapshot before lerp mutates choice → custom / 125%.
    preEditZoomRef.current = getZoomSnapshot();
    const mouseScreen = { ...pointerScreenRef.current };

    if (!animateRef.current) {
      queueScaleAndScroll(
        RESUME_EDIT_ENTRY_ZOOM,
        contentLocal,
        mouseScreen
      );
      return;
    }

    runLerp(contentLocal, mouseScreen);
  }, [getZoomSnapshot, queueScaleAndScroll, runLerp]);

  // Primary scroll apply: after React commits the new scale to the canvas.
  useLayoutEffect(() => {
    if (!pendingScrollRef.current) return;
    applyScrollForPending();
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
      if (editModeRef.current) return;
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

    viewport.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      viewport.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [getLiveZoom, pagesContainerRef, viewportActive, viewportRef]);

  useEffect(() => {
    if (!viewportActive) return;
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length < 2) return;
      pinchActiveRef.current = true;
      cancelRaf();
      pendingScrollRef.current = null;
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) pinchActiveRef.current = false;
    };
    const onWheel = (event: WheelEvent) => {
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
  }, [cancelRaf, viewportActive, viewportRef]);

  // Debounce exit so a blur flicker mid-lerp does not snap back to Fit.
  useEffect(() => {
    if (editMode) return;
    const restoreTimer = window.setTimeout(() => {
      if (editModeRef.current) return;
      const root = document.querySelector("[data-resume-draft-root]");
      const stillEditing =
        classifyResumeEditTarget(document.activeElement, root) === "editable";
      if (stillEditing) return;
      consumedRef.current = false;
      cancel();
      const snapshot = preEditZoomRef.current;
      preEditZoomRef.current = null;
      if (snapshot) restoreZoom(snapshot);
    }, 220);
    return () => window.clearTimeout(restoreTimer);
  }, [cancel, editMode, restoreZoom]);

  // Fallback when split expand never fires (no desktop split / keyboard path).
  useEffect(() => {
    if (!editMode) return;
    if (!pendingLocalRef.current) return;
    const fallback = window.setTimeout(() => {
      runEditEntryCamera();
    }, 360);
    return () => window.clearTimeout(fallback);
  }, [editMode, runEditEntryCamera]);

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
