"use client";

/**
 * SHELVED dual-wave slider experiment (teal + magenta counter-wave).
 * Not wired into toolbars/settings — those use {@link WavySlider}.
 * Swap imports or pass this component when you want to revisit.
 *
 * Magenta: brighter #7E1D6B → #C24A9A, 5× amplitude, ½ frequency,
 * periods fitted to start/end dots, standing-wave idle motion.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const BRAND_TEAL = "#1ab5af";
const COUNTER_MAGENTA = "#C24A9A";

const WAVE_HALF_PX = 7;
const WAVE_AMP_Y = 3;
const COUNTER_AMP_Y = WAVE_AMP_Y * 5;
const WAVE_PAD_Y = 2;
const WAVE_MID_Y = COUNTER_AMP_Y + WAVE_PAD_Y;
const WAVE_VB_H = WAVE_MID_Y * 2;
const WAVE_SEGMENT_PX = WAVE_HALF_PX * 2;
const WAVE_PERIOD_PX = WAVE_SEGMENT_PX * 2;
const WAVE_CYCLE_MS = 1900;

function fitWavePeriods(widthPx: number): {
  width: number;
  tealPeriod: number;
  magentaPeriod: number;
} {
  const width = Math.max(WAVE_SEGMENT_PX, Math.ceil(widthPx));
  const tealCycles = Math.max(2, 2 * Math.round(width / (2 * WAVE_PERIOD_PX)));
  const magentaCycles = Math.max(1, tealCycles / 2);
  return {
    width,
    tealPeriod: width / tealCycles,
    magentaPeriod: width / magentaCycles,
  };
}

function buildWavePath(
  width: number,
  ampY: number,
  periodPx: number,
  invert = false
): string {
  const sign = invert ? -1 : 1;
  let d = "";
  for (let x = 0; x <= width; x += 1) {
    const y =
      WAVE_MID_Y +
      sign * ampY * Math.sin((2 * Math.PI * x) / periodPx);
    d += x === 0 ? `M ${x} ${y.toFixed(2)}` : ` L ${x} ${y.toFixed(2)}`;
  }
  d += ` L ${width} ${WAVE_MID_Y}`;
  return d;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export type WavySliderDualProps = {
  value: number;
  onChange: (val: number) => void;
  onCommit?: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  widthClassName?: string;
  className?: string;
  "aria-label"?: string;
};

/** Shelved dual-ribbon wavy slider — not used by app chrome currently. */
export function WavySliderDual({
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
}: WavySliderDualProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const waveGroupRef = useRef<SVGGElement>(null);
  const waveRafRef = useRef<number | null>(null);
  const interactingRef = useRef(false);
  const [trackWidth, setTrackWidth] = useState(0);
  const [waving, setWaving] = useState(false);

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

  useEffect(() => {
    return () => {
      if (waveRafRef.current != null) {
        cancelAnimationFrame(waveRafRef.current);
      }
    };
  }, []);

  const periods = useMemo(
    () => fitWavePeriods(trackWidth || WAVE_HALF_PX * 12),
    [trackWidth]
  );
  const wavePath = useMemo(
    () =>
      buildWavePath(periods.width, WAVE_AMP_Y, periods.tealPeriod, false),
    [periods]
  );
  const counterWavePath = useMemo(
    () =>
      buildWavePath(
        periods.width,
        COUNTER_AMP_Y,
        periods.magentaPeriod,
        true
      ),
    [periods]
  );

  const clamped = Math.min(max, Math.max(min, value));
  const pct = max === min ? 0 : ((clamped - min) / (max - min)) * 100;

  function stopWave() {
    if (waveRafRef.current != null) {
      cancelAnimationFrame(waveRafRef.current);
      waveRafRef.current = null;
    }
    const g = waveGroupRef.current;
    if (g) g.setAttribute("transform", "translate(0 0)");
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
    const start = performance.now();
    const tick = (now: number) => {
      const g = waveGroupRef.current;
      if (g) {
        const s = Math.cos(((now - start) / WAVE_CYCLE_MS) * Math.PI * 2);
        g.setAttribute(
          "transform",
          `translate(0 ${WAVE_MID_Y}) scale(1 ${s}) translate(0 ${-WAVE_MID_Y})`
        );
      }
      waveRafRef.current = requestAnimationFrame(tick);
    };
    waveRafRef.current = requestAnimationFrame(tick);
  }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      data-wave-style="dual"
    >
      <div
        className="pointer-events-none absolute top-1/2 right-0 z-[1] h-1.5 w-1.5 translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/20"
        aria-hidden
      />
      <div className="pointer-events-none absolute top-1/2 left-0 right-[3px] z-0 h-[2px] -translate-y-1/2 rounded-full bg-muted-foreground/20" />
      <div
        className="pointer-events-none absolute inset-0 z-[1] flex items-center transition-[clip-path] duration-75"
        style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}
      >
        <svg
          className="w-full"
          style={{ height: WAVE_VB_H }}
          viewBox={`0 0 ${periods.width} ${WAVE_VB_H}`}
          preserveAspectRatio="none"
          fill="none"
          aria-hidden
        >
          <g ref={waveGroupRef}>
            <path
              d={counterWavePath}
              stroke={COUNTER_MAGENTA}
              strokeWidth="2"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
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
      <div
        className={cn(
          "pointer-events-none absolute top-1/2 left-0 z-[1] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-100",
          clamped > 0 ? "bg-[#1ab5af]" : "bg-muted-foreground/20 opacity-0"
        )}
        aria-hidden
      />
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
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
              "End",
              "PageUp",
              "PageDown",
            ].includes(e.key)
          ) {
            beginInteract();
          }
        }}
        onChange={(e) => onChange(Number(e.target.value))}
        onMouseUp={(e) => commitFromEvent(e.currentTarget)}
        onTouchEnd={(e) => commitFromEvent(e.currentTarget)}
        onKeyUp={(e) => {
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
              "End",
              "PageUp",
              "PageDown",
            ].includes(e.key)
          ) {
            commitFromEvent(e.currentTarget);
          }
        }}
        className="absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
    </div>
  );
}
