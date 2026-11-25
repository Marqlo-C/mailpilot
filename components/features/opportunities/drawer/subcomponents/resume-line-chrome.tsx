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

import { cn } from "@/lib/utils";

/** Same beat as sidebar telemetry dwell — skim past a neighbor without stealing. */
const SWITCH_DWELL_MS = 180;
const CLOSE_DELAY_MS = 180;
/** Floating chip height (size-6 buttons + padding) — keep in sync with the portal. */
const CHIP_H = 28;
/** Approx chip width for centering (± / move / Ace cluster). */
const CHIP_W = 144;
/** Clear air between chip and line box (no glyph overlap). */
const CHIP_GAP = 6;
const VIEWPORT_PAD = 8;
/**
 * Resume body lines are ~12px / 1.35 — taller than this ⇒ wrapped block.
 * Wrapped: pin to the leading edge; single-line: center above the line.
 */
const SINGLE_LINE_MAX_PX = 26;

function placeLineToolbar(anchor: {
  top: number;
  left: number;
  width: number;
  height: number;
}): { top: number; left: number } {
  const viewportW =
    typeof window !== "undefined" ? window.innerWidth : anchor.left + CHIP_W;
  const viewportH =
    typeof window !== "undefined" ? window.innerHeight : anchor.top + CHIP_H;

  const aboveTop = anchor.top - CHIP_H - CHIP_GAP;
  const belowTop = anchor.top + anchor.height + CHIP_GAP;
  const top =
    aboveTop >= VIEWPORT_PAD
      ? aboveTop
      : Math.min(belowTop, viewportH - CHIP_H - VIEWPORT_PAD);

  const wrapped = anchor.height > SINGLE_LINE_MAX_PX;
  const idealLeft = wrapped
    ? anchor.left
    : anchor.left + anchor.width / 2 - CHIP_W / 2;
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
    const { overflowY } = getComputedStyle(node);
    if (
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Keep `el` on the same viewport row after pane grow / Fit zoom by adjusting
 * the nearest scroll parent (not window) — matches where the user clicked.
 */
function pinElementToViewportRow(el: HTMLElement, desiredTop: number) {
  const parent = nearestScrollParent(el);
  const delta = el.getBoundingClientRect().top - desiredTop;
  if (Math.abs(delta) < 0.5) return;
  if (parent) {
    parent.scrollTop += delta;
    return;
  }
  window.scrollBy(0, delta);
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
  const targetRefs = useRef(new Map<string, HTMLElement>());
  const metaRef = useRef(new Map<string, LineMeta>());
  const closeTimerRef = useRef<number | null>(null);
  const switchTimerRef = useRef<number | null>(null);
  const restoreTimerRef = useRef<number | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  /** Viewport Y of the line at edit start — restore across pane grow / Fit. */
  const editPinTopRef = useRef<number | null>(null);

  activeIdRef.current = activeId;
  editingIdRef.current = editingId;

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
    const rect = el.getBoundingClientRect();
    setAnchor({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
    setActiveMeta(metaRef.current.get(nodeId) ?? null);
  }, []);

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
      const el = targetRefs.current.get(nodeId);
      // Capture before pane grow / Fit so we can pin this row afterward.
      editPinTopRef.current = el?.getBoundingClientRect().top ?? null;
      setEditingId(nodeId);
      setActiveId(nodeId);
      measure(nodeId);
    },
    [measure]
  );

  const onEditEnd = useCallback(
    (nodeId: string) => {
      editPinTopRef.current = null;
      setEditingId((current) => (current === nodeId ? null : current));
      dismissToolbar();
      restoreToolbarIfHovered(nodeId);
    },
    [dismissToolbar, restoreToolbarIfHovered]
  );

  useEffect(() => {
    const track = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener("pointermove", track, { passive: true });
    return () => window.removeEventListener("pointermove", track);
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
      const pinTop = editPinTopRef.current;
      if (line && pinTop !== null && editingIdRef.current === activeId) {
        pinElementToViewportRow(line, pinTop);
      }
      measure(activeId);
    };
    const el = targetRefs.current.get(activeId);

    // Pane expand (edit-mode grow) moves the line in viewport without a
    // window resize — observe the line + ancestors through the draft root.
    const resizeObserver = new ResizeObserver(syncPinAndFloat);
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

    // Edit-mode pane grow + Fit zoom settle over a few frames — chase briefly.
    let raf = 0;
    let frames = 0;
    const chase = () => {
      syncPinAndFloat();
      frames += 1;
      if (frames < 24) raf = requestAnimationFrame(chase);
    };
    raf = requestAnimationFrame(chase);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("scroll", syncFloat, true);
      window.removeEventListener("resize", syncPinAndFloat);
      cancelAnimationFrame(raf);
    };
  }, [activeId, editingId, measure]);

  useEffect(
    () => () => {
      clearTimer(closeTimerRef);
      clearTimer(switchTimerRef);
      clearTimer(restoreTimerRef);
    },
    []
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
            onPointerEnter={() => clearTimer(closeTimerRef)}
            onPointerLeave={onToolbarLeave}
            className="pointer-events-auto fixed z-[200]"
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
