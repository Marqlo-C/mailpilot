"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

import {
  BRAND_TEAL,
  buildWaveFluidPath,
  getSynchronizedWavePhase,
} from "@/lib/constants/wave-geometry";
import {
  readWaveTogglePreference,
  WAVE_TOGGLE_CHANGE_EVENT,
  type WaveToggleVariant,
} from "@/lib/ui/wave-toggle-preference";

export type { WaveToggleVariant };

export interface WaveToggleProps {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Style variant. "light" uses frosted seafoam chamber with vibrant turquoise fluid; "dark" uses deep forest teal chamber (#0b2b28). "auto" syncs with user UI settings. */
  variant?: WaveToggleVariant | "auto";
  /** Optional account ID for user-specific preference resolution when variant is "auto". */
  accountId?: string | null;
  className?: string;
  label?: React.ReactNode;
  description?: React.ReactNode;
  "aria-label"?: string;
}

const LIGHT_THEME = {
  activeWell:
    "bg-teal-500/15 dark:bg-teal-950/45 shadow-[inset_0_1px_2px_rgba(13,148,136,0.22)]",
  inactiveWell:
    "bg-input/60 dark:bg-muted/50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]",
  top: "#2dd4bf", // vibrant teal-400
  bottom: BRAND_TEAL, // #1ab5af tactile brand teal
  crestStroke: "#ffffff", // crisp pure white waterline
  crestStrokeWidth: "1.75",
  crestHighlight: "rgba(255, 255, 255, 0.75)",
};

const DARK_THEME = {
  activeWell:
    "bg-[#0b2b28] dark:bg-[#071f1d] shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]",
  inactiveWell:
    "bg-input/60 dark:bg-muted/50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]",
  top: "#1ab5af",
  bottom: "#0f766e",
  crestStroke: "#5eead4",
  crestStrokeWidth: "1.75",
  crestHighlight: "#ffffff",
};

export function WaveToggle({
  id,
  checked,
  onCheckedChange,
  disabled = false,
  variant = "auto",
  accountId,
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

  const [activeVariant, setActiveVariant] = React.useState<WaveToggleVariant>(
    () => {
      if (variant === "light" || variant === "dark") return variant;
      return readWaveTogglePreference(accountId);
    }
  );

  React.useEffect(() => {
    if (variant === "light" || variant === "dark") {
      setActiveVariant(variant);
      return;
    }

    setActiveVariant(readWaveTogglePreference(accountId));

    const sync = (e: Event) => {
      const customEvent = e as CustomEvent<{
        variant?: WaveToggleVariant;
        accountId?: string | null;
      }>;
      if (
        !customEvent.detail?.accountId ||
        !accountId ||
        customEvent.detail.accountId === accountId
      ) {
        setActiveVariant(readWaveTogglePreference(accountId));
      }
    };

    window.addEventListener(WAVE_TOGGLE_CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(WAVE_TOGGLE_CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [variant, accountId]);

  const theme = activeVariant === "light" ? LIGHT_THEME : DARK_THEME;

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

  // Track is 36px wide x 18px high; waterline midY=9, amplitude=3 (matching WavySlider)
  const { linePath, fluidPath } = React.useMemo(
    () => buildWaveFluidPath(36, 9, 3, 24),
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
        "group relative inline-flex shrink-0 items-center justify-center p-[2px] rounded-full",
        "w-[42px] h-[24px] select-none transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50",
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
          checked ? theme.activeWell : theme.inactiveWell
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
            viewBox="0 0 36 18"
            preserveAspectRatio="none"
            fill="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="1">
                <stop offset="0%" stopColor={theme.top} stopOpacity="0.95" />
                <stop offset="100%" stopColor={theme.bottom} stopOpacity="0.98" />
              </linearGradient>
            </defs>
            <g ref={waveGroupRef}>
              {/* Fluid Body under wave */}
              <path
                d={fluidPath}
                fill={`url(#${gradientId})`}
              />
              {/* Crisp Surface Wave Line */}
              <path
                d={linePath}
                stroke={theme.crestStroke}
                strokeWidth={theme.crestStrokeWidth}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              {/* Surface highlight crest reflection for high visibility */}
              {theme.crestHighlight && (
                <path
                  d={linePath}
                  stroke={theme.crestHighlight}
                  strokeWidth="0.75"
                  strokeOpacity="0.7"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              )}
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
            checked ? "translate-x-[20px]" : "translate-x-[2px]"
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

/** Explicit reusable Light variant of the Wave Toggle */
export function WaveToggleLight(props: Omit<WaveToggleProps, "variant">) {
  return <WaveToggle {...props} variant="light" />;
}

/** Explicit reusable Dark variant of the Wave Toggle */
export function WaveToggleDark(props: Omit<WaveToggleProps, "variant">) {
  return <WaveToggle {...props} variant="dark" />;
}
