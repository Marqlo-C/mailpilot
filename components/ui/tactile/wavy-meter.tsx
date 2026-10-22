"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  BRAND_TEAL,
  buildWaveFluidPath,
  getSynchronizedWavePhase,
} from "@/lib/constants/wave-geometry";
import {
  readWavyMeterPreference,
  WAVY_METER_CHANGE_EVENT,
  type WavyMeterVariant,
} from "@/lib/ui/wavy-meter-preference";

export type WavyMeterTone = "default" | "warning" | "destructive" | "auto";
export type { WavyMeterVariant };

export interface WavyMeterProps {
  /** Current value (either numeric usage count or direct 0-100 percentage) */
  value: number;
  /** Maximum possible value. Defaults to 100. */
  max?: number;
  /** Minimum possible value. Defaults to 0. */
  min?: number;
  /** Visual status tone. 'auto' selects based on percentage (>=90 warning, >=100 destructive). */
  tone?: WavyMeterTone;
  /** Style variant. "light" uses clear fluid well; "dark" uses the deep forest teal well (#0b2b28) from WaveToggle. Both maintain a neutral grey unfilled track. */
  variant?: WavyMeterVariant | "auto";
  /** Optional account ID for user-specific preference resolution when variant is "auto". */
  accountId?: string | null;
  /** Optional custom container classes (e.g. custom height like `h-4` or width) */
  className?: string;
  /** Accessible label */
  "aria-label"?: string;
}

const LIGHT_THEME = {
  // Unfilled part past current used stays neutral grey
  container: "border-black/20 dark:border-white/25 bg-muted/40 shadow-inner",
  guideStroke: "currentColor",
  guideOpacity: "opacity-20 dark:opacity-25",
  guideClassName: "text-muted-foreground",
  meniscusColor: "bg-white/70 shadow-[0_0_5px_rgba(255,255,255,0.85)]",
  tones: {
    default: {
      // Matches the exact light teal chamber used in the light toggle switch well
      chamberBg:
        "bg-teal-500/15 dark:bg-teal-950/45 shadow-[inset_0_1px_2px_rgba(13,148,136,0.22)]",
      top: "#2dd4bf", // vibrant teal/turquoise crest
      bottom: BRAND_TEAL, // tactile brand teal base (#1ab5af)
      crestStroke: "#ffffff", // clean white waterline matching light toggle
      crestHighlight: "#ffffff", // luminous surface highlight
    },
    warning: {
      chamberBg:
        "bg-amber-500/15 dark:bg-amber-950/45 shadow-[inset_0_1px_2px_rgba(180,83,9,0.2)]",
      top: "#fde047", // amber-300 crest
      bottom: "#d97706", // amber-600 base
      crestStroke: "#ffffff",
      crestHighlight: "#ffffff",
    },
    destructive: {
      chamberBg:
        "bg-rose-500/15 dark:bg-rose-950/45 shadow-[inset_0_1px_2px_rgba(225,29,72,0.2)]",
      top: "#fb7185", // rose-400 crest
      bottom: "#e11d48", // rose-600 base
      crestStroke: "#ffffff",
      crestHighlight: "#ffffff",
    },
  },
};

const DARK_THEME = {
  // Unfilled part past current used stays neutral grey like the light version
  container: "border-black/20 dark:border-white/25 bg-muted/40 shadow-inner",
  guideStroke: "currentColor",
  guideOpacity: "opacity-20 dark:opacity-25",
  guideClassName: "text-muted-foreground",
  meniscusColor: "bg-teal-200/60 shadow-[0_0_5px_rgba(94,234,212,0.8)]",
  tones: {
    default: {
      // Filled chamber uses the exact top fill color of the toggle well: #0b2b28 (dark: #071f1d)
      chamberBg:
        "bg-[#0b2b28] dark:bg-[#071f1d] shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)]",
      top: "#1ab5af", // BRAND_TEAL
      bottom: "#0f766e", // deep teal-700
      crestStroke: "#5eead4", // mint crest line matching WaveToggle
      crestHighlight: "#ffffff", // white surface reflection
    },
    warning: {
      chamberBg:
        "bg-[#241705] dark:bg-[#1a1003] shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)]",
      top: "#f59e0b", // amber-500
      bottom: "#b45309", // amber-700
      crestStroke: "#fde047",
      crestHighlight: "#ffffff",
    },
    destructive: {
      chamberBg:
        "bg-[#26070e] dark:bg-[#1a0409] shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)]",
      top: "#f43f5e", // rose-500
      bottom: "#be123c", // rose-700
      crestStroke: "#fda4af",
      crestHighlight: "#ffffff",
    },
  },
};

function resolveTone(
  tone: WavyMeterTone,
  percent: number
): "default" | "warning" | "destructive" {
  if (tone !== "auto") return tone;
  if (percent >= 100) return "destructive";
  if (percent >= 90) return "warning";
  return "default";
}

/**
 * Tactile fluid usage meter with synchronized wave oscillation.
 * Locks phase with {@link WavySlider} and {@link WaveToggle} for unified tactile rhythm.
 */
