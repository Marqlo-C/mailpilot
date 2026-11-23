"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useHydrated } from "@/hooks/use-hydrated";
import type { SubscriptionSortOption } from "@/lib/subscriptions/filters";
import { mergeFilteredOrderIntoCustom } from "@/lib/utils/dnd/reorder";
import {
  persistCustomOrder,
  readCustomOrder,
} from "@/lib/subscriptions/preferences";
import { resolveSubscriptionMove } from "@/lib/subscriptions/movement-rules";

export interface UseSubscriptionsReorderOptions {
  accountId: string;
  filteredActiveIds?: string[] | { current: string[] };
  sortOption: SubscriptionSortOption;
  onSortOptionChange: (sort: SubscriptionSortOption) => void;
  onRequestUnsubscribe: (ids: string[]) => void;
}

export function useSubscriptionsReorder({
  accountId,
  filteredActiveIds,
  sortOption,
  onSortOptionChange,
  onRequestUnsubscribe,
}: UseSubscriptionsReorderOptions) {
  const hydrated = useHydrated();
  const [customOrderOverride, setCustomOrderOverride] = useState<{
    accountId: string;
    order: string[];
  } | null>(null);

  const customOrder = useMemo<string[]>(() => {
    if (!hydrated) return [];
    if (customOrderOverride?.accountId === accountId) {
      return customOrderOverride.order;
    }
    return readCustomOrder(accountId);
  }, [hydrated, customOrderOverride, accountId]);

  const setCustomOrder = useCallback(
    (order: string[]) => {
      setCustomOrderOverride({ accountId, order });
    },
    [accountId]
  );

  const suppressTabChangeRef = useRef(false);

  const handleReorder = useCallback(
    (nextFullIds: string[], _movedIds: string[]) => {
      const activeIds = Array.isArray(filteredActiveIds)
        ? filteredActiveIds
        : filteredActiveIds?.current ?? [];
      const merged = mergeFilteredOrderIntoCustom(
        customOrder,
        activeIds,
        nextFullIds
      );
      setCustomOrder(merged);
      persistCustomOrder(accountId, merged);
      // Keep multi-select after reorder; only flip the sort label.
      if (sortOption !== "custom") {
        onSortOptionChange("custom");
      }
    },
    [
      accountId,
      customOrder,
      filteredActiveIds,
      onSortOptionChange,
      setCustomOrder,
      sortOption,
    ]
  );

  const handleDropZone = useCallback(
    (zoneId: string, movedIds: string[]) => {
      const resolved = resolveSubscriptionMove(
        "active",
        zoneId as "active" | "archive"
      );
      if (resolved.kind !== "unsubscribe" || movedIds.length === 0) return;
      // Prevent the Unsubscribed tab trigger from stealing this pointer-up as a click.
      suppressTabChangeRef.current = true;
      window.setTimeout(() => {
        suppressTabChangeRef.current = false;
      }, 0);
      onRequestUnsubscribe(movedIds);
    },
    [onRequestUnsubscribe]
  );

  return {
    customOrder,
    setCustomOrder,
    suppressTabChangeRef,
    handleReorder,
    handleDropZone,
  };
}
