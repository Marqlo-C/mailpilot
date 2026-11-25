"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronUp,
  Minus,
  Plus,
  WandSparkles,
} from "lucide-react";

import {
  RESUME_EDIT_PIN_SETTLE_MS,
  RESUME_EDIT_PIN_STABLE_PX,
  RESUME_EDIT_ZOOM_FLOOR,
  resolveEditScreenAnchor,
  resolveEditableAnchorRect,
  resolveEditableMeasureTarget,
  scrollDeltaForZoomAroundPoint,
  type ResumeEditScreenPoint,
} from "@/lib/resume-draft/edit-presentation";
import { cn } from "@/lib/utils";

/** Same beat as sidebar telemetry dwell — skim past a neighbor without stealing. */
const SWITCH_DWELL_MS = 180;
const CLOSE_DELAY_MS = 180;
/** Accept a pointerdown as the edit anchor if focus follows within this window. */
const CLICK_ANCHOR_MS = 500;
/** Floating chip height (size-6 buttons + padding) — keep in sync with the portal. */
const CHIP_H = 28;
/** Approx chip width for centering (± / move / Ace cluster). */
const CHIP_W = 144;
/** Clear air between chip and line box (no glyph overlap). */
const CHIP_GAP = 6;
const VIEWPORT_PAD = 8;

type ScreenPoint = ResumeEditScreenPoint;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Prefer the contenteditable itself (skills wrap a label + editable in one
 * hover target — chrome must sit above the editable text, not the label).
 */
