"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  WAVY_DASH_STROKE,
  WAVE_DASH_LINE_AMP_Y,
  WAVE_DASH_LINE_MID_Y,
  WAVE_DASH_LINE_VB,
  WAVE_DASH_PLACEHOLDER,
  buildWaveFluidPath,
  buildWavePath,
} from "@/lib/constants/wave-geometry";
import { cn } from "@/lib/utils";

export type WavyDashedLineProps = {
  orientation?: "horizontal" | "vertical";
  /**
   * `wavy` — squiggle hairline (default).
   * `straight` — flat dashed hairline using the same stroke tokens.
   */
  variant?: "wavy" | "straight";
  /**
   * When true (horizontal wavy only), fill everything below the wave so the
   * squiggle is the plate cutoff edge. Uses `--mp-wavy-cutoff-fill` when set,
   * otherwise `hsl(var(--muted))`.
   */
  cutoffFill?: boolean;
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
 * Reusable, resizable dashed hairline (wavy or straight).
 * Starts from {@link WAVE_DASH_PLACEHOLDER} so the wave paints on first HTML
 * (same stand-in as {@link WavyDashedFrame}); layout then locks wavelength.
 */
export function WavyDashedLine({
  orientation = "horizontal",
  variant = "wavy",
  cutoffFill = false,
  length: lengthProp,
  className,
}: WavyDashedLineProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Placeholder length so SSR / first paint already has a wave (frame pattern).
  const [measured, setMeasured] = useState<number>(WAVE_DASH_PLACEHOLDER.w);
  const isVertical = orientation === "vertical";
  const stretchVertical = isVertical && lengthProp == null;
  const isStraight = variant === "straight";
  const useCutoff = cutoffFill && !isVertical && !isStraight;

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

  const length = lengthProp ?? measured;
  const paths = useMemo(() => {
    if (length <= 0) return { line: "", fluid: "" };
    if (isStraight) {
      return {
        line: `M 0 ${WAVE_DASH_LINE_MID_Y} L ${length} ${WAVE_DASH_LINE_MID_Y}`,
        fluid: "",
      };
    }
    if (useCutoff) {
      const { linePath, fluidPath } = buildWaveFluidPath(
        length,
        WAVE_DASH_LINE_MID_Y,
        WAVE_DASH_LINE_AMP_Y,
        WAVE_DASH_LINE_VB
      );
      return { line: linePath, fluid: fluidPath };
    }
    return {
      line: buildWavePath(length, WAVE_DASH_LINE_MID_Y, WAVE_DASH_LINE_AMP_Y),
      fluid: "",
    };
  }, [length, isStraight, useCutoff]);

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
      {paths.line ? (
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
              d={paths.line}
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
            {paths.fluid ? (
              <path
                d={paths.fluid}
                fill="var(--mp-wavy-cutoff-fill, hsl(var(--muted)))"
                stroke="none"
              />
            ) : null}
            <path
              d={paths.line}
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
