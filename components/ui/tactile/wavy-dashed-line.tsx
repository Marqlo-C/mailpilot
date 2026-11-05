"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  WAVY_DASH_STROKE,
  WAVE_DASH_LINE_AMP_Y,
  WAVE_DASH_LINE_MID_Y,
  WAVE_DASH_LINE_VB,
  buildWavePath,
} from "@/lib/constants/wave-geometry";
import { cn } from "@/lib/utils";

export type WavyDashedLineProps = {
  orientation?: "horizontal" | "vertical";
  /**
   * Length along the line in CSS pixels.
   * Omit to fill the parent: horizontal → width; vertical → height
   * (pair with `self-stretch` / `h-full` for a full-height divider).
   * Pass an explicit value for a fixed short tick.
   */
  length?: number;
  className?: string;
};

/**
 * Reusable, resizable wavy dashed hairline.
 * Wavelength stays constant in CSS pixels; resize via `length` or parent size.
 */
export function WavyDashedLine({
  orientation = "horizontal",
  length: lengthProp,
  className,
}: WavyDashedLineProps) {
  const ref = useRef<HTMLDivElement>(null);
  // null = not measured yet; never drop back to 0 after a good read (avoids
  // post-paint blank flashes when ResizeObserver/`Strict Mode` remount).
  const [measured, setMeasured] = useState<number | null>(null);
  const isVertical = orientation === "vertical";
  const stretchVertical = isVertical && lengthProp == null;

  useLayoutEffect(() => {
    if (lengthProp != null) return;
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const next = Math.round(
        isVertical ? el.clientHeight : el.clientWidth
      );
      if (next <= 0) return;
      setMeasured((prev) => (prev === next ? prev : next));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [lengthProp, isVertical]);

  const length = lengthProp ?? measured ?? 0;
  const d = useMemo(
    () =>
      length > 0
        ? buildWavePath(length, WAVE_DASH_LINE_MID_Y, WAVE_DASH_LINE_AMP_Y)
        : "",
    [length]
  );

  return (
    <div
      ref={ref}
      className={cn(
        "pointer-events-none flex items-center justify-center",
        isVertical
          ? stretchVertical
            ? "h-full shrink-0 self-stretch"
            : "shrink-0 self-center"
          : "w-full",
        className
      )}
      style={
        isVertical
          ? {
              width: WAVE_DASH_LINE_VB,
              ...(lengthProp != null ? { height: lengthProp } : null),
            }
          : { height: WAVE_DASH_LINE_VB }
      }
      aria-hidden
    >
      {d ? (
        isVertical ? (
          // Map horizontal wave (x, y) → (y, x) so amplitude becomes horizontal
          // wiggle on a tall viewBox. CSS rotate-90 clips in a 6px column.
          <svg
            className="h-full w-full"
            width={WAVE_DASH_LINE_VB}
            height={length}
            viewBox={`0 0 ${WAVE_DASH_LINE_VB} ${length}`}
            fill="none"
            preserveAspectRatio="none"
          >
            <path
              d={d}
              transform="matrix(0 1 1 0 0 0)"
              stroke={WAVY_DASH_STROKE.stroke}
              strokeWidth={WAVY_DASH_STROKE.strokeWidth}
              strokeDasharray={WAVY_DASH_STROKE.strokeDasharray}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : (
          <svg
            className="h-full w-full"
            viewBox={`0 0 ${length} ${WAVE_DASH_LINE_VB}`}
            fill="none"
            preserveAspectRatio="none"
          >
            <path
              d={d}
              stroke={WAVY_DASH_STROKE.stroke}
              strokeWidth={WAVY_DASH_STROKE.strokeWidth}
              strokeDasharray={WAVY_DASH_STROKE.strokeDasharray}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )
      ) : null}
    </div>
  );
}

/** @deprecated Prefer {@link WavyDashedLine}. */
export const WavyDashedRule = WavyDashedLine;
