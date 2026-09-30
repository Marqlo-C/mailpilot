"use client";

import { cn } from "@/lib/utils";

/** Brand teal for active wave stroke / thumb / origin. */
const BRAND_TEAL = "#1ab5af";

export type WavySliderProps = {
  value: number;
  onChange: (val: number) => void;
  /** Fires when the user finishes a drag / keyboard adjustment. */
  onCommit?: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

/**
 * Material You–style squiggly track with MD3 hover/focus/pressed thumb halo.
 */
export function WavySlider({
  value,
  onChange,
  onCommit,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  className = "w-28 sm:w-36",
  "aria-label": ariaLabel,
}: WavySliderProps) {
  const clamped = Math.min(max, Math.max(min, value));
  const pct = max === min ? 0 : ((clamped - min) / (max - min)) * 100;

  function commitFromEvent(target: EventTarget | null) {
    if (!(target instanceof HTMLInputElement) || !onCommit) return;
    onCommit(Number(target.value));
  }

  return (
    <div
      className={cn(
        "group relative flex h-8 select-none items-center",
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

      {/* Active wavy track — full-width path, clipped to value % */}
      <div
        className="pointer-events-none absolute inset-0 z-[1] flex items-center transition-[clip-path] duration-75"
        style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}
      >
        <svg
          className="h-3 w-full"
          viewBox="0 0 300 12"
          preserveAspectRatio="none"
          fill="none"
          aria-hidden
        >
          <path
            d="M 0 6 Q 10 3, 20 6 T 40 6 T 60 6 T 80 6 T 100 6 T 120 6 T 140 6 T 160 6 T 180 6 T 200 6 T 220 6 T 240 6 T 260 6 T 280 6 T 300 6"
            stroke={BRAND_TEAL}
            strokeWidth="2.5"
            strokeLinecap="round"
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
