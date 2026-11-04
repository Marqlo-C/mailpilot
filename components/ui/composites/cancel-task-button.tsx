"use client";

import { useState } from "react";
import { X, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type CancelTaskButtonProps = {
  onCancel: () => void;
  title?: string;
  className?: string;
  disabled?: boolean;
  /** CCW spin duration on click (ms). */
  spinMs?: number;
  /**
   * Icon affordance. Default X matches search-bar clear.
   * Use Trash2 when the action deletes or permanently drops persisted data.
   */
  icon?: LucideIcon;
};

/** Circular control for abortable tasks or destructive clears. */
export function CancelTaskButton({
  onCancel,
  title = "Cancel",
  className,
  disabled,
  spinMs = 500,
  icon: Icon = X,
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
        "rounded-full p-1 text-current transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:opacity-50",
        className
      )}
    >
      <Icon
        className="size-4 text-current"
        aria-hidden
        style={{
          transform: `rotate(${rotationDeg}deg)`,
          transition: `transform ${spinMs}ms cubic-bezier(0.33, 0.1, 0.2, 1)`,
        }}
      />
    </button>
  );
}
