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

import { ResumeLineFloatToolbar } from "@/components/features/opportunities/drawer/subcomponents/resume-line-float-toolbar";
import { editableAnchorRect } from "@/components/features/opportunities/drawer/subcomponents/resume-line-measure";
import { useResumeEditPin } from "@/hooks/use-resume-edit-pin";

/** Same beat as sidebar telemetry dwell — skim past a neighbor without stealing. */
const SWITCH_DWELL_MS = 180;
const CLOSE_DELAY_MS = 180;

export type ResumeLineMeta = { label: string; included: boolean };

type ResumeLineChromeContextValue = {
  disabled?: boolean;
  activeId: string | null;
  editingId: string | null;
  /** Stays highlighted while rewrite popover is open (not hover-dependent). */
  pinnedId: string | null;
  registerTarget: (nodeId: string, el: HTMLElement | null) => void;
  setLineMeta: (nodeId: string, meta: ResumeLineMeta) => void;
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
  const [activeMeta, setActiveMeta] = useState<ResumeLineMeta | null>(null);

  const activeIdRef = useRef<string | null>(null);
  const editingIdRef = useRef<string | null>(null);
  const chromeQuietUntilRef = useRef(0);
  const targetRefs = useRef(new Map<string, HTMLElement>());
  const metaRef = useRef(new Map<string, ResumeLineMeta>());
  const closeTimerRef = useRef<number | null>(null);
  const switchTimerRef = useRef<number | null>(null);

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
    const rect = editableAnchorRect(el);
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

  const pin = useResumeEditPin({
    targetRefs,
    editingIdRef,
    pinnedId,
    activeId,
    measure,
    setActiveId,
    setEditingId,
    dismissToolbar,
  });

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

  const scheduleClose = useCallback(() => {
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

  const setLineMeta = useCallback((nodeId: string, meta: ResumeLineMeta) => {
    metaRef.current.set(nodeId, meta);
    if (activeIdRef.current === nodeId) setActiveMeta(meta);
  }, []);

  const { onEditStart: pinEditStart, onEditEnd: pinEditEnd } = pin;

  const onEditStart = useCallback(
    (nodeId: string) => {
      clearTimer(closeTimerRef);
      clearTimer(switchTimerRef);
      // Match prior post-blur hush window used with restoreToolbarIfHovered.
      chromeQuietUntilRef.current = Date.now() + 250;
      pinEditStart(nodeId);
    },
    [pinEditStart]
  );

  const onEditEnd = useCallback(
    (nodeId: string) => {
      chromeQuietUntilRef.current = Date.now() + 250;
      pinEditEnd(nodeId);
    },
    [pinEditEnd]
  );

  // Ace pin: hush hover timers so the float stays on the refined line.
  useEffect(() => {
    if (!pinnedId) return;
    clearTimer(closeTimerRef);
    clearTimer(switchTimerRef);
  }, [pinnedId]);

  useLayoutEffect(() => {
    if (!activeId) return;
    measure(activeId);
  }, [activeId, editingId, measure]);

  // Float follows layout while a line is active (no pin/settle).
  useEffect(() => {
    if (!activeId) return;
    const syncFloat = () => measure(activeId);
    const el = targetRefs.current.get(activeId);
    const resizeObserver = new ResizeObserver(syncFloat);
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
    window.addEventListener("resize", syncFloat);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("scroll", syncFloat, true);
      window.removeEventListener("resize", syncFloat);
    };
  }, [activeId, editingId, measure]);

  useEffect(
    () => () => {
      clearTimer(closeTimerRef);
      clearTimer(switchTimerRef);
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

  return (
    <ResumeLineChromeContext.Provider value={ctx}>
      {children}
      {activeId && anchor ? (
        <ResumeLineFloatToolbar
          activeId={activeId}
          anchor={anchor}
          meta={activeMeta}
          disabled={disabled}
          onToggle={onToggle}
          onMove={onMove}
          onRefineOpen={onRefineOpen}
          onPointerEnter={() => clearTimer(closeTimerRef)}
          onPointerLeave={onToolbarLeave}
        />
      ) : null}
    </ResumeLineChromeContext.Provider>
  );
}

/**
 * Bind a draft node to the shared floating toolbar (hover target + edit hooks).
 */
export function useResumeLineTarget(
  nodeId: string,
  meta: ResumeLineMeta
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
