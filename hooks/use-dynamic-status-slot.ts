"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useOptionalSyncStatus } from "@/components/layout/sync-status-provider";
import {
  useTactileToasts,
  type TactileToastRecord,
} from "@/hooks/use-tactile-toasts";

export type SlotMode = "idle" | "sync" | "toast" | "toast-over-sync";

export interface UseDynamicStatusSlotOptions {
  /** Toast dwell duration in ms before auto-dismiss (default: 3500) */
  toastDwellMs?: number;
  /** Roll transition animation duration in ms (default: 350) */
  rollDurationMs?: number;
}

export interface DynamicStatusSlotState {
  mode: SlotMode;
  activeToast: TactileToastRecord | null;
  isRolling: boolean;
  showSync: boolean;
  syncVisible: boolean;
  showToast: boolean;
  toastVisible: boolean;
  dismissActiveToast: () => void;
  dismissCurrentToast: () => void;
  pauseHover: () => void;
  resumeHover: () => void;
  hasActiveContent: boolean;
  queuedToastCount: number;
  syncStatus: ReturnType<typeof useOptionalSyncStatus>;
}

const DEFAULT_TOAST_DWELL_MS = 3500;
const DEFAULT_ROLL_DURATION_MS = 350;

/**
 * Controller hook for the bottom status slot. Unifies transient Sonner notifications
 * with persistent background sync telemetry via a vertical roll time-sharing state machine.
 */
