import { forwardRef, type SVGProps } from "react";

import { FilePageBrBite } from "@/components/ui/icons/glyph-frames";
import {
  ACE_REGEN_STROKE,
  RotateLrMark,
} from "@/components/ui/icons/sparkles-accents";
import { cn } from "@/lib/utils";

/**
 * Ace resume rewrite glyph — file frame with LR RotateCw (no UL pluses;
 * Create keeps sparkles, Rewrite reads as “again”).
 */
export const FileRotateIcon = forwardRef<
  SVGSVGElement,
  SVGProps<SVGSVGElement>
>(function FileRotateIcon(
  {
    className,
    width = 24,
    height = 24,
    strokeWidth = ACE_REGEN_STROKE,
    ...props
  },
  ref
) {
  const strokeVisual =
    typeof strokeWidth === "number" ? strokeWidth : ACE_REGEN_STROKE;

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 24 24"
      overflow="visible"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("overflow-visible", className)}
      aria-hidden
      {...props}
    >
      <FilePageBrBite bottomEndX={11} bottomLineEndX={10.5} />
      <RotateLrMark strokeVisual={strokeVisual} />
    </svg>
  );
});