function editableMeasureEl(el: HTMLElement): HTMLElement {
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
function editableAnchorRect(el: HTMLElement): DOMRect {
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

/**
 * Bottom edge of the sheet's fixed resume toolbar (+ gap).
 * Float is portaled to `document.body` at a high z-index, so placement — not
 * stacking — must keep it from covering this chrome on scroll.
 */
function resumeSheetToolbarFloor(): number {
  if (typeof document === "undefined") return VIEWPORT_PAD;
  let floor = VIEWPORT_PAD;
  for (const el of document.querySelectorAll("[data-resume-toolbar]")) {
    if (!(el instanceof HTMLElement)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    floor = Math.max(floor, rect.bottom + CHIP_GAP);
  }
  return floor;
}

/**
 * Center above the first-line box; flip below when there is no room.
 * Never paint over the fixed resume toolbar — hide if the line is under it.
 */
function placeLineToolbar(anchor: {
  top: number;
  left: number;
  width: number;
  height: number;
}): { top: number; left: number } | null {
  const viewportW =
    typeof window !== "undefined" ? window.innerWidth : anchor.left + CHIP_W;
  const viewportH =
    typeof window !== "undefined" ? window.innerHeight : anchor.top + CHIP_H;
  const minTop = resumeSheetToolbarFloor();

  // Line fully scrolled under the fixed chrome — don't float on top of it.
  if (anchor.top + anchor.height <= minTop) return null;

  const aboveTop = anchor.top - CHIP_H - CHIP_GAP;
  const belowTop = anchor.top + anchor.height + CHIP_GAP;
  let top =
    aboveTop >= minTop
      ? aboveTop
      : Math.min(belowTop, viewportH - CHIP_H - VIEWPORT_PAD);
  if (top < minTop) top = minTop;
  if (top + CHIP_H > viewportH - VIEWPORT_PAD) return null;

  const idealLeft = anchor.left + anchor.width / 2 - CHIP_W / 2;
  const left = Math.min(
    Math.max(VIEWPORT_PAD, idealLeft),
    viewportW - CHIP_W - VIEWPORT_PAD
  );
  return { top, left };
}

type LineMeta = { label: string; included: boolean };

type ResumeLineChromeContextValue = {
  disabled?: boolean;
  activeId: string | null;
  editingId: string | null;
  /** Stays highlighted while rewrite popover is open (not hover-dependent). */
  pinnedId: string | null;
  registerTarget: (nodeId: string, el: HTMLElement | null) => void;
  setLineMeta: (nodeId: string, meta: LineMeta) => void;
  onTargetEnter: (nodeId: string) => void;
  onTargetLeave: (event: ReactPointerEvent<HTMLElement>) => void;
  onEditStart: (nodeId: string) => void;
  onEditEnd: (nodeId: string) => void;
};

const ResumeLineChromeContext =
  createContext<ResumeLineChromeContextValue | null>(null);

function pointerDestination(
  relatedTarget: EventTarget | null,
  clientX: number,
  clientY: number
): Element | null {
  if (relatedTarget instanceof Element) return relatedTarget;
  return document.elementFromPoint(clientX, clientY);
}

function lineIdFrom(el: Element | null): string | null {
  return (
    el?.closest("[data-resume-line]")?.getAttribute("data-resume-line") ?? null
  );
}

function isLineToolbar(el: Element | null): boolean {
  return Boolean(el?.closest("[data-resume-line-toolbar]"));
}

function clearTimer(ref: { current: number | null }) {
  if (ref.current === null) return;
  window.clearTimeout(ref.current);
  ref.current = null;
}

function nearestScrollParent(el: HTMLElement): HTMLElement | null {
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

/**
 * Content probe used to measure where the pinned spot moved after layout.
 * Prefer caret (follows the click); else first-line center.
 */
function captureContentProbe(el: HTMLElement): ScreenPoint {
  const editable = editableMeasureEl(el);
  const line = editableAnchorRect(el);
  const firstLine = {
    x: line.x,
    y: line.y,
    width: line.width,
    height: line.height,
  };
  const sel = document.getSelection();
  let caret: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null = null;
  if (sel && sel.rangeCount > 0 && editable.contains(sel.anchorNode)) {
    const r = sel.getRangeAt(0).getBoundingClientRect();
    caret = { x: r.x, y: r.y, width: r.width, height: r.height };
  }
  return resolveEditScreenAnchor({ caret, firstLine });
}

/**
 * Scroll so the content probe stays under the locked screen pixel (click/caret).
 */
function pinEditAnchorToScreen(el: HTMLElement, desired: ScreenPoint) {
  const current = captureContentProbe(el);
  const dx = current.x - desired.x;
  const dy = current.y - desired.y;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
  const parent = nearestScrollParent(el);
  if (parent) {
    parent.scrollLeft += dx;
    parent.scrollTop += dy;
    return;
  }
  window.scrollBy(dx, dy);
}

/**
 * Instant scale correction about a screen point (PDF.js zoom-around-cursor).
 * Used when Fit scale jumps; pin settle covers the rest of the layout motion.
 */
function applyZoomAroundScreenPoint(
  el: HTMLElement,
  screen: ScreenPoint,
  oldZoom: number,
  newZoom: number
) {
  const parent = nearestScrollParent(el);
  if (!parent || oldZoom <= 0) return;
  const rect = parent.getBoundingClientRect();
  const { dx, dy } = scrollDeltaForZoomAroundPoint({
    oldZoom,
    newZoom,
    anchorXInScroller: screen.x - rect.left,
    anchorYInScroller: screen.y - rect.top,
  });
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
  parent.scrollLeft += dx;
  parent.scrollTop += dy;
}

/** Hop: only scrollIntoView when the line is outside the canvas scrollport. */
function ensureAnchorInCanvasView(el: HTMLElement) {
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

/**
 * Bounded zoomAroundPoint settle: per-frame scroll deltas until stable or timeout.
 * `prefers-reduced-motion` → single instant pin.
 */
function settleEditPin(
  getEl: () => HTMLElement | null,
  getDesired: () => ScreenPoint | null,
  onFrame: () => void
): () => void {
  if (prefersReducedMotion()) {
    const el = getEl();
    const desired = getDesired();
    if (el && desired) pinEditAnchorToScreen(el, desired);
    onFrame();
    return () => {};
  }

  const start = performance.now();
  let stable = 0;
  let raf = 0;
  let cancelled = false;

  const tick = (now: number) => {
    if (cancelled) return;
    const el = getEl();
    const desired = getDesired();
    if (!el || !desired) return;
    pinEditAnchorToScreen(el, desired);
    onFrame();
    const current = captureContentProbe(el);
    const dx = Math.abs(current.x - desired.x);
    const dy = Math.abs(current.y - desired.y);
    if (dx <= RESUME_EDIT_PIN_STABLE_PX && dy <= RESUME_EDIT_PIN_STABLE_PX) {
      stable += 1;
      if (stable >= 2) return;
    } else {
      stable = 0;
    }
    if (now - start < RESUME_EDIT_PIN_SETTLE_MS) {
      raf = requestAnimationFrame(tick);
    }
  };

  raf = requestAnimationFrame(tick);
  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
  };
}

/**
 * Shared floating ± / move / refine chrome for every resume draft line.
 * Preview text stays export-identical — controls live in a body portal.
 *
 * Hover: float follows the hovered line.
 * Inline edit: float stays on the focused line only (no neighbor steal);
 * same ± / move / Ace actions — not a second in-text control strip.
 */
export function ResumeLineChromeProvider({
  disabled,
  pinnedId = null,
  onToggle,
  onMove,
  onRefineOpen,
  children,
}: {
  disabled?: boolean;
  /** Line kept highlighted while an external rewrite UI is open. */
  pinnedId?: string | null;
  onToggle: (nodeId: string, selected: boolean) => void;
  onMove: (nodeId: string, direction: "up" | "down") => void;
  onRefineOpen: (nodeId: string) => void;
  children: ReactNode;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [activeMeta, setActiveMeta] = useState<LineMeta | null>(null);

  const activeIdRef = useRef<string | null>(null);
  const editingIdRef = useRef<string | null>(null);
  const chromeQuietUntilRef = useRef(0);
  const pointerRef = useRef({ x: 0, y: 0 });
  /** Last pointerdown — preferred Apple zoom-around-point origin. */
  const pointerDownRef = useRef<{ x: number; y: number; at: number } | null>(
    null
  );
  const targetRefs = useRef(new Map<string, HTMLElement>());
  const metaRef = useRef(new Map<string, LineMeta>());
  const closeTimerRef = useRef<number | null>(null);
  const switchTimerRef = useRef<number | null>(null);
  const restoreTimerRef = useRef<number | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  /**
   * Locked screen pixel from the click (or caret / first-line fallback).
   * Never rewrite after layout — that was killing zoom-around-point.
   */
  const editPinRef = useRef<ScreenPoint | null>(null);
  const settleCancelRef = useRef<(() => void) | null>(null);
  const zoomAtPinRef = useRef<number | null>(null);
  const pinnedIdRef = useRef<string | null>(pinnedId);
  pinnedIdRef.current = pinnedId;

  const readCanvasZoom = useCallback((el: HTMLElement): number => {
    const scaled = el
      .closest("[data-resume-draft-root]")
      ?.querySelector<HTMLElement>("[data-resume-pages]");
    if (!scaled) return 1;
    const t = getComputedStyle(scaled).transform;
    if (!t || t === "none") return 1;
    const match = t.match(/matrix\(([^,]+)/);
    if (!match) return 1;
    const sx = Number(match[1]);
    return Number.isFinite(sx) && sx > 0 ? sx : 1;
  }, []);

  const lockEditPin = useCallback(
    (nodeId: string, el: HTMLElement) => {
      const down = pointerDownRef.current;
      const recent =
        down && Date.now() - down.at <= CLICK_ANCHOR_MS
          ? down
          : null;
      // Prefer the actual click — that is the Apple origin.
      const desired = recent
        ? { x: recent.x, y: recent.y }
        : captureContentProbe(el);
      editPinRef.current = desired;

      const oldZoom = readCanvasZoom(el);
      zoomAtPinRef.current = oldZoom;

      // Scale about the click in page space so CSS transform keeps it put.
      const pages = el
        .closest("[data-resume-draft-root]")
        ?.querySelector<HTMLElement>("[data-resume-pages]");
      if (pages && oldZoom > 0) {
        const rect = pages.getBoundingClientRect();
        const ox = (desired.x - rect.left) / oldZoom;
        const oy = (desired.y - rect.top) / oldZoom;
        pages.style.transformOrigin = `${ox}px ${oy}px`;
      }

      // Immediate scroll correction for the coming edit floor (≥100%).
      const nextZoom = Math.max(oldZoom, RESUME_EDIT_ZOOM_FLOOR);
      if (nextZoom > oldZoom + 1e-4) {
        applyZoomAroundScreenPoint(el, desired, oldZoom, nextZoom);
        zoomAtPinRef.current = nextZoom;
      }
      void nodeId;
    },
    [readCanvasZoom]
  );

  activeIdRef.current = activeId;
  editingIdRef.current = editingId;

  const cancelSettle = useCallback(() => {
    settleCancelRef.current?.();
    settleCancelRef.current = null;
  }, []);

  /** Brief post-blur hush only — editing pins the float; it is not “quiet.” */
  const chromeIsQuiet = useCallback(
    () => Date.now() < chromeQuietUntilRef.current,
    []
  );

  /** While editing, ignore hover on every line except the focused one. */
  const blocksHoverFor = useCallback((nodeId: string) => {
    const editing = editingIdRef.current;
    return editing !== null && editing !== nodeId;
  }, []);

  const measure = useCallback((nodeId: string) => {
    const el = targetRefs.current.get(nodeId);
    if (!el) return;
    // Editable text box (skills: skip the bold label); first rect if wrapped.
    const rect = editableAnchorRect(el);
    setAnchor({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
    setActiveMeta(metaRef.current.get(nodeId) ?? null);
  }, []);

  const beginSettle = useCallback(
    (nodeId: string) => {
      cancelSettle();
      settleCancelRef.current = settleEditPin(
        () => targetRefs.current.get(nodeId) ?? null,
        () => editPinRef.current,
        () => measure(nodeId)
      );
    },
    [cancelSettle, measure]
  );

  const dismissToolbar = useCallback(() => {
    clearTimer(closeTimerRef);
    clearTimer(switchTimerRef);
    setActiveId(null);
    setAnchor(null);
    setActiveMeta(null);
  }, []);

  const armNow = useCallback(
    (nodeId: string) => {
      if (blocksHoverFor(nodeId) || chromeIsQuiet()) return;
      clearTimer(closeTimerRef);
      clearTimer(switchTimerRef);
      setActiveId(nodeId);
      measure(nodeId);
    },
    [blocksHoverFor, chromeIsQuiet, measure]
  );

  const restoreToolbarIfHovered = useCallback(
    (nodeId: string) => {
      clearTimer(restoreTimerRef);
      chromeQuietUntilRef.current = Date.now() + 250;
      restoreTimerRef.current = window.setTimeout(() => {
        restoreTimerRef.current = null;
        chromeQuietUntilRef.current = 0;
        if (editingIdRef.current) return;
        const hit = document.elementFromPoint(
          pointerRef.current.x,
          pointerRef.current.y
        );
        if (lineIdFrom(hit) !== nodeId && !isLineToolbar(hit)) return;
        clearTimer(closeTimerRef);
        clearTimer(switchTimerRef);
        setActiveId(nodeId);
        measure(nodeId);
      }, 260);
    },
    [measure]
  );

  const scheduleClose = useCallback(() => {
    // Editing pins the float to the focused line until blur.
    if (editingIdRef.current) return;
    clearTimer(closeTimerRef);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      clearTimer(switchTimerRef);
      setActiveId(null);
      setAnchor(null);
      setActiveMeta(null);
    }, CLOSE_DELAY_MS);
  }, []);

  const scheduleSwitch = useCallback(
    (nodeId: string) => {
      if (blocksHoverFor(nodeId) || chromeIsQuiet()) return;
      clearTimer(closeTimerRef);
      clearTimer(switchTimerRef);
      if (activeIdRef.current === nodeId) {
        measure(nodeId);
        return;
      }
      switchTimerRef.current = window.setTimeout(() => {
        switchTimerRef.current = null;
        if (blocksHoverFor(nodeId) || chromeIsQuiet()) return;
        setActiveId(nodeId);
        measure(nodeId);
      }, SWITCH_DWELL_MS);
    },
    [blocksHoverFor, chromeIsQuiet, measure]
  );

  const onTargetEnter = useCallback(
    (nodeId: string) => {
      if (blocksHoverFor(nodeId) || chromeIsQuiet()) return;
      clearTimer(closeTimerRef);
      if (activeIdRef.current === null || activeIdRef.current === nodeId) {
        armNow(nodeId);
        return;
      }
      scheduleSwitch(nodeId);
    },
    [armNow, blocksHoverFor, chromeIsQuiet, scheduleSwitch]
  );

  const onTargetLeave = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (editingIdRef.current) return;
      const next = event.relatedTarget;
      if (next instanceof Node && event.currentTarget.contains(next)) return;
      const dest = pointerDestination(next, event.clientX, event.clientY);
      if (isLineToolbar(dest) || lineIdFrom(dest)) {
        clearTimer(switchTimerRef);
        return;
      }
      clearTimer(switchTimerRef);
      scheduleClose();
    },
    [scheduleClose]
  );

  const onToolbarLeave = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (editingIdRef.current) return;
      const next = event.relatedTarget;
      if (next instanceof Node && event.currentTarget.contains(next)) return;
      const dest = pointerDestination(next, event.clientX, event.clientY);
      if (lineIdFrom(dest)) {
        clearTimer(closeTimerRef);
        return;
      }
      scheduleClose();
    },
    [scheduleClose]
  );

  const registerTarget = useCallback(
    (nodeId: string, el: HTMLElement | null) => {
      if (el) targetRefs.current.set(nodeId, el);
      else targetRefs.current.delete(nodeId);
    },
    []
  );

  const setLineMeta = useCallback((nodeId: string, meta: LineMeta) => {
    metaRef.current.set(nodeId, meta);
    if (activeIdRef.current === nodeId) setActiveMeta(meta);
  }, []);

  const onEditStart = useCallback(
    (nodeId: string) => {
      clearTimer(restoreTimerRef);
      clearTimer(closeTimerRef);
      clearTimer(switchTimerRef);
      const hopping =
        editingIdRef.current !== null && editingIdRef.current !== nodeId;
      const el = targetRefs.current.get(nodeId);
      // Hop: retarget pin only — no split/zoom re-snapshot.
      if (hopping && el) {
        ensureAnchorInCanvasView(el);
      }
      // Lock screen origin BEFORE split/Fit layout moves the page.
      if (el) lockEditPin(nodeId, el);
      else editPinRef.current = null;
      setEditingId(nodeId);
      setActiveId(nodeId);
      measure(nodeId);
      // Settle toward the locked click — never re-capture desired after layout.
      beginSettle(nodeId);
      // Caret placement can lag one frame behind focus; re-settle only.
      requestAnimationFrame(() => {
        if (editingIdRef.current === nodeId) beginSettle(nodeId);
      });
    },
    [beginSettle, lockEditPin, measure]
  );

  const onEditEnd = useCallback(
    (nodeId: string) => {
      cancelSettle();
      const wasEditing = editingIdRef.current === nodeId;
      editPinRef.current = null;
      zoomAtPinRef.current = null;
      const pages = targetRefs.current
        .get(nodeId)
        ?.closest("[data-resume-draft-root]")
        ?.querySelector<HTMLElement>("[data-resume-pages]");
      if (pages) pages.style.transformOrigin = "0 0";
      setEditingId((current) => (current === nodeId ? null : current));
      // Ace refine can keep the line pinned — don't dismiss float then.
      if (pinnedIdRef.current !== nodeId) {
        dismissToolbar();
        restoreToolbarIfHovered(nodeId);
      }
      // After shrink, one-time nearest clamp if the line left the canvas.
      if (wasEditing && pinnedIdRef.current !== nodeId) {
        const delay = prefersReducedMotion() ? 0 : RESUME_EDIT_PIN_SETTLE_MS;
        window.setTimeout(() => {
          const el = targetRefs.current.get(nodeId);
          if (!el) return;
          ensureAnchorInCanvasView(el);
        }, delay);
      }
    },
    [cancelSettle, dismissToolbar, restoreToolbarIfHovered]
  );

  // Ace wand (no caret): pin first-line center while refine is open.
  useEffect(() => {
    if (!pinnedId) {
      if (!editingIdRef.current) {
        cancelSettle();
        editPinRef.current = null;
        zoomAtPinRef.current = null;
        document
          .querySelector<HTMLElement>("[data-resume-pages]")
          ?.style.setProperty("transform-origin", "0 0");
      }
      return;
    }
    const el = targetRefs.current.get(pinnedId);
    if (!el) return;
    clearTimer(restoreTimerRef);
    clearTimer(closeTimerRef);
    clearTimer(switchTimerRef);
    if (!editPinRef.current) {
      lockEditPin(pinnedId, el);
    }
    setActiveId(pinnedId);
    measure(pinnedId);
    beginSettle(pinnedId);
  }, [beginSettle, cancelSettle, lockEditPin, measure, pinnedId]);

  useEffect(() => {
    const trackMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
    };
    const trackDown = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
      pointerDownRef.current = {
        x: event.clientX,
        y: event.clientY,
        at: Date.now(),
      };
    };
    window.addEventListener("pointermove", trackMove, { passive: true });
    window.addEventListener("pointerdown", trackDown, { passive: true });
    return () => {
      window.removeEventListener("pointermove", trackMove);
      window.removeEventListener("pointerdown", trackDown);
    };
  }, []);

  useLayoutEffect(() => {
    if (!activeId) return;
    measure(activeId);
  }, [activeId, editingId, measure]);

  useEffect(() => {
    if (!activeId) return;
    const syncFloat = () => measure(activeId);
    // Pin on layout settles only — not on scroll (would feedback-loop).
    const syncPinAndFloat = () => {
      const line = targetRefs.current.get(activeId);
      const pin = editPinRef.current;
      const pinning =
        editingIdRef.current === activeId || pinnedIdRef.current === activeId;
      if (line && pin && pinning) {
        const prevZoom = zoomAtPinRef.current;
        const nextZoom = readCanvasZoom(line);
        // Fit scale change: correct about the locked click before probe settle.
        if (
          prevZoom !== null &&
          Math.abs(nextZoom - prevZoom) > 1e-4
        ) {
          applyZoomAroundScreenPoint(line, pin, prevZoom, nextZoom);
          zoomAtPinRef.current = nextZoom;
        }
        pinEditAnchorToScreen(line, pin);
      }
      measure(activeId);
    };
    const el = targetRefs.current.get(activeId);

    // Pane expand (edit-mode grow) moves the line in viewport without a
    // window resize — observe the line + ancestors through the draft root.
    const resizeObserver = new ResizeObserver(() => {
      syncPinAndFloat();
      if (
        editingIdRef.current === activeId ||
        pinnedIdRef.current === activeId
      ) {
        beginSettle(activeId);
      }
    });
    if (el) {
      resizeObserver.observe(el);
      let node: HTMLElement | null = el.parentElement;
      while (node) {
        resizeObserver.observe(node);
        if (node.hasAttribute("data-resume-draft-root")) break;
        node = node.parentElement;
      }
    }

    window.addEventListener("scroll", syncFloat, true);
    window.addEventListener("resize", syncPinAndFloat);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("scroll", syncFloat, true);
      window.removeEventListener("resize", syncPinAndFloat);
    };
  }, [activeId, beginSettle, editingId, measure, readCanvasZoom]);

  useEffect(
    () => () => {
      cancelSettle();
      clearTimer(closeTimerRef);
      clearTimer(switchTimerRef);
      clearTimer(restoreTimerRef);
    },
    [cancelSettle]
  );

  const ctx = useMemo<ResumeLineChromeContextValue>(
    () => ({
      disabled,
      activeId,
      editingId,
      pinnedId,
      registerTarget,
      setLineMeta,
      onTargetEnter,
      onTargetLeave,
      onEditStart,
      onEditEnd,
    }),
    [
      activeId,
      disabled,
      editingId,
      onEditEnd,
      onEditStart,
      onTargetEnter,
      onTargetLeave,
      pinnedId,
      registerTarget,
      setLineMeta,
    ]
  );

  const placed = anchor ? placeLineToolbar(anchor) : null;

  const included = activeMeta?.included ?? true;
  const label = activeMeta?.label ?? "line";

  const toolbar =
    typeof document !== "undefined" && activeId && placed
      ? createPortal(
          <div
            ref={toolbarRef}
            data-resume-line-toolbar=""
            tabIndex={-1}
            onPointerEnter={() => clearTimer(closeTimerRef)}
            onPointerLeave={onToolbarLeave}
            className="pointer-events-auto fixed z-[200] outline-none"
            style={{ top: placed.top, left: placed.left }}
          >
            <div
              role="toolbar"
              aria-label={`${label} actions`}
              className={cn(
                "flex cursor-default items-center gap-0.5 rounded-md border border-[#E5E7EB] bg-white p-0.5 shadow-sm",
                "animate-in fade-in-0 zoom-in-95 duration-100"
              )}
            >
              <ToolbarIcon
                disabled={disabled}
                label={
                  included
                    ? `Exclude ${label} from export`
                    : `Include ${label} in export`
                }
                onClick={() => onToggle(activeId, !included)}
              >
                {included ? (
                  <Minus className="size-3" aria-hidden />
                ) : (
                  <Plus className="size-3" aria-hidden />
                )}
              </ToolbarIcon>
              <span aria-hidden className="mx-0.5 h-3 w-px bg-[#E5E7EB]" />
              <ToolbarIcon
                disabled={disabled}
                label={`Move ${label} up`}
                onClick={() => onMove(activeId, "up")}
              >
                <ChevronUp className="size-3" aria-hidden />
              </ToolbarIcon>
              <ToolbarIcon
                disabled={disabled}
                label={`Move ${label} down`}
                onClick={() => onMove(activeId, "down")}
              >
                <ChevronDown className="size-3" aria-hidden />
              </ToolbarIcon>
              <ToolbarIcon
                disabled={disabled}
                label={`Refine ${label}`}
                onClick={() => onRefineOpen(activeId)}
              >
                <WandSparkles className="size-3" aria-hidden />
              </ToolbarIcon>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <ResumeLineChromeContext.Provider value={ctx}>
      {children}
      {toolbar}
    </ResumeLineChromeContext.Provider>
  );
}

