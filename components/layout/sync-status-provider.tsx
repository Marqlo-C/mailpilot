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

import { forceResetSyncStatus } from "@/app/actions/email";
import { SYNC_LOCK_STALE_MS } from "@/lib/constants";
import { startSyncStatusBackoffPoll } from "@/lib/sync-status-poll";

export const SYNC_STARTED_EVENT = "mailpilot:sync-started";

type SyncStatusContextValue = {
  accountId: string | null;
  isSyncing: boolean;
  pendingCount: number;
  justFinished: boolean;
  showForceReset: boolean;
  markSyncStarted: () => void;
  markSyncFailed: () => void;
  forceReset: () => Promise<void>;
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
  const [justFinished, setJustFinished] = useState(false);
  const [showForceReset, setShowForceReset] = useState(false);
  const disposePollRef = useRef<(() => void) | null>(null);
  const wasSyncingRef = useRef(initialIsSyncing);

  useEffect(() => {
    setIsSyncing(initialIsSyncing);
    setPendingCount(initialPendingClassificationCount);
    wasSyncingRef.current = initialIsSyncing;
    if (!initialIsSyncing) {
      setShowForceReset(false);
    }
  }, [accountId, initialIsSyncing, initialPendingClassificationCount]);

  const markSyncStarted = useCallback(() => {
    wasSyncingRef.current = true;
    setShowForceReset(false);
    setJustFinished(false);
    setIsSyncing(true);
  }, []);

  const markSyncFailed = useCallback(() => {
    wasSyncingRef.current = false;
    setIsSyncing(false);
    setShowForceReset(false);
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
      initialMs: 3000,
      maxMs: 20_000,
      hardStopMs: SYNC_LOCK_STALE_MS,
      slowAfterMs: 120_000,
      onSlow: () => setShowForceReset(true),
      onHardStop: () => {
        wasSyncingRef.current = false;
        setIsSyncing(false);
        setShowForceReset(false);
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
              return "stop";
            }
            return "continue";
          }

          consecutiveErrors = 0;
          const data = (await res.json()) as {
            isSyncing?: boolean;
            pendingClassificationCount?: number;
          };

          if (typeof data.pendingClassificationCount === "number") {
            setPendingCount(data.pendingClassificationCount);
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
            router.refresh();
          } else {
            setIsSyncing(false);
          }
          return "stop";
        } catch (err) {
          console.error("Sync poll error:", err);
          consecutiveErrors += 1;
          if (consecutiveErrors >= 4) {
            wasSyncingRef.current = false;
            setIsSyncing(false);
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

  const forceReset = useCallback(async () => {
    disposePollRef.current?.();
    disposePollRef.current = null;
    wasSyncingRef.current = false;
    setIsSyncing(false);
    setShowForceReset(false);
    setJustFinished(false);
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
      justFinished,
      showForceReset,
      markSyncStarted,
      markSyncFailed,
      forceReset,
    }),
    [
      accountId,
      isSyncing,
      pendingCount,
      justFinished,
      showForceReset,
      markSyncStarted,
      markSyncFailed,
      forceReset,
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
