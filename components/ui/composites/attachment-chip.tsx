"use client";

import { FileText, X } from "lucide-react";

import { FieldTrailingButton } from "@/components/ui/tactile/text-field";
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
        <FieldTrailingButton
          aria-label={removeLabel}
          disabled={disabled}
          onClick={onRemove}
          className="size-5 before:-inset-1"
        >
          <X className="size-3" aria-hidden />
        </FieldTrailingButton>
      ) : null}
    </div>
  );
}
