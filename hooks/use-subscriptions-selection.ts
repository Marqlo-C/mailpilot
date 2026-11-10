"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLastClickedId } from "./use-last-clicked-id";

export interface UseSubscriptionsSelectionOptions<T extends { id: string }> {
  activeItems: T[];
  filteredActiveIds?: string[] | { current: string[] };
}

export function useSubscriptionsSelection<T extends { id: string }>({
  activeItems,
  filteredActiveIds,
}: UseSubscriptionsSelectionOptions<T>) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);

  const activeIds = useMemo(() => {
    return Array.isArray(filteredActiveIds)
      ? filteredActiveIds
      : filteredActiveIds?.current ?? [];
  }, [filteredActiveIds]);

  const { lastClickedId, markLastClicked } = useLastClickedId(
    selectedIds,
    activeIds
  );

  // Keep selection synchronized with currently visible items.
  useEffect(() => {
    const visibleIds = new Set(activeIds);
    setSelectedIds((prev) => {
      const next = prev.filter((id) => visibleIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [activeIds]);

  // Never stay in selectionMode with zero ids.
  useEffect(() => {
    if (selectedIds.length === 0 && selectionMode) {
      setSelectionMode(false);
    }
  }, [selectedIds.length, selectionMode]);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    setSelectionMode(false);
  }, []);

  const toggleRow = useCallback(
    (id: string) => {
      markLastClicked(id);
      setSelectedIds((prev) => {
        const next = prev.includes(id)
          ? prev.filter((i) => i !== id)
          : [...prev, id];
        setSelectionMode(next.length > 0);
        return next;
      });
    },
    [markLastClicked]
  );

  const enterSelectionMode = useCallback(
    (id: string) => {
      markLastClicked(id);
      setSelectionMode(true);
      setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    },
    [markLastClicked]
  );

  const paintSelect = useCallback(
    (id: string, mode: "add" | "remove") => {
      markLastClicked(id);
      setSelectedIds((prev) => {
        if (mode === "add") {
          if (prev.includes(id)) return prev;
          setSelectionMode(true);
          return [...prev, id];
        }
        const next = prev.filter((i) => i !== id);
        setSelectionMode(next.length > 0);
        return next;
      });
    },
    [markLastClicked]
  );

  const toggleSelectAll = useCallback(
    (pageIds: string[]) => {
      markLastClicked(null);
      const isAllSelected =
        pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
      if (isAllSelected) {
        clearSelection();
        return;
      }
      setSelectionMode(true);
      setSelectedIds(pageIds);
    },
    [clearSelection, markLastClicked, selectedIds]
  );

  const isAllSelected = useCallback(
    (pageIds: string[]) =>
      pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id)),
    [selectedIds]
  );

  const selectedSubscriptions = useMemo(
    () => activeItems.filter((item) => selectedIds.includes(item.id)),
    [activeItems, selectedIds]
  );

  return {
    selectedIds,
    setSelectedIds,
    selectionMode,
    setSelectionMode,
    lastClickedId,
    markLastClicked,
    clearSelection,
    toggleRow,
    enterSelectionMode,
    paintSelect,
    toggleSelectAll,
    isAllSelected,
    selectedSubscriptions,
  };
}
