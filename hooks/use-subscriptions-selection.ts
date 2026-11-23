"use client";

import { useCallback, useMemo, useState } from "react";
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
    if (Array.isArray(filteredActiveIds)) {
      return filteredActiveIds;
    }
    return activeItems.map((item) => item.id);
  }, [filteredActiveIds, activeItems]);

  const visibleIdSet = useMemo(() => new Set(activeIds), [activeIds]);
  const effectiveSelectedIds = useMemo(
    () => selectedIds.filter((id) => visibleIdSet.has(id)),
    [selectedIds, visibleIdSet]
  );
  const effectiveSelectionMode =
    selectionMode && effectiveSelectedIds.length > 0;

  const { lastClickedId, markLastClicked } = useLastClickedId(
    effectiveSelectedIds,
    activeIds
  );

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
        pageIds.length > 0 &&
        pageIds.every((id) => effectiveSelectedIds.includes(id));
      if (isAllSelected) {
        clearSelection();
        return;
      }
      setSelectionMode(true);
      setSelectedIds(pageIds);
    },
    [clearSelection, markLastClicked, effectiveSelectedIds]
  );

  const isAllSelected = useCallback(
    (pageIds: string[]) =>
      pageIds.length > 0 &&
      pageIds.every((id) => effectiveSelectedIds.includes(id)),
    [effectiveSelectedIds]
  );

  const selectedSubscriptions = useMemo(
    () => activeItems.filter((item) => effectiveSelectedIds.includes(item.id)),
    [activeItems, effectiveSelectedIds]
  );

  return {
    selectedIds: effectiveSelectedIds,
    setSelectedIds,
    selectionMode: effectiveSelectionMode,
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
