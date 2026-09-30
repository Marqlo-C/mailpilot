"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/** Brand teal for active wave stroke / thumb / origin. */
const BRAND_TEAL = "#1ab5af";

/** Wave geometry in CSS pixels — constant across all slider lengths. */
const WAVE_HALF_PX = 7;
const WAVE_MID_Y = 6;
const WAVE_AMP_Y = 3;
const WAVE_VB_H = 12;

/**
 * Build a squiggle path for an exact pixel width without stretching.
 * Longer tracks get more cycles; amplitude stays fixed.
 */
function buildWavePath(widthPx: number): string {
  const width = Math.max(WAVE_HALF_PX * 2, Math.ceil(widthPx));
  let d = `M 0 ${WAVE_MID_Y} Q ${WAVE_HALF_PX} ${WAVE_MID_Y - WAVE_AMP_Y}, ${WAVE_HALF_PX * 2} ${WAVE_MID_Y}`;
  for (
    let x = WAVE_HALF_PX * 4;
    x <= width + WAVE_HALF_PX * 2;
    x += WAVE_HALF_PX * 2
  ) {
    d += ` T ${x} ${WAVE_MID_Y}`;
  }
  return d;
}

export type WavySliderProps = {
  value: number;
  onChange: (val: number) => void;
  /** Fires when the user finishes a drag / keyboard adjustment. */
  onCommit?: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /**
   * Horizontal length only — pass any Tailwind width utility
   * (e.g. `w-28 sm:w-36`, `w-48`, `w-full`). Defaults to full parent width.
   */
  widthClassName?: string;
  /** Extra layout classes (margin, shrink, etc). Do not put width here. */
  className?: string;
  "aria-label"?: string;
};

/**
 * Shared Material You–style squiggly slider.
 * Reuse anywhere; customize length via `widthClassName`.
 * Wave frequency and amplitude stay constant in CSS pixels.
 */
export function WavySlider({
  value,
  onChange,
  onCommit,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  widthClassName = "w-full",
  className,
  "aria-label": ariaLabel,
}: WavySliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(0);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const update = () => {
      const next = Math.round(el.getBoundingClientRect().width);
      setTrackWidth((prev) => (prev === next ? prev : next));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const wavePath = useMemo(
    () => buildWavePath(trackWidth || WAVE_HALF_PX * 12),
    [trackWidth]
  );
  const waveVbW = Math.max(WAVE_HALF_PX * 2, trackWidth || WAVE_HALF_PX * 12);

  const clamped = Math.min(max, Math.max(min, value));
  const pct = max === min ? 0 : ((clamped - min) / (max - min)) * 100;

  function commitFromEvent(target: EventTarget | null) {
    if (!(target instanceof HTMLInputElement) || !onCommit) return;
    onCommit(Number(target.value));
  }

  return (
    <div
      ref={trackRef}
      className={cn(
        "group relative flex h-8 shrink-0 select-none items-center",
        widthClassName,
        disabled && "pointer-events-none opacity-50",
        className
      )}
    >
      {/* Finish end cap — centered on track end; no geometric overlap with the bar */}
      <div
        className="pointer-events-none absolute top-1/2 right-0 z-[1] h-1.5 w-1.5 translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/20"
        aria-hidden
      />

      {/* Inactive track stops at finish-cap center (half of 6px dot = 3px) */}
      <div className="pointer-events-none absolute top-1/2 left-0 right-[3px] z-0 h-[2px] -translate-y-1/2 rounded-full bg-muted-foreground/20" />

      {/* Active wavy track — pixel-locked path, clipped to value % */}
      <div
        className="pointer-events-none absolute inset-0 z-[1] flex items-center transition-[clip-path] duration-75"
        style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}
      >
        <svg
          className="h-3 w-full"
          viewBox={`0 0 ${waveVbW} ${WAVE_VB_H}`}
          preserveAspectRatio="none"
          fill="none"
          aria-hidden
        >
          <path
            d={wavePath}
            stroke={BRAND_TEAL}
            strokeWidth="2.5"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      {/* Start origin — same size/centering as finish; hidden under thumb at 0 */}
      <div
        className={cn(
          "pointer-events-none absolute top-1/2 left-0 z-[1] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-100",
          clamped > 0 ? "bg-[#1ab5af]" : "bg-muted-foreground/20 opacity-0"
        )}
        aria-hidden
      />

      {/* Thumb + MD3 state halo */}
      <div
        className="pointer-events-none absolute top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center transition-[left] duration-75"
        style={{ left: `${pct}%` }}
        aria-hidden
      >
        <div
          className={cn(
            "absolute z-0 h-7 w-7 scale-0 rounded-full border border-[#1ab5af]/30 bg-[#e4f7f3] transition-transform duration-150 ease-out dark:bg-[#1ab5af]/20",
            "group-hover:scale-100 group-focus-within:scale-100",
            "group-active:scale-125",
            "group-focus-within:ring-2 group-focus-within:ring-[#1ab5af]/40"
          )}
        />
        <div className="relative z-10 h-2.5 w-2.5 rounded-full bg-[#1ab5af] shadow-sm transition-transform duration-100 group-active:scale-110" />
      </div>

      {/* Transparent interaction layer */}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={clamped}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(Number(e.target.value))}
        onMouseUp={(e) => commitFromEvent(e.currentTarget)}
        onTouchEnd={(e) => commitFromEvent(e.currentTarget)}
        onKeyUp={(e) => {
          if (
            e.key === "ArrowLeft" ||
            e.key === "ArrowRight" ||
            e.key === "ArrowUp" ||
            e.key === "ArrowDown" ||
            e.key === "Home" ||
            e.key === "End" ||
            e.key === "PageUp" ||
            e.key === "PageDown"
          ) {
            commitFromEvent(e.currentTarget);
          }
        }}
        className="absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
    </div>
  );
}
