"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

import {
  BRAND_TEAL,
  buildWaveFluidPath,
  getSynchronizedWavePhase,
} from "@/lib/constants/wave-geometry";

export interface WaveToggleProps {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  label?: React.ReactNode;
  description?: React.ReactNode;
  "aria-label"?: string;
}

export function WaveToggle({
  id,
  checked,
  onCheckedChange,
  disabled = false,
  className,
  label,
  description,
  "aria-label": ariaLabel,
}: WaveToggleProps) {
  const generatedId = React.useId();
  const switchId = id || generatedId;
  const gradientId = React.useId().replace(/:/g, "_") + "_wave_grad";

  const waveGroupRef = React.useRef<SVGGElement>(null);
  const waveRafRef = React.useRef<number | null>(null);

  // Synchronized wave motion locked in phase with WavySlider
  React.useEffect(() => {
    if (!checked || disabled) {
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
  }, [checked, disabled]);

  // Track is 38px wide x 18px high; waterline midY=9, amplitude=3 (matching WavySlider)
  const { linePath, fluidPath } = React.useMemo(
    () => buildWaveFluidPath(38, 9, 3, 24),
    []
  );

  const toggleButton = (
    <button
      type="button"
      role="switch"
      id={switchId}
      aria-label={ariaLabel}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange(!checked)}
      className={cn(
        "group relative inline-flex shrink-0 items-center justify-center p-[3px] rounded-full",
        "w-[46px] h-[26px] select-none transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50",
        // Soft, flattened outer pill frame
        "bg-muted/70 dark:bg-muted/30",
        "shadow-xs border border-border/80",
        disabled && "opacity-50 cursor-not-allowed",
        !label && !description && className
      )}
    >
      {/* Inner Recessed Well (Clean, flat track) */}
      <div
        className={cn(
          "relative w-full h-full rounded-full overflow-hidden transition-colors duration-500",
          // Deep recessed chamber when active, neutral input when off
          "shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]",
          checked ? "bg-[#0b2b28] dark:bg-[#071f1d]" : "bg-input/60 dark:bg-muted/50"
        )}
      >
        {/* Fluid Wave Layer (Visible when active) */}
        <div
          className={cn(
            "absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-300",
            checked ? "opacity-100" : "opacity-0"
          )}
        >
          <svg
            className="w-full h-full"
            viewBox="0 0 38 18"
            preserveAspectRatio="none"
            fill="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1ab5af" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#0f766e" stopOpacity="0.98" />
              </linearGradient>
            </defs>
            <g ref={waveGroupRef}>
              {/* Fluid Body under wave */}
              <path
                d={fluidPath}
                fill={`url(#${gradientId})`}
              />
              {/* Crisp Surface Wave Line (Matches WavySlider geometry) */}
              <path
                d={linePath}
                stroke="#5eead4"
                strokeWidth="1.75"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              {/* Surface highlight crest reflection for high visibility */}
              <path
                d={linePath}
                stroke="#ffffff"
                strokeWidth="0.75"
                strokeOpacity="0.65"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          </svg>
        </div>

        {/* Tactile Inner Thumb Knob */}
        <span
          className={cn(
            "absolute top-1/2 left-0 -translate-y-1/2 rounded-full transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
            "w-3.5 h-3.5",
            // Modern flat tactile thumb
            "bg-white dark:bg-slate-100",
            "shadow-sm border border-black/[0.08] dark:border-white/10",
            checked ? "translate-x-[22px]" : "translate-x-[2px]"
          )}
        />
      </div>
    </button>
  );

  if (label || description) {
    return (
      <div className={cn("flex items-start justify-between gap-4", className)}>
        <label
          htmlFor={switchId}
          className={cn(
            "flex flex-col cursor-pointer select-none space-y-0.5 min-w-0",
            disabled && "cursor-not-allowed opacity-60"
          )}
        >
          {label && <span className="text-sm font-medium text-foreground">{label}</span>}
          {description && (
            <span className="text-xs text-muted-foreground leading-relaxed">{description}</span>
          )}
        </label>
        {toggleButton}
      </div>
    );
  }

  return toggleButton;
}
