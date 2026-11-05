import { forwardRef, type SVGProps } from "react";

import { cn } from "@/lib/utils";

/** Center 4-point star from Lucide `Sparkles` (the big middle glyph). */
const SPARKLES_CENTER_STAR =
  "M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z";

/** Star authored around ~(12,12); stroke compensated so weight stays ~2. */
const LR_STAR_SCALE = 0.52;

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
      {/*
        Envelope BR bite — one continuous stroke from right edge through TR
        corner across top/left/bottom; open at BR for the star.
      */}
      <path d="M22 12.5V6A2 2 0 0 0 20 4H4A2 2 0 0 0 2 6v12a2 2 0 0 0 2 2h6.5" />
      {/* Full Lucide Mail flap */}
      <path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" />
      {/* Close top-left pair — stock relative offset, outside mail UL */}
      <path d="M4 -1H2" />
      <path d="M3 -2v2" />
      <path d="M-2 1v4" />
      <path d="M0 3H-4" />
      {/* Lucide Sparkles center star — LR corner */}
      <g
        transform={`translate(20 20) scale(${LR_STAR_SCALE}) translate(-12 -12)`}
        strokeWidth={2 / LR_STAR_SCALE}
      >
        <path d={SPARKLES_CENTER_STAR} />
      </g>
    </svg>
  );
});

/** @deprecated Prefer {@link SnapshotIcon}. */
export const MailSparkles = SnapshotIcon;
