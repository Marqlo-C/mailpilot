"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast, useSonner, type ToastT } from "sonner";

/**
 * Animation lifecycle phases matching MailPilot bottom flyouts:
 * - in: playing mp-flyout-pop (589ms)
 * - idle: fully presented
 * - out: playing mp-flyout-retract (1050ms)
 */
export type TactileToastPhase = "in" | "idle" | "out";

export type TactileToastType =
  | "normal"
  | "action"
  | "success"
  | "info"
  | "warning"
  | "error"
  | "loading"
  | "default";

export interface TactileToastRecord {
  id: string | number;
  title: ReactNode;
  description?: ReactNode;
  type: TactileToastType;
  icon?: ReactNode;
  action?: ToastT["action"];
  cancel?: ToastT["cancel"];
  duration?: number;
  phase: TactileToastPhase;
  createdAt: number;
}

const POP_DURATION_MS = 589;
const RETRACT_DURATION_MS = 1050;
const DEFAULT_LIFETIME_MS = 4000;

function resolveNode(node: unknown): ReactNode {
  if (typeof node === "function") {
    try {
      return (node as () => ReactNode)();
    } catch {
      return null;
    }
  }
  return node as ReactNode;
}

function getDuration(standardMs: number): number {
  if (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return 10;
  }
  return standardMs;
}

/**
 * Bridges Sonner's reactive state engine with MailPilot's custom bottom flyout
 * animations. Buffers exiting toasts so `mp-flyout-retract` (1050ms) can complete
 * before removing the DOM elements, manages auto-dismiss timeouts, and supports hover pause.
 */
