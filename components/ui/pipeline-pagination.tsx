"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { PAGE_SIZE_OPTIONS } from "@/hooks/use-pagination";
import { cn } from "@/lib/utils";

export function ToolbarPageSizeSelect({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "inline-flex h-6 items-center gap-1.5 text-[11px] font-medium text-muted-foreground",
        className
      )}
    >
      <span>Show:</span>
      <select
        value={value}
        onChange={(e) => onChange(Number.parseInt(e.target.value, 10))}
        className="h-6 cursor-pointer rounded-md border border-border/50 bg-background px-2 text-[11px] text-foreground transition-colors hover:bg-muted/40 focus:outline-none focus:ring-1 focus:ring-ring"
        aria-label="Rows per page"
      >
        {PAGE_SIZE_OPTIONS.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PipelinePaginationFooter({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}) {
  if (totalItems === 0) return null;

  const from = (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, totalItems);
  const pages = Math.max(1, totalPages);

  return (
    <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs font-medium text-muted-foreground">
        Showing {from}–{to} of {totalItems} results
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-border/50 bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="size-3.5" />
          Previous
        </button>
        <span className="inline-flex h-8 items-center rounded-lg border border-border/50 bg-muted/40 px-3 text-xs font-medium text-muted-foreground">
          Page {currentPage} of {pages}
        </span>
        <button
          type="button"
          disabled={currentPage >= pages || totalItems === 0}
          onClick={() => onPageChange(currentPage + 1)}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-border/50 bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
          aria-label="Next page"
        >
          Next
          <ChevronRight className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
