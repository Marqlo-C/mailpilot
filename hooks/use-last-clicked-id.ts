"use client";

import { useMemo, useState } from "react";

/**
 * Tracks the most recently toggled select checkbox id.
 * Cleared when selection empties or the id leaves the visible set.
 */
export function useLastClickedId(
  selectedIds: readonly string[],
  visibleIds: readonly string[]
): {
  lastClickedId: string | null;
  markLastClicked: (id: string | null) => void;
} {
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const isEmpty = selectedIds.length === 0;
  const [prevEmpty, setPrevEmpty] = useState(isEmpty);
  if (prevEmpty !== isEmpty) {
    setPrevEmpty(isEmpty);
    if (isEmpty) {
      setLastClickedId(null);
    }
  }

  const visibleKey = visibleIds.join("\0");
  const visibleSet = useMemo(
    () => new Set(visibleKey ? visibleKey.split("\0") : []),
    [visibleKey]
  );

  const effectiveLastClickedId =
    !isEmpty && lastClickedId && visibleSet.has(lastClickedId)
      ? lastClickedId
      : null;

  return {
    lastClickedId: effectiveLastClickedId,
    markLastClicked: setLastClickedId,
  };
}