/**
 * Bind a draft node to the shared floating toolbar (hover target + edit hooks).
 */
export function useResumeLineTarget(
  nodeId: string,
  meta: LineMeta
): {
  targetProps: {
    ref: (el: HTMLElement | null) => void;
    "data-resume-line": string;
    onPointerEnter: () => void;
    onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => void;
  };
  editProps: {
    onEditStart: () => void;
    onEditEnd: () => void;
  };
  highlighted: boolean;
} {
  const chrome = useContext(ResumeLineChromeContext);
  if (!chrome) {
    throw new Error("useResumeLineTarget requires ResumeLineChromeProvider");
  }

  const { label, included } = meta;
  useLayoutEffect(() => {
    chrome.setLineMeta(nodeId, { label, included });
  }, [chrome, included, label, nodeId]);

  return {
    targetProps: {
      ref: (el) => chrome.registerTarget(nodeId, el),
      "data-resume-line": nodeId,
      onPointerEnter: () => chrome.onTargetEnter(nodeId),
      onPointerLeave: chrome.onTargetLeave,
    },
    editProps: {
      onEditStart: () => chrome.onEditStart(nodeId),
      onEditEnd: () => chrome.onEditEnd(nodeId),
    },
    highlighted:
      chrome.editingId !== nodeId &&
      (chrome.activeId === nodeId || chrome.pinnedId === nodeId),
  };
}

function ToolbarIcon({
  disabled,
  label,
  onClick,
  children,
}: {
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      title={label}
      // Keep contenteditable focus until click — otherwise blur kills the float.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="flex size-6 cursor-pointer items-center justify-center rounded-sm text-[#6b7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
