"use client";

import { type ButtonHTMLAttributes, type ReactNode } from "react";

import { SnapshotIcon } from "@/components/ui/icons/snapshot-icon";
import {
  SECONDARY_ACTION_BTN_CLASSNAME,
  SECONDARY_ACTION_BTN_MUTED_CLASSNAME,
} from "@/components/ui/styles/secondary-action-btn";
import { cn } from "@/lib/utils";

export type CreateSnapshotButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  /** Defaults to “Send Snapshot”. */
  children?: ReactNode;
};

/** Regular secondary CTA — {@link SnapshotIcon} glyph. */
export function CreateSnapshotButton({
  disabled,
  className,
  children = "Send Snapshot",
  type = "button",
  ...props
}: CreateSnapshotButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        disabled
          ? SECONDARY_ACTION_BTN_MUTED_CLASSNAME
          : SECONDARY_ACTION_BTN_CLASSNAME,
        // Sparkles sit outside the 24×24 mail frame; keep label on one line
        "overflow-visible whitespace-nowrap",
        className
      )}
      {...props}
    >
      {/* 16px — slightly above the usual 14px secondary icon */}
      <SnapshotIcon width={15} height={15} className="shrink-0 overflow-visible" />
      <span className="whitespace-nowrap">{children}</span>
    </button>
  );
}
