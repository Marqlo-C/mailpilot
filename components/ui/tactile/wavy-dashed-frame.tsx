"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
} from "react";

import { buildWavyRoundedRectPath } from "@/lib/constants/wave-geometry";
import { cn } from "@/lib/utils";

type WavyDashedFrameProps = HTMLAttributes<HTMLDivElement>;

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
          className="pointer-events-none absolute inset-0 h-full w-full text-border/70"
          viewBox={`0 0 ${size.w} ${size.h}`}
          fill="none"
          aria-hidden="true"
        >
          <path
            d={d}
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="3 3"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : null}
      {children}
    </div>
  );
}
