"use client";

import { useEffect, useMemo, useState } from "react";

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
  const visibleKey = visibleIds.join("\0");
  const visibleSet = useMemo(
    () => new Set(visibleKey ? visibleKey.split("\0") : []),
    [visibleKey]
  );

  useEffect(() => {
    if (selectedIds.length === 0) {
      setLastClickedId(null);
    }
  }, [selectedIds.length]);

  useEffect(() => {
    setLastClickedId((prev) => (prev && visibleSet.has(prev) ? prev : null));
  }, [visibleSet]);

  return {
    lastClickedId,
    markLastClicked: setLastClickedId,
  };
}
