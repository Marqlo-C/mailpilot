"use client";

import { useState } from "react";
import { XCircle } from "lucide-react";

import { cn } from "@/lib/utils";

type CancelTaskButtonProps = {
  onCancel: () => void;
  title?: string;
  className?: string;
  disabled?: boolean;
  /** CCW spin duration on click (ms). */
  spinMs?: number;
};

/** Red circular cancel control for an in-flight abortable AI task. */
export function CancelTaskButton({
  onCancel,
  title = "Cancel",
  className,
  disabled,
  spinMs = 500,
}: CancelTaskButtonProps) {
  const [rotationDeg, setRotationDeg] = useState(0);

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setRotationDeg((deg) => deg - 360);
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
      <XCircle
        className="h-4 w-4 text-red-500"
        style={{
          transform: `rotate(${rotationDeg}deg)`,
          transition: `transform ${spinMs}ms cubic-bezier(0.33, 0.1, 0.2, 1)`,
        }}
      />
    </button>
  );
}