export function useTactileToasts() {
  const { toasts: sonnerToasts } = useSonner();
  const [displayedToasts, setDisplayedToasts] = useState<TactileToastRecord[]>([]);
  const timersRef = useRef<Map<string | number, NodeJS.Timeout>>(new Map());
  const autoDismissTimersRef = useRef<Map<string | number, NodeJS.Timeout>>(new Map());
  const remainingTimeRef = useRef<Map<string | number, { remainingMs: number; startTime: number }>>(
    new Map()
  );
  const isPausedRef = useRef(false);

  const clearTimer = useCallback((id: string | number) => {
    const existing = timersRef.current.get(id);
    if (existing) {
      clearTimeout(existing);
      timersRef.current.delete(id);
    }
  }, []);

  const clearAutoTimer = useCallback((id: string | number) => {
    const existing = autoDismissTimersRef.current.get(id);
    if (existing) {
      clearTimeout(existing);
      autoDismissTimersRef.current.delete(id);
    }
    remainingTimeRef.current.delete(id);
  }, []);

  const completeExit = useCallback(
    (id: string | number) => {
      clearTimer(id);
      clearAutoTimer(id);
      setDisplayedToasts((prev) => prev.filter((item) => item.id !== id));
    },
    [clearTimer, clearAutoTimer]
  );

  const startExitTimer = useCallback(
    (id: string | number) => {
      clearTimer(id);
      clearAutoTimer(id);
      const timer = setTimeout(() => {
        completeExit(id);
      }, getDuration(RETRACT_DURATION_MS));
      timersRef.current.set(id, timer);
    },
    [clearTimer, clearAutoTimer, completeExit]
  );

  const dismissToast = useCallback(
    (id: string | number) => {
      toast.dismiss(id);
      setDisplayedToasts((prev) =>
        prev.map((item) => (item.id === id ? { ...item, phase: "out" } : item))
      );
      startExitTimer(id);
    },
    [startExitTimer]
  );

  const scheduleAutoDismiss = useCallback(
    (id: string | number, duration?: number) => {
      clearAutoTimer(id);
      if (duration === Infinity) return;
      const ms = duration ?? DEFAULT_LIFETIME_MS;
      remainingTimeRef.current.set(id, { remainingMs: ms, startTime: Date.now() });

      if (isPausedRef.current) return;

      const timer = setTimeout(() => {
        dismissToast(id);
      }, ms);
      autoDismissTimersRef.current.set(id, timer);
    },
    [clearAutoTimer, dismissToast]
  );

  const pauseAll = useCallback(() => {
    isPausedRef.current = true;
    const now = Date.now();
    for (const [id, entry] of remainingTimeRef.current.entries()) {
      const elapsed = now - entry.startTime;
      entry.remainingMs = Math.max(150, entry.remainingMs - elapsed);
      const activeTimer = autoDismissTimersRef.current.get(id);
      if (activeTimer) {
        clearTimeout(activeTimer);
        autoDismissTimersRef.current.delete(id);
      }
    }
  }, []);

  const resumeAll = useCallback(() => {
    isPausedRef.current = false;
    const now = Date.now();
    for (const [id, entry] of remainingTimeRef.current.entries()) {
      entry.startTime = now;
      const timer = setTimeout(() => {
        dismissToast(id);
      }, entry.remainingMs);
      autoDismissTimersRef.current.set(id, timer);
    }
  }, [dismissToast]);

  // Sync displayedToasts whenever Sonner's queue emits additions, updates, or removals
  useEffect(() => {
    const sonnerMap = new Map(sonnerToasts.map((t) => [t.id, t]));

    setDisplayedToasts((prev) => {
      const next: TactileToastRecord[] = [];
      const seen = new Set<string | number>();

      for (const item of prev) {
        const sonnerHit = sonnerMap.get(item.id);

        if (sonnerHit) {
          seen.add(item.id);
          // If already exiting, keep exiting unless re-triggered
          if (item.phase === "out") {
            next.push(item);
            continue;
          }

          const wasLoading = item.type === "loading";
          const isNowLoaded = (sonnerHit.type ?? "default") !== "loading";
          const updatedType = sonnerHit.type ?? "default";

          // If mutated in place from loading to success/error, start auto-dismiss timer
          if (wasLoading && isNowLoaded) {
            scheduleAutoDismiss(item.id, sonnerHit.duration);
          }

          // Update in place without restarting enter animation
          next.push({
            ...item,
            title: resolveNode(sonnerHit.title),
            description: resolveNode(sonnerHit.description),
            type: updatedType,
            icon: sonnerHit.icon,
            action: sonnerHit.action,
            cancel: sonnerHit.cancel,
            duration: sonnerHit.duration,
          });
        } else {
          // Toast removed in Sonner -> start retract animation
          if (item.phase !== "out") {
            startExitTimer(item.id);
            next.push({ ...item, phase: "out" });
          } else {
            next.push(item);
          }
        }
      }

      // Append brand-new incoming toasts
      for (const incoming of sonnerToasts) {
        if (!seen.has(incoming.id)) {
          const toastType = incoming.type ?? "default";
          const newRecord: TactileToastRecord = {
            id: incoming.id,
            title: resolveNode(incoming.title),
            description: resolveNode(incoming.description),
            type: toastType,
            icon: incoming.icon,
            action: incoming.action,
            cancel: incoming.cancel,
            duration: incoming.duration,
            phase: "in",
            createdAt: Date.now(),
          };

          clearTimer(incoming.id);
          const idleTimer = setTimeout(() => {
            setDisplayedToasts((curr) =>
              curr.map((t) =>
                t.id === incoming.id && t.phase === "in"
                  ? { ...t, phase: "idle" }
                  : t
              )
            );
          }, getDuration(POP_DURATION_MS));

          timersRef.current.set(incoming.id, idleTimer);

          if (toastType !== "loading") {
            scheduleAutoDismiss(incoming.id, incoming.duration);
          }

          next.push(newRecord);
        }
      }

      return next;
    });
  }, [sonnerToasts, clearTimer, startExitTimer, scheduleAutoDismiss]);

  // Clean up all timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    const autoTimers = autoDismissTimersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      for (const timer of autoTimers.values()) clearTimeout(timer);
      timers.clear();
      autoTimers.clear();
    };
  }, []);

  return {
    toasts: displayedToasts,
    dismissToast,
    completeExit,
    pauseAll,
    resumeAll,
  };
}
