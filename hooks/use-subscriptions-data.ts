"use client";

import { useMemo } from "react";
import type { Subscription, SubscriptionHistory } from "@prisma/client";
import type { DragGhostStackItem } from "@/components/ui/dnd/drag-ghost";
import { orderItemsByIds } from "@/lib/utils/dnd/reorder";
import {
  compareSubscriptionsBySort,
  effectiveSubscriptionClutterScore,
  inferSubscriptionCategory,
  matchesSubscriptionSearch,
  subscriptionClutterScore,
  type SubscriptionCategoryFilter,
  type SubscriptionSortOption,
} from "@/lib/subscriptions/filters";
import { applyCustomOrder } from "@/lib/subscriptions/preferences";
import {
  clutterForSub,
  formatLastReceivedValue,
  senderLogoSrc,
  type ArchiveEntry,
} from "@/components/features/subscriptions/parts";
import type { useCardListGestures } from "@/hooks/use-card-list-gestures";

export type UseSubscriptionsDataProps = {
  subscriptions: Subscription[];
  history: SubscriptionHistory[];
  active: Subscription[];
  clutterThreshold: number;
  searchQuery: string;
  categoryFilter: SubscriptionCategoryFilter;
  sortOption: SubscriptionSortOption;
  customOrder: string[];
};

/**
 * Computes filtered active and archive subscriptions and sorting.
 */
export function useSubscriptionsData({
  subscriptions,
  history,
  active,
  clutterThreshold,
  searchQuery,
  categoryFilter,
  sortOption,
  customOrder,
}: UseSubscriptionsDataProps) {
  const archive = useMemo(() => {
    const map = new Map<string, ArchiveEntry>();

    for (const sub of subscriptions) {
      if (sub.status !== "UNSUBSCRIBED") continue;
      const key = sub.senderEmail.toLowerCase();
      map.set(key, {
        key,
        senderEmail: sub.senderEmail,
        senderName: sub.senderName,
        emailCount: sub.emailCount,
        lastReceivedAt: sub.lastReceivedAt,
        subscriptionId: sub.id,
        source: "subscription",
      });
    }

    for (const row of history) {
      if (row.status !== "UNSUBSCRIBED") continue;
      const key = row.senderEmail.toLowerCase();
      if (map.has(key)) continue;
      map.set(key, {
        key,
        senderEmail: row.senderEmail,
        senderName: row.senderName,
        emailCount: null,
        lastReceivedAt: null,
        subscriptionId: null,
        source: "history",
      });
    }

    return [...map.values()];
  }, [subscriptions, history]);

  const filteredActive = useMemo(() => {
    const filtered = active.filter((sub) => {
      const clutter = effectiveSubscriptionClutterScore(sub);
      if (clutter < clutterThreshold) return false;
      if (!matchesSubscriptionSearch(sub, searchQuery)) return false;
      if (
        categoryFilter !== "all" &&
        inferSubscriptionCategory(sub) !== categoryFilter
      ) {
        return false;
      }
      return true;
    });

    if (sortOption === "custom") {
      return applyCustomOrder(filtered, customOrder);
    }

    return [...filtered].sort((a, b) =>
      compareSubscriptionsBySort(a, b, sortOption)
    );
  }, [
    active,
    clutterThreshold,
    searchQuery,
    categoryFilter,
    sortOption,
    customOrder,
  ]);

  const filteredArchive = useMemo(() => {
    const archiveSort: SubscriptionSortOption =
      sortOption === "custom" ? "clutter_desc" : sortOption;

    return archive
      .filter((entry) => {
        const score = subscriptionClutterScore({
          emailCount: entry.emailCount ?? 0,
          lastReceivedAt: entry.lastReceivedAt,
        });
        if (score < clutterThreshold) return false;
        if (!matchesSubscriptionSearch(entry, searchQuery)) return false;
        if (
          categoryFilter !== "all" &&
          inferSubscriptionCategory(entry) !== categoryFilter
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) =>
        compareSubscriptionsBySort(
          {
            senderEmail: a.senderEmail,
            senderName: a.senderName,
            emailCount: a.emailCount ?? 0,
            lastReceivedAt: a.lastReceivedAt,
          },
          {
            senderEmail: b.senderEmail,
            senderName: b.senderName,
            emailCount: b.emailCount ?? 0,
            lastReceivedAt: b.lastReceivedAt,
          },
          archiveSort
        )
      );
  }, [archive, clutterThreshold, searchQuery, categoryFilter, sortOption]);

  const filteredActiveIds = useMemo(
    () => filteredActive.map((s) => s.id),
    [filteredActive]
  );

  return {
    archive,
    filteredActive,
    filteredArchive,
    filteredActiveIds,
  };
}

export function useDragGhostData(
  drag: ReturnType<typeof useCardListGestures>["drag"],
  filteredActive: Subscription[],
  active: Subscription[]
) {
  const dragLabel = useMemo(() => {
    if (!drag?.active) return null;
    const primary =
      filteredActive.find((s) => s.id === drag.originId) ??
      active.find((s) => s.id === drag.originId);
    return primary?.senderName ?? primary?.senderEmail ?? "Subscription";
  }, [drag, filteredActive, active]);

  const dragStackItems = useMemo(() => {
    if (!drag?.active) return [];
    const orderedIds = [
      drag.originId,
      ...drag.movedIds.filter((id) => id !== drag.originId),
    ].slice(0, 4);
    return orderedIds.map((id) => {
      const sub =
        filteredActive.find((s) => s.id === id) ??
        active.find((s) => s.id === id);
      const name = sub?.senderName ?? sub?.senderEmail ?? "Subscription";
      const email = sub?.senderEmail ?? null;
      const item: DragGhostStackItem = {
        name,
        subtitle: email && name !== email ? email : null,
        logoSrc: email ? senderLogoSrc(email) : null,
        score: sub ? clutterForSub(sub) : null,
        scoreKind: "clutter",
        emailCount: sub?.emailCount ?? null,
        lastReceivedLabel: sub
          ? formatLastReceivedValue(sub.lastReceivedAt)
          : null,
        actions: ["snapshot", "unsubscribe"],
      };
      return item;
    });
  }, [drag, filteredActive, active]);

  const displayActive = useMemo(() => {
    if (drag?.previewFullIds) {
      return orderItemsByIds(filteredActive, drag.previewFullIds);
    }
    return filteredActive;
  }, [drag?.previewFullIds, filteredActive]);

  return { dragLabel, dragStackItems, displayActive };
}
