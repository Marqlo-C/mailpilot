import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/** Diff polarity for profile / list change rows. */
export type DiffKind = "added" | "modified" | "removed";

const DIFF_KIND_MARK: Record<
  DiffKind,
  { mark: string; className: string; label: string }
> = {
  added: {
    mark: "+",
    label: "Added",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  modified: {
    mark: "~",
    label: "Modified",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  removed: {
    mark: "−",
    label: "Removed",
    className: "bg-[#FAE9E9] text-[#C21E11]",
  },
};

/** Compact +/-/~ mark for diff / revision change rows. */
export const DIFF_KIND_MARK_CLASSNAME =
  "inline-flex size-4 shrink-0 items-center justify-center rounded text-[10px] font-semibold leading-none";

export type DiffKindMarkProps = HTMLAttributes<HTMLSpanElement> & {
  kind: DiffKind;
};

export function DiffKindMark({ kind, className, ...props }: DiffKindMarkProps) {
  const tone = DIFF_KIND_MARK[kind];
  return (
    <span
      role="img"
      aria-label={tone.label}
      className={cn(DIFF_KIND_MARK_CLASSNAME, tone.className, className)}
      {...props}
    >
      {tone.mark}
    </span>
  );
}
