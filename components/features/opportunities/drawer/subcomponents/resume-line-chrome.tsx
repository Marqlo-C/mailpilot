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

/**
 * Shared floating ± / move / refine chrome for every resume draft line.
 * Preview text stays export-identical — controls live in a body portal.
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

  activeIdRef.current = activeId;
  editingIdRef.current = editingId;

  const chromeIsQuiet = useCallback(
    () =>
      editingIdRef.current !== null || Date.now() < chromeQuietUntilRef.current,
    []
  );

  const measure = useCallback((nodeId: string) => {
    const el = targetRefs.current.get(nodeId);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setAnchor({ top: rect.top, left: rect.left, width: rect.width });
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
      if (chromeIsQuiet()) return;
      clearTimer(closeTimerRef);
      clearTimer(switchTimerRef);
      setActiveId(nodeId);
      measure(nodeId);
    },
    [chromeIsQuiet, measure]
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
      if (chromeIsQuiet()) return;
      clearTimer(closeTimerRef);
      clearTimer(switchTimerRef);
      if (activeIdRef.current === nodeId) {
        measure(nodeId);
        return;
      }
      switchTimerRef.current = window.setTimeout(() => {
        switchTimerRef.current = null;
        if (chromeIsQuiet()) return;
        setActiveId(nodeId);
        measure(nodeId);
      }, SWITCH_DWELL_MS);
    },
    [chromeIsQuiet, measure]
  );

  const onTargetEnter = useCallback(
    (nodeId: string) => {
      if (chromeIsQuiet()) return;
      clearTimer(closeTimerRef);
      if (activeIdRef.current === null || activeIdRef.current === nodeId) {
        armNow(nodeId);
        return;
      }
      scheduleSwitch(nodeId);
    },
    [armNow, chromeIsQuiet, scheduleSwitch]
  );

  const onTargetLeave = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
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
      setEditingId(nodeId);
      dismissToolbar();
    },
    [dismissToolbar]
  );

  const onEditEnd = useCallback(
    (nodeId: string) => {
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
  }, [activeId, measure]);

  useEffect(() => {
    if (!activeId) return;
    const sync = () => measure(activeId);
    window.addEventListener("scroll", sync, true);
    window.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("scroll", sync, true);
      window.removeEventListener("resize", sync);
    };
  }, [activeId, measure]);

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

  const CHIP_H = 28;
  const shellTop = anchor ? Math.max(8, anchor.top - CHIP_H + 10) : 0;
  const shellLeft = anchor
    ? Math.min(
        Math.max(8, anchor.left + Math.min(anchor.width, 160) / 2 - 72),
        typeof window !== "undefined" ? window.innerWidth - 152 : 8
      )
    : 0;

  const included = activeMeta?.included ?? true;
  const label = activeMeta?.label ?? "line";

  const toolbar =
    typeof document !== "undefined" && activeId && anchor && !editingId
      ? createPortal(
          <div
            ref={toolbarRef}
            data-resume-line-toolbar=""
            onPointerEnter={() => clearTimer(closeTimerRef)}
            onPointerLeave={onToolbarLeave}
            className="pointer-events-auto fixed z-[200]"
            style={{ top: shellTop, left: shellLeft }}
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
      onClick={onClick}
      className="flex size-6 cursor-pointer items-center justify-center rounded-sm text-[#6b7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
