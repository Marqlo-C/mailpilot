"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { WAVY_DASH_STROKE } from "@/lib/constants/wave-geometry";
import { cn } from "@/lib/utils";

/**
 * Apply to Lucide (or any path-based) icons so their outline crawls with the
 * same dash tokens as {@link DashedBorderRing}.
 */
export const DASHED_OUTLINE_STROKE_CLASSNAME =
  "text-[hsl(var(--muted-foreground)/0.45)] [&_path]:[stroke-dasharray:3_3] motion-safe:animate-wavy-dash";

/**
 * Pair on a parent that uses `[&_svg]:size-*` so this ring isn’t shrunk with icons.
 */
export const DASHED_BORDER_RING_PARENT_SVG_CLASSNAME =
  "[&_svg.dashed-border-ring]:!inset-0 [&_svg.dashed-border-ring]:!size-full";

export type DashedBorderRingProps = {
  className?: string;
  /** Corner radius in CSS px (`6` ≈ `rounded-md`). */
  rx?: number;
  /** Punch out a corner so a badge/bubble can sit on the rim. */
  cutout?: "none" | "top-right";
};

const CUTOUT_MASK: Record<
  NonNullable<DashedBorderRingProps["cutout"]>,
  string | undefined
> = {
  none: undefined,
  "top-right":
    "[mask-image:radial-gradient(circle_13px_at_100%_0%,transparent_70%,#000_82%)] [-webkit-mask-image:radial-gradient(circle_13px_at_100%_0%,transparent_70%,#000_82%)]",
};

/**
 * Crawling dashed rect locked to the parent’s border box.
 * Parent should be `relative` (and usually `overflow-visible`).
 */
export function DashedBorderRing({
  className,
  rx = 6,
  cutout = "none",
}: DashedBorderRingProps) {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 32, h: 32 });

  useLayoutEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const inset = WAVY_DASH_STROKE.strokeWidth / 2;
  const corner = Math.max(0, rx - inset);

  return (
    <svg
      ref={ref}
      aria-hidden
      viewBox={`0 0 ${size.w} ${size.h}`}
      className={cn(
        "dashed-border-ring pointer-events-none absolute inset-0 z-[1] !size-full overflow-visible",
        CUTOUT_MASK[cutout],
        className
      )}
    >
      <rect
        x={inset}
        y={inset}
        width={Math.max(0, size.w - inset * 2)}
        height={Math.max(0, size.h - inset * 2)}
        rx={corner}
        ry={corner}
        fill="none"
        stroke={WAVY_DASH_STROKE.stroke}
        strokeWidth={WAVY_DASH_STROKE.strokeWidth}
        strokeDasharray={WAVY_DASH_STROKE.strokeDasharray}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className="motion-safe:animate-wavy-dash"
      />
    </svg>
  );
}
