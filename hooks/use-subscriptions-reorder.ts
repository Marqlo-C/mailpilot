"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
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
  const [customOrder, setCustomOrder] = useState<string[]>([]);
  const suppressTabChangeRef = useRef(false);

  // Hydrate custom order from local storage on mount / account change
  useLayoutEffect(() => {
    setCustomOrder(readCustomOrder(accountId));
  }, [accountId]);

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
    [accountId, customOrder, filteredActiveIds, onSortOptionChange, sortOption]
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
