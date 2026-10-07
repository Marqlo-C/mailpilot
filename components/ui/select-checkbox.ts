import { cn } from "@/lib/utils";

/** Teal fill + white check — shared Job Radar / Subscriptions select checkboxes. */
export const SELECT_CHECKBOX_CLASSNAME = "mp-select-checkbox";

/** Sticky ring on the most recently toggled select checkbox. */
export const SELECT_CHECKBOX_LAST_CLICKED_CLASSNAME =
  "mp-select-checkbox-last-clicked";

export function selectCheckboxClassName(options?: {
  lastClicked?: boolean;
  className?: string;
}): string {
  return cn(
    SELECT_CHECKBOX_CLASSNAME,
    options?.lastClicked && SELECT_CHECKBOX_LAST_CLICKED_CLASSNAME,
    options?.className
  );
}
