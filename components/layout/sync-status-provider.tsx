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
import { SYNC_LOCK_STALE_MS } from "@/lib/core/constants";
import { startSyncStatusBackoffPoll } from "@/lib/gmail/sync-status-poll";
import {
  parseSyncKind,
  type SyncKind,
} from "@/lib/opportunities/sync/kinds";

export const SYNC_STARTED_EVENT = "mailpilot:sync-started";

export type SyncStartedDetail = {
  kind?: SyncKind;
};

type SyncStatusContextValue = {
  accountId: string | null;
  isSyncing: boolean;
  syncKind: SyncKind | null;
  pendingCount: number;
  lastSyncProcessed: number | null;
  totalToProcess: number | null;
  lastSyncPendingProcessed: number | null;
  syncPendingTotal: number | null;
  opportunitiesAdded: number | null;
  justFinished: boolean;
  showForceReset: boolean;
  markSyncStarted: (kind?: SyncKind) => void;
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
  const [syncKind, setSyncKind] = useState<SyncKind | null>(null);
  const [pendingCount, setPendingCount] = useState(
    initialPendingClassificationCount
  );
  const [lastSyncProcessed, setLastSyncProcessed] = useState<number | null>(
    null
  );
  const [totalToProcess, setTotalToProcess] = useState<number | null>(null);
  const [lastSyncPendingProcessed, setLastSyncPendingProcessed] = useState<
    number | null
  >(null);
  const [syncPendingTotal, setSyncPendingTotal] = useState<number | null>(null);
  const [opportunitiesAdded, setOpportunitiesAdded] = useState<number | null>(null);
  const [justFinished, setJustFinished] = useState(false);
  const [showForceReset, setShowForceReset] = useState(false);
  const disposePollRef = useRef<(() => void) | null>(null);
  const wasSyncingRef = useRef(initialIsSyncing);
  const syncKindRef = useRef<SyncKind | null>(null);
  const pendingCountRef = useRef(initialPendingClassificationCount);
  pendingCountRef.current = pendingCount;

  const clearProgress = useCallback((options?: { preserveOpportunities?: boolean }) => {
    setLastSyncProcessed(null);
    setTotalToProcess(null);
    setLastSyncPendingProcessed(null);
    setSyncPendingTotal(null);
    if (!options?.preserveOpportunities) {
      setOpportunitiesAdded(null);
    }
    setSyncKind(null);
  }, []);

  const prevAccountIdRef = useRef(accountId);
  const prevInitialIsSyncingRef = useRef(initialIsSyncing);

  useEffect(() => {
    const accountChanged = prevAccountIdRef.current !== accountId;
    const initialSyncingChanged =
      prevInitialIsSyncingRef.current !== initialIsSyncing;
    prevAccountIdRef.current = accountId;
    prevInitialIsSyncingRef.current = initialIsSyncing;

    if (accountChanged) {
      setIsSyncing(initialIsSyncing);
      wasSyncingRef.current = initialIsSyncing;
      if (!initialIsSyncing) {
        setShowForceReset(false);
        clearProgress();
      }
    } else if (initialSyncingChanged) {
      if (initialIsSyncing) {
        setIsSyncing(true);
        wasSyncingRef.current = true;
      } else if (!justFinished) {
        setIsSyncing(false);
        wasSyncingRef.current = false;
        setShowForceReset(false);
        clearProgress();
      }
    }
  }, [accountId, initialIsSyncing, justFinished, clearProgress]);

  useEffect(() => {
    setPendingCount(initialPendingClassificationCount);
  }, [initialPendingClassificationCount]);

  const markSyncStarted = useCallback((kind: SyncKind = "inbox") => {
    wasSyncingRef.current = true;
    setShowForceReset(false);
    setJustFinished(false);
    setIsSyncing(true);
    syncKindRef.current = kind;
    setSyncKind(kind);
    setLastSyncProcessed(0);
    setLastSyncPendingProcessed(0);
    setOpportunitiesAdded(null);
    // Do not seed totals from backlog COUNT — wait for server batch sizes.
    setTotalToProcess(null);
    setSyncPendingTotal(null);
  }, []);

  const markSyncFailed = useCallback(() => {
    wasSyncingRef.current = false;
    setIsSyncing(false);
    setShowForceReset(false);
    clearProgress();
  }, [clearProgress]);

  useEffect(() => {
    function handleSyncStart(event: Event) {
      const detail = (event as CustomEvent<SyncStartedDetail>).detail;
      markSyncStarted(detail?.kind === "queued" ? "queued" : "inbox");
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
        clearProgress();
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
              clearProgress();
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
            syncKind?: string | null;
            syncPendingTotal?: number | null;
            lastSyncPendingProcessed?: number | null;
            opportunitiesAdded?: number | null;
          };

          if (typeof data.pendingClassificationCount === "number") {
            setPendingCount(data.pendingClassificationCount);
          }

          const kind = parseSyncKind(data.syncKind ?? null);
          if (kind) {
            syncKindRef.current = kind;
            setSyncKind(kind);
          }

          if (typeof data.lastSyncProcessed === "number") {
            setLastSyncProcessed(data.lastSyncProcessed);
          }

          if (typeof data.syncTotal === "number" && data.syncTotal > 0) {
            setTotalToProcess(data.syncTotal);
          }

          if (typeof data.syncPendingTotal === "number") {
            setSyncPendingTotal(
              data.syncPendingTotal > 0 ? data.syncPendingTotal : null
            );
          }

          if (typeof data.lastSyncPendingProcessed === "number") {
            setLastSyncPendingProcessed(data.lastSyncPendingProcessed);
          }

          if (data.isSyncing) {
            wasSyncingRef.current = true;
            return "continue";
          }

          if (wasSyncingRef.current) {
            wasSyncingRef.current = false;
            setIsSyncing(false);
            setShowForceReset(false);
            // Keep kind briefly so the complete toast matches the run type.
            setSyncKind(syncKindRef.current);
            const added =
              typeof data.opportunitiesAdded === "number"
                ? data.opportunitiesAdded
                : typeof data.lastSyncProcessed === "number"
                  ? data.lastSyncProcessed
                  : 0;
            setOpportunitiesAdded(added);
            setJustFinished(true);
            setLastSyncProcessed(null);
            setTotalToProcess(null);
            setLastSyncPendingProcessed(null);
            setSyncPendingTotal(null);
            router.refresh();
          } else {
            setIsSyncing(false);
            clearProgress();
          }
          return "stop";
        } catch (err) {
          console.error("Sync poll error:", err);
          consecutiveErrors += 1;
          if (consecutiveErrors >= 4) {
            wasSyncingRef.current = false;
            setIsSyncing(false);
            clearProgress();
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
  }, [accountId, isSyncing, router, clearProgress]);

  useEffect(() => {
    if (!justFinished) return;
    const timer = setTimeout(() => {
      setJustFinished(false);
      syncKindRef.current = null;
      setSyncKind(null);
      setOpportunitiesAdded(null);
    }, 4200);
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
    clearProgress();
    try {
      await forceResetSyncStatus();
    } catch (error) {
      console.error("forceResetSyncStatus failed", error);
    }
    router.refresh();
  }, [router, clearProgress]);

  const value = useMemo(
    () => ({
      accountId,
      isSyncing,
      syncKind,
      pendingCount,
      lastSyncProcessed,
      totalToProcess,
      lastSyncPendingProcessed,
      syncPendingTotal,
      opportunitiesAdded,
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
      syncKind,
      pendingCount,
      lastSyncProcessed,
      totalToProcess,
      lastSyncPendingProcessed,
      syncPendingTotal,
      opportunitiesAdded,
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