export function WavyMeter({
  value,
  max = 100,
  min = 0,
  tone = "auto",
  variant = "auto",
  accountId,
  className,
  "aria-label": ariaLabel = "Usage meter",
}: WavyMeterProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const waveGroupRef = React.useRef<SVGGElement>(null);
  const waveRafRef = React.useRef<number | null>(null);

  const [trackWidth, setTrackWidth] = React.useState(0);
  const [trackHeight, setTrackHeight] = React.useState(14);
  const [activeVariant, setActiveVariant] = React.useState<WavyMeterVariant>(
    variant === "dark" ? "dark" : "light"
  );

  // Keep activeVariant in sync with prop and global preference changes after hydration
  React.useEffect(() => {
    if (variant === "light" || variant === "dark") {
      setActiveVariant(variant);
      return;
    }

    const sync = (e?: Event) => {
      const customEvent = e as CustomEvent<{
        variant?: WavyMeterVariant;
        accountId?: string | null;
      }> | undefined;
      if (
        customEvent?.detail?.variant &&
        (!customEvent.detail.accountId ||
          !accountId ||
          customEvent.detail.accountId === accountId)
      ) {
        setActiveVariant(customEvent.detail.variant);
        return;
      }
      setActiveVariant(readWavyMeterPreference(accountId));
    };

    sync();
    window.addEventListener(WAVY_METER_CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(WAVY_METER_CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [variant, accountId]);

  const rawPercent =
    max > min ? ((value - min) / (max - min)) * 100 : 0;
  const clampedPercent = Math.min(100, Math.max(0, rawPercent));

  const resolvedToneKey = resolveTone(tone, clampedPercent);
  const theme = activeVariant === "dark" ? DARK_THEME : LIGHT_THEME;
  const colors = theme.tones[resolvedToneKey];

  const gradientId = React.useId().replace(/:/g, "_") + "_wavy_grad";

  // Measure track dimensions responsively
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      const nextW = Math.round(rect.width);
      const nextH = Math.round(rect.height) || 14;
      setTrackWidth((prev) => (prev === nextW ? prev : nextW));
      setTrackHeight((prev) => (prev === nextH ? prev : nextH));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Synchronized global phase motion locked with WavySlider & WaveToggle
  React.useEffect(() => {
    if (clampedPercent <= 0) {
      if (waveRafRef.current != null) {
        cancelAnimationFrame(waveRafRef.current);
        waveRafRef.current = null;
      }
      return;
    }

    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const tick = (now: number) => {
      const g = waveGroupRef.current;
      if (g) {
        const phase = getSynchronizedWavePhase(now);
        g.setAttribute("transform", `translate(${-phase} 0)`);
      }
      waveRafRef.current = requestAnimationFrame(tick);
    };

    waveRafRef.current = requestAnimationFrame(tick);

    return () => {
      if (waveRafRef.current != null) {
        cancelAnimationFrame(waveRafRef.current);
        waveRafRef.current = null;
      }
    };
  }, [clampedPercent]);

  // Compute wave fluid path based on measured dimensions
  const safeWidth = Math.max(trackWidth, 120);
  const midY = trackHeight / 2;
  const ampY = Math.min(3, Math.max(1.5, trackHeight * 0.18));
  const bottomY = trackHeight + 6;

  const { linePath, fluidPath } = React.useMemo(
    () => buildWaveFluidPath(safeWidth, midY, ampY, bottomY),
    [safeWidth, midY, ampY, bottomY]
  );

  return (
    <div
      ref={containerRef}
      role="meter"
      aria-valuenow={Math.round(clampedPercent)}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-label={ariaLabel}
      className={cn(
        "relative h-3.5 w-full select-none overflow-hidden rounded-full border transition-colors duration-300",
        theme.container,
        className
      )}
    >
      {/* Subtle guide wave running across the unfilled gauge track (stays neutral grey in both variants) */}
      <svg
        className={cn(
          "absolute inset-0 h-full w-full pointer-events-none",
          theme.guideOpacity
        )}
        viewBox={`0 0 ${safeWidth} ${trackHeight}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d={linePath}
          fill="none"
          stroke={theme.guideStroke}
          strokeWidth="1.2"
          strokeDasharray="2 3"
          className={theme.guideClassName}
        />
      </svg>

      {/* Active fluid chamber with smooth width transition */}
      <div
        className={cn(
          "relative h-full overflow-hidden rounded-full transition-[width] duration-700 ease-out",
          colors.chamberBg
        )}
        style={{ width: `${clampedPercent}%` }}
      >
        <div
          style={{ width: `${safeWidth}px` }}
          className="absolute left-0 top-0 h-full"
        >
          <svg
            className="h-full w-full pointer-events-none"
            viewBox={`0 0 ${safeWidth} ${trackHeight}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={colors.top} stopOpacity="0.95" />
                <stop offset="100%" stopColor={colors.bottom} stopOpacity="0.98" />
              </linearGradient>
            </defs>
            <g ref={waveGroupRef}>
              <path d={fluidPath} fill={`url(#${gradientId})`} />
              {/* Primary surface wave line */}
              <path
                d={linePath}
                fill="none"
                stroke={colors.crestStroke}
                strokeWidth={colors.crestHighlight ? "1.75" : "1.25"}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              {/* Optional highlight crest reflection for high contrast */}
              {colors.crestHighlight && (
                <path
                  d={linePath}
                  fill="none"
                  stroke={colors.crestHighlight}
                  strokeWidth="0.75"
                  strokeOpacity="0.7"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </g>
          </svg>
        </div>

        {/* Leading meniscus boundary surface reflection */}
        {clampedPercent > 0 && clampedPercent < 100 && (
          <div
            className={cn(
              "absolute right-0 top-0 bottom-0 w-1 blur-[0.5px] rounded-r-full pointer-events-none",
              theme.meniscusColor
            )}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
}

/** Explicit reusable Light variant of the Wavy Meter */
export function WavyMeterLight(props: Omit<WavyMeterProps, "variant">) {
  return <WavyMeter {...props} variant="light" />;
}

/** Explicit reusable Dark variant of the Wavy Meter (uses WaveToggle's deep teal well #0b2b28 for active fill, with neutral grey unfilled track) */
export function WavyMeterDark(props: Omit<WavyMeterProps, "variant">) {
  return <WavyMeter {...props} variant="dark" />;
}
