"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RowMenuTriggerProps = Omit<
  React.ComponentPropsWithoutRef<typeof Button>,
  "children" | "variant" | "size"
> & {
  label: string;
};

/** Solid vertical kebab dots (slider teal via currentColor). */
function SolidKebab({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="3.5" r="2.1" />
      <circle cx="12" cy="12" r="2.1" />
      <circle cx="12" cy="20.5" r="2.1" />
    </svg>
  );
}

/**
 * Borderless ⋮ trigger for row/card action menus.
 * Use with `<DropdownMenuTrigger asChild>`.
 */
export const RowMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  RowMenuTriggerProps
>(({ label, className, type = "button", ...props }, ref) => {
  return (
    <Button
      ref={ref}
      type={type}
      variant="ghost"
      size="icon"
      className={cn(
        // Color matches wavy slider BRAND_TEAL (#1ab5af).
        "h-8 w-8 rounded-lg border-0 text-[#1ab5af] shadow-none hover:bg-muted/70 hover:text-[#1ab5af]",
        className
      )}
      {...props}
    >
      <SolidKebab className="size-5" />
      <span className="sr-only">{label}</span>
    </Button>
  );
});
RowMenuTrigger.displayName = "RowMenuTrigger";
