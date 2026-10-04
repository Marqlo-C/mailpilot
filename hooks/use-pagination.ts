"use client";

import { useEffect, useMemo, useState } from "react";

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

function parsePageSize(raw: string | null, fallback: number): number {
  if (raw == null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (!(PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed)) {
    return fallback;
  }
  return parsed;
}

type UsePaginationOptions = {
  storageKey: string;
  totalItems: number;
  /** Changing any of these resets currentPage to 1. */
  resetDeps?: readonly unknown[];
  defaultPageSize?: PageSizeOption;
};

export function usePagination({
  storageKey,
  totalItems,
  resetDeps = [],
  defaultPageSize = 25,
}: UsePaginationOptions) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSizeState] = useState<number>(defaultPageSize);

  // Hydrate page size after mount (SSR-safe).
  useEffect(() => {
    try {
      const stored = parsePageSize(
        localStorage.getItem(storageKey),
        defaultPageSize
      );
      setPageSizeState(stored);
    } catch {
      // Ignore private-mode / blocked storage.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once per key
  }, [storageKey]);

  // Reset to first page when filters / tab context change.
  const resetSignal = JSON.stringify(resetDeps);
  useEffect(() => {
    setCurrentPage(1);
  }, [resetSignal]);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize) || 1);

  // Clamp page when the filtered list shrinks.
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  function setPageSize(next: number) {
    const size = parsePageSize(String(next), defaultPageSize);
    setPageSizeState(size);
    setCurrentPage(1);
    try {
      localStorage.setItem(storageKey, String(size));
    } catch {
      // Ignore write failures.
    }
  }

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  const slice = useMemo(
    () =>
      function sliceItems<T>(items: T[]): T[] {
        return items.slice(startIndex, endIndex);
      },
    [startIndex, endIndex]
  );

  return {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalPages,
    startIndex,
    endIndex,
    slice,
  };
}
