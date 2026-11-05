"use client";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
} from "react";

import {
  WAVY_DASH_STROKE,
  buildWavyRoundedRectPath,
} from "@/lib/constants/wave-geometry";
import { cn } from "@/lib/utils";

type WavyDashedFrameProps = HTMLAttributes<HTMLDivElement>;

/**
 * Rounded frame whose dashed stroke follows the same wave as the slider.
 * The box size is measured so the wavelength stays constant in pixels.
 * For a single hairline divider, use {@link WavyDashedLine}.
 */
export function WavyDashedFrame({
  className,
  children,
  ...rest
}: WavyDashedFrameProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const w = Math.round(el.clientWidth);
      const h = Math.round(el.clientHeight);
      // Skip empty boxes; never clear a good size (avoids post-paint blank).
      if (w <= 0 || h <= 0) return;
      setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const d = useMemo(
    () =>
      size && size.w > 0 && size.h > 0
        ? buildWavyRoundedRectPath(size.w, size.h)
        : "",
    [size]
  );

  return (
    <div ref={ref} className={cn("relative", className)} {...rest}>
      {d && size ? (
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${size.w} ${size.h}`}
          fill="none"
          aria-hidden="true"
        >
          <path
            d={d}
            stroke={WAVY_DASH_STROKE.stroke}
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
