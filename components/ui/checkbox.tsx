"use client";

import * as React from "react";

import { selectCheckboxClassName } from "@/components/ui/select-checkbox";
import { cn } from "@/lib/utils";

export type CheckboxProps = Omit<
  React.ComponentPropsWithoutRef<"input">,
  "type"
> & {
  onCheckedChange?: (checked: boolean) => void;
};

/** Project select checkbox: teal fill, white check, 14px box. */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, onCheckedChange, onChange, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      className={selectCheckboxClassName({
        className: cn("h-3.5 w-3.5 shrink-0 cursor-pointer", className),
      })}
      onChange={(event) => {
        onChange?.(event);
        onCheckedChange?.(event.currentTarget.checked);
      }}
      {...props}
    />
  )
);
Checkbox.displayName = "Checkbox";
