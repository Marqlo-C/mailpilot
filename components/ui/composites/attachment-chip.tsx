"use client";

import { FileText, X } from "lucide-react";

import { cn } from "@/lib/utils";

type AttachmentChipProps = {
  label: string;
  onRemove?: () => void;
  removeLabel?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * Compact filename chip with optional remove — shared by email extras and
 * tailored-resume attach affordances.
 *
 * Dismiss uses the same plain X treatment as dialog/sheet close — not the
 * circular field-trailing clear control.
 */
export function AttachmentChip({
  label,
  onRemove,
  removeLabel = "Remove attachment",
  disabled = false,
  className,
}: AttachmentChipProps) {
  return (
    <div
      className={cn(
        "inline-flex min-w-0 max-w-[240px] items-center gap-1.5 rounded-md border border-border/50 bg-card/95 px-2 py-1 text-xs shadow-sm",
        className
      )}
    >
      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{label}</span>
      {onRemove ? (
        <button
          type="button"
          aria-label={removeLabel}
          disabled={disabled}
          onClick={onRemove}
          className="shrink-0 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
        >
          {/* size-3 — matches text-xs chip density; dialog close stays size-4. */}
          <X className="size-3" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
