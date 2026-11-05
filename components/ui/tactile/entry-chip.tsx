import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { formatStatusPillTitle } from "@/lib/utils/format";

/**
 * Compact bordered meta chip — dates, section labels, tool counts.
 * Title-cases string children. Keep in lockstep with level-3
 * {@link SettingsStatusPill} chrome.
 */
export const ENTRY_CHIP_CLASSNAME =
  "inline-flex h-5 shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-border/60 px-2 text-[10px] font-medium leading-none text-muted-foreground";

export type EntryChipProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
};

export function EntryChip({ children, className, ...props }: EntryChipProps) {
  return (
    <span className={cn(ENTRY_CHIP_CLASSNAME, className)} {...props}>
      {typeof children === "string" ? formatStatusPillTitle(children) : children}
    </span>
  );
}

/** Alias used by profile date ranges. */
export const DateChip = EntryChip;