export function useDynamicStatusSlot(
  options?: UseDynamicStatusSlotOptions
): DynamicStatusSlotState {
  const toastDwellMs = options?.toastDwellMs ?? DEFAULT_TOAST_DWELL_MS;
  const rollDurationMs = options?.rollDurationMs ?? DEFAULT_ROLL_DURATION_MS;

  const syncStatus = useOptionalSyncStatus();
  const { toasts, dismissToast } = useTactileToasts({ autoDismiss: false });

  const [activeToast, setActiveToast] = useState<TactileToastRecord | null>(null);
  const [isRolling, setIsRolling] = useState(false);

  const activeToastRef = useRef<TactileToastRecord | null>(null);
  useLayoutEffect(() => {
    activeToastRef.current = activeToast;
  }, [activeToast]);

  const dismissedIdsRef = useRef<Set<string | number>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string | number>>(
    () => new Set()
  );
  const rollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dwellTimerRef = useRef<NodeJS.Timeout | null>(null);
  const remainingTimeRef = useRef<{ remainingMs: number; startTime: number } | null>(null);
  const isPausedRef = useRef(false);

  const isSyncActive = Boolean(syncStatus?.isSyncing || syncStatus?.justFinished);

  const triggerRoll = useCallback(() => {
    setIsRolling(true);
    if (rollTimerRef.current) clearTimeout(rollTimerRef.current);
    rollTimerRef.current = setTimeout(() => {
      setIsRolling(false);
      rollTimerRef.current = null;
    }, rollDurationMs);
  }, [rollDurationMs]);

  const clearDwellTimer = useCallback(() => {
    if (dwellTimerRef.current) {
      clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = null;
    }
    remainingTimeRef.current = null;
  }, []);

  const dismissActiveToast = useCallback(() => {
    const current = activeToastRef.current;
    if (!current) return;

    clearDwellTimer();
    dismissedIdsRef.current.add(current.id);
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(current.id);
      return next;
    });
    dismissToast(current.id);

    const nextPending = toasts.filter(
      (t) => !dismissedIdsRef.current.has(t.id) && t.id !== current.id && t.phase !== "out"
    );

    triggerRoll();
    setActiveToast(nextPending.length > 0 ? nextPending[0] : null);
  }, [clearDwellTimer, dismissToast, toasts, triggerRoll]);

  const scheduleDwellTimer = useCallback(
    (toastItem: TactileToastRecord) => {
      clearDwellTimer();
      if (toastItem.type === "loading") return;

      const duration = toastItem.duration ?? toastDwellMs;
      if (duration === Infinity) return;

      const ms = Math.max(100, duration);
      remainingTimeRef.current = { remainingMs: ms, startTime: Date.now() };

      if (isPausedRef.current) return;
      dwellTimerRef.current = setTimeout(() => dismissActiveToast(), ms);
    },
    [clearDwellTimer, toastDwellMs, dismissActiveToast]
  );

  const pauseHover = useCallback(() => {
    isPausedRef.current = true;
    if (dwellTimerRef.current && remainingTimeRef.current) {
      clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = null;
      const elapsed = Date.now() - remainingTimeRef.current.startTime;
      remainingTimeRef.current.remainingMs = Math.max(150, remainingTimeRef.current.remainingMs - elapsed);
    }
  }, []);

  const resumeHover = useCallback(() => {
    isPausedRef.current = false;
    if (remainingTimeRef.current && activeToastRef.current) {
      remainingTimeRef.current.startTime = Date.now();
      dwellTimerRef.current = setTimeout(() => dismissActiveToast(), remainingTimeRef.current.remainingMs);
    }
  }, [dismissActiveToast]);

  useEffect(() => {
    const currentToastIds = new Set(toasts.map((t) => t.id));
    for (const id of dismissedIdsRef.current) {
      if (!currentToastIds.has(id)) dismissedIdsRef.current.delete(id);
    }

    const pending = toasts.filter(
      (t) => !dismissedIdsRef.current.has(t.id) && t.phase !== "out"
    );
    const currentActive = activeToastRef.current;

    if (!currentActive) {
      if (pending.length > 0) {
        setActiveToast(pending[0]);
        triggerRoll();
        scheduleDwellTimer(pending[0]);
      }
      return;
    }

    const matching = pending.find((t) => t.id === currentActive.id);
    if (matching) {
      const wasLoading = currentActive.type === "loading";
      const isNowLoaded = matching.type !== "loading";
      setActiveToast(matching);
      if (wasLoading && isNowLoaded) scheduleDwellTimer(matching);
    } else {
      if (pending.length > 0) {
        setActiveToast(pending[0]);
        triggerRoll();
        scheduleDwellTimer(pending[0]);
      } else {
        setActiveToast(null);
        if (isSyncActive) triggerRoll();
        clearDwellTimer();
      }
    }
  }, [toasts, isSyncActive, triggerRoll, scheduleDwellTimer, clearDwellTimer]);

  useEffect(() => {
    return () => {
      if (rollTimerRef.current) clearTimeout(rollTimerRef.current);
      if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
    };
  }, []);

  let mode: SlotMode = "idle";
  if (activeToast) {
    mode = isSyncActive ? "toast-over-sync" : "toast";
  } else if (isSyncActive) {
    mode = "sync";
  }

  const showSync = mode === "sync";
  const showToast = mode === "toast" || mode === "toast-over-sync";
  const [prevToasts, setPrevToasts] = useState(toasts);
  if (prevToasts !== toasts) {
    setPrevToasts(toasts);
    const currentToastIds = new Set(toasts.map((t) => t.id));
    let changed = false;
    for (const id of dismissedIds) {
      if (!currentToastIds.has(id)) {
        changed = true;
        break;
      }
    }
    if (changed) {
      const next = new Set<string | number>();
      for (const id of dismissedIds) {
        if (currentToastIds.has(id)) next.add(id);
      }
      setDismissedIds(next);
    }
  }

  const candidateCount = toasts.filter(
    (t) => !dismissedIds.has(t.id) && t.phase !== "out"
  ).length;

  return {
    mode,
    activeToast,
    isRolling,
    showSync,
    syncVisible: showSync,
    showToast,
    toastVisible: showToast,
    dismissActiveToast,
    dismissCurrentToast: dismissActiveToast,
    pauseHover,
    resumeHover,
    hasActiveContent: mode !== "idle",
    queuedToastCount: Math.max(0, candidateCount - (activeToast ? 1 : 0)),
    syncStatus,
  };
}
