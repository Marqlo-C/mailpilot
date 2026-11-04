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
      // Avoid size="icon" (h-9 w-9) — tall thin kebab: h-8 × half-width.
      className={cn(
        // Invert of primary CTA (Unsubscribe): mint fill, dark shell dots.
        "h-8 w-4 min-w-4 shrink-0 rounded-lg border-0 bg-[#e4f7f3] p-0 text-[#181e26] shadow-none hover:bg-[#181e26] hover:text-[#e4f7f3] [&_svg]:size-4",
        className
      )}
      {...props}
    >
      <SolidKebab className="size-4" />
      <span className="sr-only">{label}</span>
    </Button>
  );
});
RowMenuTrigger.displayName = "RowMenuTrigger";
