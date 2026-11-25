"use client";

import {
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react";

import { cn } from "@/lib/utils";

export type NumberTickerProps = {
  value: number;
  /** First paint / reduced-motion baseline. Later updates animate from the last shown value. */
  startValue?: number;
  /** Animation length in ms. */
  durationMs?: number;
  decimalPlaces?: number;
  prefix?: string;
  suffix?: string;
  /**
   * When true (default), decreases snap instead of counting backward —
   * progress numerators should only ease upward.
   */
  monotonic?: boolean;
} & Omit<ComponentPropsWithoutRef<"span">, "children">;

function prefersReducedMotion(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Count to a target number. Magic UI–style API without a Motion dependency.
 * Re-animates from the last displayed value when `value` changes (Ace queue).
 */
export function NumberTicker({
  value,
  startValue = 0,
  durationMs = 550,
  decimalPlaces = 0,
  prefix = "",
  suffix = "",
  monotonic = true,
  className,
  ...props
}: NumberTickerProps) {
  const canAnimate =
    typeof window !== "undefined" && typeof requestAnimationFrame === "function";
  const initialDisplay = canAnimate ? startValue : value;
  const [display, setDisplay] = useState(initialDisplay);
  const displayRef = useRef(initialDisplay);
  const reducedRef = useRef(false);

  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
  }, []);

  useEffect(() => {
    const from = displayRef.current;
    const to = value;

    if (
      typeof requestAnimationFrame !== "function" ||
      typeof cancelAnimationFrame !== "function" ||
      reducedRef.current ||
      from === to ||
      (monotonic && to < from)
    ) {
      displayRef.current = to;
      setDisplay(to);
      return;
    }

    const startedAt = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      const next = from + (to - from) * eased;
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        displayRef.current = to;
        setDisplay(to);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs, monotonic]);

  const formatted = Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  }).format(Number(display.toFixed(decimalPlaces)));

  return (
    <span
      suppressHydrationWarning
      className={cn("inline-block tabular-nums tracking-tight", className)}
      {...props}
    >
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
