import { forwardRef, type SVGProps } from "react";

import { FilePageBrBite } from "@/components/ui/icons/glyph-frames";
import {
  COMPOSITE_STROKE,
  SparklesLrCenterStar,
  SparklesUlPlusMarks,
} from "@/components/ui/icons/sparkles-accents";
import { cn } from "@/lib/utils";

/**
 * Tailored-resume / attach-file glyph — Lucide FileText with the same UL plus
 * marks + LR Sparkles center star as {@link SnapshotIcon}. BR corner of the
 * page is open so the star cuts through; sparkles overflow via `overflow: visible`.
 */
export const FileSparklesIcon = forwardRef<
  SVGSVGElement,
  SVGProps<SVGSVGElement>
>(function FileSparklesIcon(
  {
    className,
    width = 24,
    height = 24,
    strokeWidth = COMPOSITE_STROKE,
    ...props
  },
  ref
) {
  const strokeVisual =
    typeof strokeWidth === "number" ? strokeWidth : COMPOSITE_STROKE;

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
      <FilePageBrBite />
      <SparklesUlPlusMarks />
      <SparklesLrCenterStar strokeVisual={strokeVisual} />
    </svg>
  );
});
