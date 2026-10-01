"use client";

import { XCircle } from "lucide-react";

import { cn } from "@/lib/utils";

type CancelTaskButtonProps = {
  onCancel: () => void;
  title?: string;
  className?: string;
  disabled?: boolean;
};

/** Red circular cancel control for an in-flight abortable AI task. */
export function CancelTaskButton({
  onCancel,
  title = "Cancel",
  className,
  disabled,
}: CancelTaskButtonProps) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }}
      title={title}
      aria-label={title}
      disabled={disabled}
      className={cn(
        "rounded-full p-1 text-destructive transition-colors hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50",
        className
      )}
    >
      <XCircle className="h-4 w-4 text-red-500" />
    </button>
  );
}
