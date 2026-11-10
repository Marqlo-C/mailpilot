"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import type { Subscription } from "@prisma/client";
import { toast } from "sonner";
import type { CleanupAction } from "@/lib/gmail/unsubscribe";
import {
  clearLocalBriefingsForSubscriptions,
  deleteLocalBriefings,
  listLocalBriefings,
  migrateDisplacedBriefingToLocal,
  type LocalBriefingRecord,
} from "@/lib/subscriptions/briefing-local";
import {
  resolveSubscriptionCardAction,
} from "@/lib/subscriptions/movement-rules";
import { runSubscriptionMove } from "@/lib/subscriptions/run-subscription-move";
import type {
  ArchiveEntry,
  LatestBriefingProp,
  ResolvedBriefing,
} from "@/components/features/subscriptions/parts";

export type UseSubscriptionsActionsProps = {
  accountId: string;
  active: Subscription[];
  selectedIds: string[];
  selectedSubscriptions: Subscription[];
  setSelectedIds: (ids: string[]) => void;
  setSelectionMode: (mode: boolean) => void;
  clearSelection: () => void;
  latestBriefing?: LatestBriefingProp | null;
};

/**
 * Encapsulates mutation actions, briefings, and dialog states for subscriptions.
 */
export function useSubscriptionsActions({
  accountId,
  active,
  selectedIds,
  selectedSubscriptions,
  setSelectedIds,
  setSelectionMode,
  clearSelection,
  latestBriefing = null,
}: UseSubscriptionsActionsProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Subscription | null>(null);
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [briefingTargets, setBriefingTargets] = useState<Subscription[]>([]);
  const [briefingPending, setBriefingPending] = useState(false);
  const [viewingBriefing, setViewingBriefing] =
    useState<ResolvedBriefing | null>(null);
  const [briefingPreviewLoading, setBriefingPreviewLoading] = useState(false);
  const [selectedEmailSub, setSelectedEmailSub] =
    useState<Subscription | null>(null);
  const [localBriefings, setLocalBriefings] = useState<
    Record<string, LocalBriefingRecord>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [cleanupPending, setCleanupPending] = useState<string | null>(null);
  const [cleanupChoice, setCleanupChoice] = useState<CleanupAction>("NONE");
  const [deleteRecordTarget, setDeleteRecordTarget] =
    useState<ArchiveEntry | null>(null);
  const [deleteRecordPending, setDeleteRecordPending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);

  const unsubscribeDialogOpen = Boolean(selected) || batchConfirmOpen;
  const requestUnsubscribeRef = useRef<(ids: string[]) => void>(() => {});

  useLayoutEffect(() => {
    setLocalBriefings(listLocalBriefings(accountId));
  }, [accountId]);

  useEffect(() => {
    if (unsubscribeDialogOpen) {
      setCleanupChoice("NONE");
      setError(null);
    }
  }, [unsubscribeDialogOpen]);

  useEffect(() => {
    if (!viewingBriefing) {
      setBriefingPreviewLoading(false);
      return;
    }
    setBriefingPreviewLoading(true);
    const fallback = window.setTimeout(() => {
      setBriefingPreviewLoading(false);
    }, 2000);
    return () => window.clearTimeout(fallback);
  }, [viewingBriefing?.id]);

  const resolveBriefingForSub = useCallback(
    (sub: Subscription): ResolvedBriefing | null => {
      if (
        latestBriefing &&
        latestBriefing.subscriptionIds.includes(sub.id)
      ) {
        return {
          ...latestBriefing,
          subscriptionId: sub.id,
          source: "db",
        };
      }
      const local = localBriefings[sub.id];
      if (!local) return null;
      return {
        id: local.id,
        subject: local.subject ?? null,
        htmlPreview: local.htmlPreview,
        generatedAt: local.generatedAt,
        senderEmails: local.senderEmails,
        subscriptionIds: local.subscriptionIds,
        subscriptionId: sub.id,
        source: "local",
      };
    },
    [latestBriefing, localBriefings]
  );

  const selectedWithBriefingIds = useMemo(
    () =>
      selectedSubscriptions
        .filter((s) => {
          if (latestBriefing?.subscriptionIds.includes(s.id)) return true;
          return Boolean(localBriefings[s.id]);
        })
        .map((s) => s.id),
    [selectedSubscriptions, latestBriefing, localBriefings]
  );

  const openBriefing = useCallback((targets: Subscription[]) => {
    if (targets.length === 0) return;
    setBriefingTargets(targets);
    setBriefingOpen(true);
  }, []);

  const openBriefingFromViewing = useCallback(() => {
    if (!viewingBriefing) return;
    const idSet = new Set(viewingBriefing.subscriptionIds);
    const emailSet = new Set(
      viewingBriefing.senderEmails.map((e) => e.toLowerCase())
    );
    let targets = active.filter((s) => idSet.has(s.id));
    if (targets.length === 0) {
      targets = active.filter((s) =>
        emailSet.has(s.senderEmail.toLowerCase())
      );
    }
    if (targets.length === 0) {
      const one = active.find((s) => s.id === viewingBriefing.subscriptionId);
      if (one) targets = [one];
    }
    if (targets.length === 0) {
      toast.error("Those senders are no longer in Subscribed");
      return;
    }
    setViewingBriefing(null);
    openBriefing(targets);
  }, [viewingBriefing, active, openBriefing]);

  const runBriefingDigest = useCallback(
    async (range: { startDate: string; endDate: string }) => {
      if (briefingTargets.length === 0 || briefingPending) return;
      setBriefingPending(true);
      const toastId = toast.loading("Generating snapshot…");
      const newSubIds = briefingTargets.map((s) => s.id);
      try {
        const response = await fetch("/api/subscriptions/digest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            senderEmails: briefingTargets.map((s) => s.senderEmail),
            startDate: range.startDate,
            endDate: range.endDate,
          }),
        });
        const payload = (await response.json()) as {
          success?: boolean;
          processedCount?: number;
          digestSentTo?: string;
          error?: string;
          displacedBriefing?: LatestBriefingProp | null;
          briefing?: LatestBriefingProp;
        };
        if (!response.ok || !payload.success) {
          throw new Error(payload.error ?? "Failed to create snapshot");
        }

        if (payload.displacedBriefing) {
          migrateDisplacedBriefingToLocal(
            accountId,
            payload.displacedBriefing,
            newSubIds
          );
        }
        clearLocalBriefingsForSubscriptions(accountId, newSubIds);
        setLocalBriefings(listLocalBriefings(accountId));

        toast.success(
          `Snapshot sent to ${payload.digestSentTo ?? "your inbox"} · ${payload.processedCount ?? 0} cleaned`,
          { id: toastId }
        );
        setBriefingOpen(false);
        setBriefingTargets([]);
        setSelectedIds([]);
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to create snapshot",
          { id: toastId }
        );
      } finally {
        setBriefingPending(false);
      }
    },
    [briefingTargets, briefingPending, accountId, setSelectedIds, router]
  );

  const deleteBriefingsForSubscriptions = useCallback(
    async (subscriptionIds: string[]) => {
      if (subscriptionIds.length === 0 || deletePending) return;
      setDeletePending(true);
      const toastId = toast.loading(
        subscriptionIds.length === 1
          ? "Deleting snapshot…"
          : `Deleting ${subscriptionIds.length} snapshots…`
      );
      try {
        const response = await fetch("/api/subscriptions/digest/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscriptionIds }),
        });
        const payload = (await response.json()) as {
          success?: boolean;
          error?: string;
        };
        if (!response.ok || !payload.success) {
          throw new Error(payload.error ?? "Failed to delete snapshot");
        }
        deleteLocalBriefings(accountId, subscriptionIds);
        setLocalBriefings(listLocalBriefings(accountId));
        toast.success(
          subscriptionIds.length === 1
            ? "Snapshot deleted"
            : `${subscriptionIds.length} snapshots deleted`,
          { id: toastId }
        );
        setViewingBriefing(null);
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to delete snapshot",
          { id: toastId }
        );
      } finally {
        setDeletePending(false);
      }
    },
    [deletePending, accountId, router]
  );

  const closeUnsubscribeDialog = useCallback(() => {
    setSelected(null);
    setBatchConfirmOpen(false);
    setError(null);
  }, []);

  const requestUnsubscribe = useCallback(
    (ids: string[]) => {
      const resolved = resolveSubscriptionCardAction("active", "unsubscribe");
      if (resolved.kind === "forbidden") {
        toast.error(resolved.description);
        return;
      }
      const unique = [...new Set(ids.filter(Boolean))];
      if (unique.length === 0) return;

      if (unique.length === 1) {
        const sub = active.find((s) => s.id === unique[0]) ?? null;
        if (sub) {
          setSelected(sub);
          setBatchConfirmOpen(false);
          setError(null);
          return;
        }
      }

      setSelectionMode(true);
      setSelectedIds(unique);
      setSelected(null);
      setError(null);
      setBatchConfirmOpen(true);
    },
    [active, setSelectionMode, setSelectedIds]
  );
  requestUnsubscribeRef.current = requestUnsubscribe;

  const runUnsubscribe = useCallback(
    (cleanup: CleanupAction) => {
      const ids = batchConfirmOpen
        ? selectedIds
        : selected
          ? [selected.id]
          : [];
      if (ids.length === 0) return;
      setError(null);
      startTransition(async () => {
        const toastId =
          ids.length > 1
            ? toast.loading(`Unsubscribing ${ids.length} sender(s)…`)
            : undefined;
        const result = await runSubscriptionMove("unsubscribe", {
          subscriptionIds: ids,
          cleanup,
        });
        if (!result.ok) {
          if (toastId) toast.error(result.error, { id: toastId });
          else setError(result.error);
          return;
        }
        const okCount = result.data?.count ?? 0;
        const failCount = result.data?.failed ?? 0;
        if (toastId) {
          if (failCount === 0) {
            toast.success(`Unsubscribed ${okCount} sender(s)`, { id: toastId });
          } else {
            toast.error(`Unsubscribed ${okCount}, failed ${failCount}`, {
              id: toastId,
            });
          }
        }
        clearSelection();
        closeUnsubscribeDialog();
        router.refresh();
      });
    },
    [batchConfirmOpen, selectedIds, selected, clearSelection, closeUnsubscribeDialog, router]
  );

  const runBatchCleanup = useCallback(
    (entry: ArchiveEntry) => {
      const resolved = resolveSubscriptionCardAction("archive", "cleanup");
      if (resolved.kind === "forbidden") {
        toast.error(resolved.description);
        return;
      }
      setCleanupPending(entry.key);
      startTransition(async () => {
        const result = await runSubscriptionMove("cleanup", {
          accountId,
          senderEmail: entry.senderEmail,
        });
        setCleanupPending(null);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(
          `Moved ${result.data?.count ?? 0} past email(s) to Trash`
        );
        router.refresh();
      });
    },
    [accountId, router]
  );

  const runDeleteUnsubscribedRecord = useCallback(() => {
    if (!deleteRecordTarget) return;
    const resolved = resolveSubscriptionCardAction("archive", "delete_record");
    if (resolved.kind === "forbidden") {
      toast.error(resolved.description);
      return;
    }
    const entry = deleteRecordTarget;
    setDeleteRecordPending(true);
    startTransition(async () => {
      const result = await runSubscriptionMove("delete_record", {
        accountId,
        senderEmail: entry.senderEmail,
      });
      setDeleteRecordPending(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (entry.subscriptionId) {
        deleteLocalBriefings(accountId, [entry.subscriptionId]);
        setLocalBriefings(listLocalBriefings(accountId));
      }
      setDeleteRecordTarget(null);
      toast.success("Record deleted");
      router.refresh();
    });
  }, [deleteRecordTarget, accountId, router]);

  return {
    selected,
    setSelected,
    batchConfirmOpen,
    setBatchConfirmOpen,
    briefingOpen,
    setBriefingOpen,
    briefingTargets,
    briefingPending,
    viewingBriefing,
    setViewingBriefing,
    briefingPreviewLoading,
    setBriefingPreviewLoading,
    selectedEmailSub,
    setSelectedEmailSub,
    localBriefings,
    error,
    pending,
    cleanupPending,
    cleanupChoice,
    setCleanupChoice,
    deleteRecordTarget,
    setDeleteRecordTarget,
    deleteRecordPending,
    deletePending,
    unsubscribeDialogOpen,
    requestUnsubscribeRef,
    resolveBriefingForSub,
    selectedWithBriefingIds,
    openBriefing,
    openBriefingFromViewing,
    runBriefingDigest,
    deleteBriefingsForSubscriptions,
    closeUnsubscribeDialog,
    requestUnsubscribe,
    runUnsubscribe,
    runBatchCleanup,
    runDeleteUnsubscribedRecord,
  };
}
