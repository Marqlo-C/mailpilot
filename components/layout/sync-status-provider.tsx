"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import {
  flushPendingAiMessages,
  forceResetSyncStatus,
} from "@/app/actions/email";
import { toast } from "sonner";
import { SYNC_LOCK_STALE_MS } from "@/lib/constants";
import { startSyncStatusBackoffPoll } from "@/lib/sync-status-poll";

export const SYNC_STARTED_EVENT = "mailpilot:sync-started";

type SyncStatusContextValue = {
  accountId: string | null;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncProcessed: number | null;
  totalToProcess: number | null;
  justFinished: boolean;
  showForceReset: boolean;
  markSyncStarted: () => void;
  markSyncFailed: () => void;
  forceReset: () => Promise<void>;
  flushPendingClassification: () => Promise<boolean>;
};

const SyncStatusContext = createContext<SyncStatusContextValue | null>(null);

type SyncStatusProviderProps = {
  accountId: string | null;
  initialIsSyncing?: boolean;
  initialPendingClassificationCount?: number;
  children: ReactNode;
};

/**
 * Single source of truth for background sync UI state.
 * Owns the only /api/account/sync-status poller while isSyncing.
 */
export function SyncStatusProvider({
  accountId,
  initialIsSyncing = false,
  initialPendingClassificationCount = 0,
  children,
}: SyncStatusProviderProps) {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(initialIsSyncing);
  const [pendingCount, setPendingCount] = useState(
    initialPendingClassificationCount
  );
  const [lastSyncProcessed, setLastSyncProcessed] = useState<number | null>(
    null
  );
  const [totalToProcess, setTotalToProcess] = useState<number | null>(null);
  const [justFinished, setJustFinished] = useState(false);
  const [showForceReset, setShowForceReset] = useState(false);
  const disposePollRef = useRef<(() => void) | null>(null);
  const wasSyncingRef = useRef(initialIsSyncing);
  const pendingCountRef = useRef(initialPendingClassificationCount);
  pendingCountRef.current = pendingCount;

  useEffect(() => {
    setIsSyncing(initialIsSyncing);
    setPendingCount(initialPendingClassificationCount);
    wasSyncingRef.current = initialIsSyncing;
    if (!initialIsSyncing) {
      setShowForceReset(false);
      setLastSyncProcessed(null);
      setTotalToProcess(null);
    }
  }, [accountId, initialIsSyncing, initialPendingClassificationCount]);

  const markSyncStarted = useCallback(() => {
    wasSyncingRef.current = true;
    setShowForceReset(false);
    setJustFinished(false);
    setIsSyncing(true);
    setLastSyncProcessed(0);
    setTotalToProcess(
      pendingCountRef.current > 0 ? pendingCountRef.current : null
    );
  }, []);

  const markSyncFailed = useCallback(() => {
    wasSyncingRef.current = false;
    setIsSyncing(false);
    setShowForceReset(false);
    setLastSyncProcessed(null);
    setTotalToProcess(null);
  }, []);

  useEffect(() => {
    function handleSyncStart() {
      markSyncStarted();
    }
    window.addEventListener(SYNC_STARTED_EVENT, handleSyncStart);
    return () => window.removeEventListener(SYNC_STARTED_EVENT, handleSyncStart);
  }, [markSyncStarted]);

  useEffect(() => {
    if (!accountId || !isSyncing) {
      disposePollRef.current?.();
      disposePollRef.current = null;
      return;
    }

    setShowForceReset(false);
    let consecutiveErrors = 0;

    disposePollRef.current = startSyncStatusBackoffPoll({
      initialMs: 1500,
      maxMs: 5000,
      hardStopMs: SYNC_LOCK_STALE_MS,
      slowAfterMs: 120_000,
      onSlow: () => setShowForceReset(true),
      onHardStop: () => {
        wasSyncingRef.current = false;
        setIsSyncing(false);
        setShowForceReset(false);
        setLastSyncProcessed(null);
        setTotalToProcess(null);
      },
      onTick: async () => {
        try {
          const res = await fetch("/api/account/sync-status", {
            cache: "no-store",
          });
          if (!res.ok) {
            consecutiveErrors += 1;
            if (consecutiveErrors >= 4) {
              wasSyncingRef.current = false;
              setIsSyncing(false);
              setLastSyncProcessed(null);
              setTotalToProcess(null);
              return "stop";
            }
            return "continue";
          }

          consecutiveErrors = 0;
          const data = (await res.json()) as {
            isSyncing?: boolean;
            pendingClassificationCount?: number;
            lastSyncProcessed?: number | null;
            syncTotal?: number | null;
          };

          if (typeof data.pendingClassificationCount === "number") {
            setPendingCount(data.pendingClassificationCount);
          }

          if (typeof data.lastSyncProcessed === "number") {
            setLastSyncProcessed(data.lastSyncProcessed);
          }

          if (typeof data.syncTotal === "number" && data.syncTotal > 0) {
            setTotalToProcess(data.syncTotal);
          } else if (typeof data.lastSyncProcessed === "number") {
            setTotalToProcess((prev) => {
              if (prev !== null) return prev;
              if (
                typeof data.pendingClassificationCount === "number" &&
                data.pendingClassificationCount > 0
              ) {
                return Math.max(
                  data.pendingClassificationCount,
                  data.lastSyncProcessed ?? 0
                );
              }
              return null;
            });
          }

          if (data.isSyncing) {
            wasSyncingRef.current = true;
            return "continue";
          }

          if (wasSyncingRef.current) {
            wasSyncingRef.current = false;
            setIsSyncing(false);
            setShowForceReset(false);
            setJustFinished(true);
            setLastSyncProcessed(null);
            setTotalToProcess(null);
            router.refresh();
          } else {
            setIsSyncing(false);
            setLastSyncProcessed(null);
            setTotalToProcess(null);
          }
          return "stop";
        } catch (err) {
          console.error("Sync poll error:", err);
          consecutiveErrors += 1;
          if (consecutiveErrors >= 4) {
            wasSyncingRef.current = false;
            setIsSyncing(false);
            setLastSyncProcessed(null);
            setTotalToProcess(null);
            return "stop";
          }
          return "continue";
        }
      },
    });

    return () => {
      disposePollRef.current?.();
      disposePollRef.current = null;
    };
  }, [accountId, isSyncing, router]);

  useEffect(() => {
    if (!justFinished) return;
    const timer = setTimeout(() => setJustFinished(false), 3500);
    return () => clearTimeout(timer);
  }, [justFinished]);

  const flushPendingClassification = useCallback(async () => {
    if (!accountId) return false;
    const previous = pendingCountRef.current;
    setPendingCount(0);
    const result = await flushPendingAiMessages(accountId);
    if (!result.ok) {
      setPendingCount(previous);
      toast.error(result.error);
      return false;
    }
    router.refresh();
    return true;
  }, [accountId, router]);

  const forceReset = useCallback(async () => {
    disposePollRef.current?.();
    disposePollRef.current = null;
    wasSyncingRef.current = false;
    setIsSyncing(false);
    setShowForceReset(false);
    setJustFinished(false);
    setLastSyncProcessed(null);
    setTotalToProcess(null);
    try {
      await forceResetSyncStatus();
    } catch (error) {
      console.error("forceResetSyncStatus failed", error);
    }
    router.refresh();
  }, [router]);

  const value = useMemo(
    () => ({
      accountId,
      isSyncing,
      pendingCount,
      lastSyncProcessed,
      totalToProcess,
      justFinished,
      showForceReset,
      markSyncStarted,
      markSyncFailed,
      forceReset,
      flushPendingClassification,
    }),
    [
      accountId,
      isSyncing,
      pendingCount,
      lastSyncProcessed,
      totalToProcess,
      justFinished,
      showForceReset,
      markSyncStarted,
      markSyncFailed,
      forceReset,
      flushPendingClassification,
    ]
  );

  return (
    <SyncStatusContext.Provider value={value}>
      {children}
    </SyncStatusContext.Provider>
  );
}

export function useSyncStatus(): SyncStatusContextValue {
  const ctx = useContext(SyncStatusContext);
  if (!ctx) {
    throw new Error("useSyncStatus must be used within SyncStatusProvider");
  }
  return ctx;
}
