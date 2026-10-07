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

/** Solid vertical kebab dots (sidebar ink via currentColor). */
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
        // Rest + hover: secondary-teal dots. Hover fill stays sidebar.
        "h-8 w-8 rounded-lg border-0 bg-muted/70 text-[hsl(174_32%_42%)] shadow-none hover:bg-[hsl(var(--sidebar))] hover:text-[hsl(174_32%_42%)]",
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
