import { forwardRef, type SVGProps } from "react";

import { MailEnvelopeBrBite } from "@/components/ui/icons/glyph-frames";
import {
  SparklesLrCenterStar,
  SparklesUlPlusMarks,
} from "@/components/ui/icons/sparkles-accents";
import { cn } from "@/lib/utils";

/**
 * MailPilot Snapshot glyph — Lucide Mail + mop/broom-style plus sparkles at UL,
 * plus a Lucide Sparkles center star cutting through the lower-right corner.
 * Normal 24×24 mail frame; sparkles overflow via `overflow: visible`.
 */
export const SnapshotIcon = forwardRef<
  SVGSVGElement,
  SVGProps<SVGSVGElement>
>(function SnapshotIcon(
  { className, width = 24, height = 24, ...props },
  ref
) {
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
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("overflow-visible", className)}
      aria-hidden
      {...props}
    >
      <MailEnvelopeBrBite />
      <SparklesUlPlusMarks />
      <SparklesLrCenterStar />
    </svg>
  );
});

/** @deprecated Prefer {@link SnapshotIcon}. */
export const MailSparkles = SnapshotIcon;
