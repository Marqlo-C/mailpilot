"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";

/** Brief pause so a fly-by doesn't open the menu. */
export const SIDEBAR_FLYOUT_OPEN_DELAY_MS = 500;
export const SIDEBAR_FLYOUT_CLOSE_DELAY_MS = 180;
/**
 * Collapsed tab menu's bridge covers the status edge. A short dwell lets a
 * pass-through to the tabs keep going, and a pause on the edge opens status.
 */
/** Dwell on the Job Radar status capsule before opening telemetry. */
export const SIDEBAR_TELEMETRY_OPEN_DELAY_MS = 180;

export type SidebarFlyoutId =
  | { kind: "nav"; href: string }
  | { kind: "telemetry" }
  | { kind: "keys" }
  | { kind: "resume" }
  | { kind: "ollama" };

type SidebarFlyoutContextValue = {
  open: SidebarFlyoutId | null;
  /** Click-pinned quick actions stay until another flyout, outside click, or Escape. */
  pinned: boolean;
  isOpen: (id: SidebarFlyoutId) => boolean;
  /** Open immediately. Quick-action clicks pin; hover paths do not. */
  openNow: (id: SidebarFlyoutId, options?: { pin?: boolean }) => void;
  /** Toggle a clickable flyout. Pins when opening. */
  togglePinned: (id: SidebarFlyoutId) => void;
  scheduleOpen: (id: SidebarFlyoutId, delayMs?: number) => void;
  scheduleClose: (delayMs?: number) => void;
  cancelScheduledOpen: () => void;
  cancelScheduledClose: () => void;
  closeNow: () => void;
};

const SidebarFlyoutContext = createContext<SidebarFlyoutContextValue | null>(
  null
);

function sameFlyout(
  a: SidebarFlyoutId | null,
  b: SidebarFlyoutId | null
): boolean {
  if (a == null || b == null) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === "nav" && b.kind === "nav") return a.href === b.href;
  return true;
}

function clearTimer(timerRef: MutableRefObject<number | null>) {
  if (timerRef.current === null) return;
  window.clearTimeout(timerRef.current);
  timerRef.current = null;
}

export function SidebarFlyoutProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<SidebarFlyoutId | null>(null);
  const [pinned, setPinned] = useState(false);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const pinnedRef = useRef(false);
  pinnedRef.current = pinned;

  const closeNow = useCallback(() => {
    clearTimer(openTimerRef);
    clearTimer(closeTimerRef);
    setPinned(false);
    setOpen(null);
  }, []);

  const openNow = useCallback(
    (id: SidebarFlyoutId, options?: { pin?: boolean }) => {
      clearTimer(openTimerRef);
      clearTimer(closeTimerRef);
      setPinned(Boolean(options?.pin));
      setOpen(id);
    },
    []
  );

  const togglePinned = useCallback((id: SidebarFlyoutId) => {
    clearTimer(openTimerRef);
    clearTimer(closeTimerRef);
    setOpen((current) => {
      if (sameFlyout(current, id)) {
        if (pinnedRef.current) {
          setPinned(false);
          return null;
        }
        // Already open from hover — pin it so leaving the row keeps it.
        setPinned(true);
        return current;
      }
      setPinned(true);
      return id;
    });
  }, []);

  const scheduleOpen = useCallback(
    (id: SidebarFlyoutId, delayMs = SIDEBAR_FLYOUT_OPEN_DELAY_MS) => {
      clearTimer(closeTimerRef);
      clearTimer(openTimerRef);
      openTimerRef.current = window.setTimeout(() => {
        openTimerRef.current = null;
        // Hovering another source replaces a click-pinned flyout.
        setPinned(false);
        setOpen(id);
      }, delayMs);
    },
    []
  );

  const scheduleClose = useCallback(
    (delayMs = SIDEBAR_FLYOUT_CLOSE_DELAY_MS) => {
      clearTimer(openTimerRef);
      clearTimer(closeTimerRef);
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        if (pinnedRef.current) return;
        setOpen(null);
      }, delayMs);
    },
    []
  );

  const cancelScheduledOpen = useCallback(() => {
    clearTimer(openTimerRef);
  }, []);

  const cancelScheduledClose = useCallback(() => {
    clearTimer(closeTimerRef);
  }, []);

  const isOpen = useCallback(
    (id: SidebarFlyoutId) => sameFlyout(open, id),
    [open]
  );

  useEffect(() => {
    return () => {
      clearTimer(openTimerRef);
      clearTimer(closeTimerRef);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest(
          "[data-sidebar-tab-menu], [data-sidebar-quick-flyout], [data-sidebar-flyout], [data-telemetry-edge], [data-radix-popper-content-wrapper], [role='menu']"
        )
      ) {
        return;
      }
      closeNow();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeNow();
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, closeNow]);

  const value = useMemo<SidebarFlyoutContextValue>(
    () => ({
      open,
      pinned,
      isOpen,
      openNow,
      togglePinned,
      scheduleOpen,
      scheduleClose,
      cancelScheduledOpen,
      cancelScheduledClose,
      closeNow,
    }),
    [
      open,
      pinned,
      isOpen,
      openNow,
      togglePinned,
      scheduleOpen,
      scheduleClose,
      cancelScheduledOpen,
      cancelScheduledClose,
      closeNow,
    ]
  );

  return (
    <SidebarFlyoutContext.Provider value={value}>
      {children}
    </SidebarFlyoutContext.Provider>
  );
}

export function useSidebarFlyout() {
  const ctx = useContext(SidebarFlyoutContext);
  if (!ctx) {
    throw new Error("useSidebarFlyout must be used within SidebarFlyoutProvider");
  }
  return ctx;
}
