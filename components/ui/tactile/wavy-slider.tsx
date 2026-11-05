"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import {
  BRAND_TEAL,
  WAVE_HALF_PX,
  WAVE_SEGMENT_PX,
  WAVE_SLIDER_VB_H as WAVE_VB_H,
  buildWavePath,
  getSynchronizedWavePhase,
} from "@/lib/constants/wave-geometry";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
 * After place, the active wave crawls until the slider is touched again.
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
  const waveGroupRef = useRef<SVGGElement>(null);
  const inactiveWaveGroupRef = useRef<SVGGElement>(null);
  const waveRafRef = useRef<number | null>(null);
  const interactingRef = useRef(false);
  const [trackWidth, setTrackWidth] = useState(0);
  const [waving, setWaving] = useState(false);

  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const update = () => {
      const next = Math.round(el.getBoundingClientRect().width);
      // Skip empty tracks so the thumb/wave land before first paint.
      if (next <= 0) return;
      setTrackWidth((prev) => (prev === next ? prev : next));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (waveRafRef.current != null) {
        cancelAnimationFrame(waveRafRef.current);
      }
    };
  }, []);

  // Waves stop 5px early (half of the 10px end cap) so stroke never overlaps the ball.
  const waveDrawWidth = Math.max(
    WAVE_SEGMENT_PX,
    (trackWidth || WAVE_HALF_PX * 12) - 5
  );
  const wavePath = useMemo(() => buildWavePath(waveDrawWidth), [waveDrawWidth]);
  const waveVbW = waveDrawWidth;

  const clamped = Math.min(max, Math.max(min, value));
  const pct = max === min ? 0 : ((clamped - min) / (max - min)) * 100;

  function applyWavePhase(phase: number) {
    const transform = `translate(${-phase} 0)`;
    waveGroupRef.current?.setAttribute("transform", transform);
    inactiveWaveGroupRef.current?.setAttribute("transform", transform);
  }

  function stopWave() {
    if (waveRafRef.current != null) {
      cancelAnimationFrame(waveRafRef.current);
      waveRafRef.current = null;
    }
    applyWavePhase(0);
    setWaving(false);
  }

  function startWave(currentValue: number) {
    if (disabled) return;
    if (prefersReducedMotion()) return;
    if (currentValue <= min) {
      stopWave();
      return;
    }

    if (waveRafRef.current != null) {
      cancelAnimationFrame(waveRafRef.current);
      waveRafRef.current = null;
    }

    setWaving(true);
    const tick = (now: number) => {
      // Globally synchronized phase; full period so the loop seams invisibly.
      // Active + inactive share phase so the thumb join stays continuous.
      applyWavePhase(getSynchronizedWavePhase(now));
      waveRafRef.current = requestAnimationFrame(tick);
    };
    waveRafRef.current = requestAnimationFrame(tick);
  }

  // Start on mount / refresh (and after async threshold hydration), not mid-drag.
  const waveVisible = clamped > min;
  useEffect(() => {
    if (disabled) {
      stopWave();
      return;
    }
    if (interactingRef.current) return;
    if (waveVisible) startWave(clamped);
    else stopWave();
    return () => {
      if (waveRafRef.current != null) {
        cancelAnimationFrame(waveRafRef.current);
        waveRafRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when wave presence changes
  }, [disabled, waveVisible]);

  function beginInteract() {
    interactingRef.current = true;
    stopWave();
  }

  function commitFromEvent(target: EventTarget | null) {
    if (!(target instanceof HTMLInputElement)) return;
    const next = Number(target.value);
    interactingRef.current = false;
    startWave(next);
    onCommit?.(next);
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
      data-waving={waving ? "true" : undefined}
    >
      {/* Finish end cap — same diameter as the thumb; sits above the wave */}
      <div
        className="pointer-events-none absolute top-1/2 right-0 z-[2] h-2.5 w-2.5 translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/20"
        aria-hidden
      />

      {/* Waves stop at the end-cap left edge (half of h-2.5) so they never paint over it */}
      {/* Inactive wavy remainder — solid muted guide (not dashed), same geometry as active */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 right-[5px] z-0 flex items-center transition-[clip-path] duration-75"
        style={{ clipPath: `inset(0 0 0 ${pct}%)` }}
        aria-hidden
      >
        <svg
          className="h-3 w-full text-muted-foreground"
          viewBox={`0 0 ${waveVbW} ${WAVE_VB_H}`}
          preserveAspectRatio="none"
          fill="none"
        >
          <g ref={inactiveWaveGroupRef}>
            <path
              d={wavePath}
              stroke="currentColor"
              strokeOpacity={0.2}
              strokeWidth="2.5"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        </svg>
      </div>

      {/* Active wavy track — pixel-locked path, clipped to value % */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 right-[5px] z-[1] flex items-center transition-[clip-path] duration-75"
        style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}
      >
        <svg
          className="h-3 w-full drop-shadow-[0_0_6px_rgba(26,181,175,0.35)]"
          viewBox={`0 0 ${waveVbW} ${WAVE_VB_H}`}
          preserveAspectRatio="none"
          fill="none"
          aria-hidden
        >
          <g ref={waveGroupRef}>
            <path
              d={wavePath}
              stroke={BRAND_TEAL}
              strokeWidth="2.5"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        </svg>
      </div>

      {/* Start origin — 7px; hidden under thumb at 0 */}
      <div
        className={cn(
          "pointer-events-none absolute top-1/2 left-0 z-[2] h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-100",
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
            "absolute z-0 h-7 w-7 scale-0 rounded-full border border-[#1ab5af]/30 bg-[#e4f7f3] transition-transform duration-300 ease-out dark:bg-[#1ab5af]/20",
            // Hover / press only for pointer; focus-visible so mouse drag doesn't leave a sticky halo
            "group-hover:scale-100 group-has-[:focus-visible]:scale-100",
            "group-active:scale-125",
            "group-has-[:focus-visible]:ring-2 group-has-[:focus-visible]:ring-[#1ab5af]/40"
          )}
        />
        <div className="relative z-10 h-2.5 w-2.5 rounded-full bg-[#1ab5af] shadow-[0_0_6px_rgba(26,181,175,0.35)] transition-transform duration-100 group-active:scale-110" />
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
        onPointerDown={beginInteract}
        onKeyDown={(e) => {
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
            beginInteract();
          }
        }}
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
