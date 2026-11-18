import { cn } from "@/lib/utils";

/** Teal fill + white check — shared Job Radar / Subscriptions select checkboxes with expanded touch hit target (16px box). */
export const SELECT_CHECKBOX_CLASSNAME =
  "mp-select-checkbox size-4 shrink-0 cursor-pointer relative before:absolute before:-inset-2 before:content-['']";

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
