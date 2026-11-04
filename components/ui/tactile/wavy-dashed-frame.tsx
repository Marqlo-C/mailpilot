"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
} from "react";

import {
  buildWavePath,
  buildWavyRoundedRectPath,
} from "@/lib/constants/wave-geometry";
import { cn } from "@/lib/utils";

type WavyDashedFrameProps = HTMLAttributes<HTMLDivElement>;

/** Same dash + ink as {@link WavyDashedFrame}. */
const WAVY_DASH_STROKE = {
  className: "text-muted-foreground/30",
  strokeWidth: 1,
  strokeDasharray: "3 3",
} as const;

/** Compact amplitude so short rules stay hairline-thin. */
const RULE_AMP_Y = 1.5;
const RULE_MID_Y = 3;
const RULE_VB_H = 6;

/**
 * Rounded frame whose dashed stroke follows the same wave as the slider.
 * The box size is measured so the wavelength stays constant in pixels.
 */
export function WavyDashedFrame({
  className,
  children,
  ...rest
}: WavyDashedFrameProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const w = Math.round(el.clientWidth);
      const h = Math.round(el.clientHeight);
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const d = useMemo(
    () =>
      size.w > 0 && size.h > 0
        ? buildWavyRoundedRectPath(size.w, size.h)
        : "",
    [size.w, size.h]
  );

  return (
    <div ref={ref} className={cn("relative", className)} {...rest}>
      {d ? (
        <svg
          className={cn(
            "pointer-events-none absolute inset-0 h-full w-full",
            WAVY_DASH_STROKE.className
          )}
          viewBox={`0 0 ${size.w} ${size.h}`}
          fill="none"
          aria-hidden="true"
        >
          <path
            d={d}
            stroke="currentColor"
            strokeWidth={WAVY_DASH_STROKE.strokeWidth}
            strokeDasharray={WAVY_DASH_STROKE.strokeDasharray}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : null}
      {children}
    </div>
  );
}

type WavyDashedRuleProps = {
  orientation?: "horizontal" | "vertical";
  /**
   * Length along the rule in CSS pixels.
   * Horizontal defaults to measured parent width; vertical defaults to 16 (h-4).
   */
  length?: number;
  className?: string;
};

/**
 * Single wavy dashed hairline — same wave + dash as {@link WavyDashedFrame}.
 * Vertical rules are the horizontal path rotated 90°.
 */
export function WavyDashedRule({
  orientation = "horizontal",
  length: lengthProp,
  className,
}: WavyDashedRuleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(0);
  const isVertical = orientation === "vertical";
  const fixedLength = lengthProp ?? (isVertical ? 16 : undefined);

  useEffect(() => {
    if (fixedLength != null) return;
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const next = Math.round(
        isVertical ? el.clientHeight : el.clientWidth
      );
      setMeasured((prev) => (prev === next ? prev : next));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [fixedLength, isVertical]);

  const length = fixedLength ?? measured;
  const d = useMemo(
    () =>
      length > 0 ? buildWavePath(length, RULE_MID_Y, RULE_AMP_Y) : "",
    [length]
  );

  return (
    <div
      ref={ref}
      className={cn(
        "pointer-events-none flex items-center justify-center",
        isVertical ? "h-4 w-[6px] shrink-0 self-center" : "h-[6px] w-full",
        className
      )}
      aria-hidden
    >
      {d ? (
        <svg
          className={cn(
            WAVY_DASH_STROKE.className,
            isVertical ? "origin-center rotate-90" : "h-full w-full"
          )}
          width={isVertical ? length : undefined}
          height={isVertical ? RULE_VB_H : undefined}
          viewBox={`0 0 ${length} ${RULE_VB_H}`}
          fill="none"
          preserveAspectRatio={isVertical ? "xMidYMid meet" : "none"}
        >
          <path
            d={d}
            stroke="currentColor"
            strokeWidth={WAVY_DASH_STROKE.strokeWidth}
            strokeDasharray={WAVY_DASH_STROKE.strokeDasharray}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : null}
    </div>
  );
}
