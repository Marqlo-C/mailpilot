"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

/** Job Radar shows two cards per row, so page sizes stay on even rows. */
export const JOBS_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

function parsePageSize(
  raw: string | null,
  fallback: number,
  options: readonly number[]
): number {
  if (raw == null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (!options.includes(parsed)) return fallback;
  return parsed;
}

type UsePaginationOptions = {
  storageKey: string;
  totalItems: number;
  /** Changing any of these resets currentPage to 1. */
  resetDeps?: readonly unknown[];
  defaultPageSize?: number;
  pageSizeOptions?: readonly number[];
};

const PAGINATION_STORAGE_EVENT = "mailpilot_pagination_storage";

export function usePagination({
  storageKey,
  totalItems,
  resetDeps = [],
  defaultPageSize = 25,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
}: UsePaginationOptions) {
  const [currentPage, setCurrentPage] = useState(1);

  const subscribe = useCallback((onStoreChange: () => void) => {
    window.addEventListener("storage", onStoreChange);
    window.addEventListener(PAGINATION_STORAGE_EVENT, onStoreChange);
    return () => {
      window.removeEventListener("storage", onStoreChange);
      window.removeEventListener(PAGINATION_STORAGE_EVENT, onStoreChange);
    };
  }, []);

  const pageSize = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return parsePageSize(
          localStorage.getItem(storageKey),
          defaultPageSize,
          pageSizeOptions
        );
      } catch {
        return defaultPageSize;
      }
    },
    () => defaultPageSize
  );

  // Reset to first page when filters / tab context change.
  const resetSignal = JSON.stringify(resetDeps);
  const [prevResetSignal, setPrevResetSignal] = useState(resetSignal);
  if (prevResetSignal !== resetSignal) {
    setPrevResetSignal(resetSignal);
    setCurrentPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize) || 1);
  const effectivePage = Math.min(currentPage, totalPages);

  function setPageSize(next: number) {
    const size = parsePageSize(String(next), defaultPageSize, pageSizeOptions);
    setCurrentPage(1);
    try {
      localStorage.setItem(storageKey, String(size));
      window.dispatchEvent(new Event(PAGINATION_STORAGE_EVENT));
    } catch {
      // Ignore write failures.
    }
  }

  const startIndex = (effectivePage - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  const slice = useMemo(
    () =>
      function sliceItems<T>(items: T[]): T[] {
        return items.slice(startIndex, endIndex);
      },
    [startIndex, endIndex]
  );

  return {
    currentPage: effectivePage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalPages,
    startIndex,
    endIndex,
    slice,
  };
}
