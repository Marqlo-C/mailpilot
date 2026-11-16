"use client";

import { cn } from "@/lib/utils";

/**
 * Curved divider separating card/sidebar header from body.
 * Arches across horizontally and curves downward into the body at both ends,
 * matching the host’s corner radius (12 = rounded-xl, 16 = rounded-2xl).
 */
export function CurvedCardDivider({
  className,
  /** Corner radius in px. Defaults to settings-card `rounded-xl`. */
  radius = 12,
}: {
  className?: string;
  radius?: number;
}) {
  const r = Math.max(radius, 2);
  const size = r;
  const sweep = r - 0.5;
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative z-10 flex w-full items-start overflow-hidden pointer-events-none select-none text-border/60 -mb-3",
        className
      )}
    >
      {/* Left corner: from side wall up to the hairline */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
        className="shrink-0 overflow-visible"
      >
        <path
          d={`M 0.5 ${size} A ${sweep} ${sweep} 0 0 1 ${size} 0.5`}
          stroke="currentColor"
          strokeWidth="1"
        />
      </svg>

      <div className="flex-1 border-t border-current" />

      {/* Right corner: from hairline down the side wall */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
        className="shrink-0 overflow-visible"
      >
        <path
          d={`M 0 0.5 A ${sweep} ${sweep} 0 0 1 ${size - 0.5} ${size}`}
          stroke="currentColor"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}

/**
 * Vertical separator that traces the same silhouette as a rounded-2xl
 * pill’s left outer edge (end-cap): top corner → left side → bottom corner.
 *
 * Defaults match the bottom bulk-action pill (`h-11` + `rounded-2xl`).
 */
export function CurvedVerticalDivider({
  className,
  /** Pill height in px (bulk flyout shell is 44 / h-11). */
  height = 44,
  /** Corner radius in px (`rounded-2xl` = 16). */
  radius = 16,
}: {
  className?: string;
  height?: number;
  radius?: number;
}) {
  const r = Math.min(radius, height / 2);
  const w = r + 1;
  const d = [
    `M ${r} 0.5`,
    `A ${r - 0.5} ${r - 0.5} 0 0 0 0.5 ${r}`,
    `L 0.5 ${height - r}`,
    `A ${r - 0.5} ${r - 0.5} 0 0 0 ${r} ${height - 0.5}`,
  ].join(" ");

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none flex shrink-0 items-center justify-center text-white/10 select-none",
        className
      )}
      style={{ width: w, height }}
    >
      <svg
        width={w}
        height={height}
        viewBox={`0 0 ${w} ${height}`}
        fill="none"
        className="overflow-visible"
      >
        <path d={d} stroke="currentColor" strokeWidth="1" fill="none" />
      </svg>
    </div>
  );
}
