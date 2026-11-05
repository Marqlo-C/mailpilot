"use client";

import {
  useId,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { ChevronDown, ChevronUp, Percent } from "lucide-react";

import { cn } from "@/lib/utils";

function digitCountForRange(min: number, max: number): number {
  const widest = Math.max(Math.abs(min), Math.abs(max));
  const digits = String(Math.trunc(widest)).length;
  return min < 0 || max < 0 ? digits + 1 : digits;
}

function clampToRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export type NumericFieldProps = {
  value: number;
  onChange: (value: number) => void;
  /** Fired on blur / Enter after a typed edit. */
  onCommit?: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /**
   * Trailing Lucide Percent icon after steppers (outside the typable text).
   */
  percent?: boolean;
  /** Compact vertical up/down stepper pill inside the field chrome. */
  steppers?: boolean;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  className?: string;
  inputClassName?: string;
};

/**
 * Compact search-bar-styled numeric field. Width hugs the digit budget from
 * `min`/`max`. Optional percent glyph + vertical increment steppers.
 */
export function NumericField({
  value,
  onChange,
  onCommit,
  min,
  max,
  step = 1,
  percent = false,
  steppers = false,
  disabled = false,
  id: idProp,
  "aria-label": ariaLabel,
  className,
  inputClassName,
}: NumericFieldProps) {
  const reactId = useId();
  const id = idProp ?? reactId;
  const digits = digitCountForRange(min, max);
  const [draft, setDraft] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const display = draft ?? String(value);
  const atMin = value <= min;
  const atMax = value >= max;
  const showSteppers = steppers && (hovered || focused);

  function commitParsed(raw: string) {
    const parsed = raw.trim() === "" ? min : Number.parseInt(raw, 10);
    const next = clampToRange(
      Number.isFinite(parsed) ? parsed : value,
      min,
      max
    );
    setDraft(null);
    if (next !== value) onChange(next);
    onCommit?.(next);
  }

  function nudge(direction: 1 | -1) {
    if (disabled) return;
    const next = clampToRange(value + direction * step, min, max);
    if (next === value) return;
    setDraft(null);
    onChange(next);
    onCommit?.(next);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    if (next !== "" && !/^-?\d*$/.test(next)) return;
    if (next === "" || next === "-") {
      setDraft(next);
      return;
    }
    const parsed = Number.parseInt(next, 10);
    if (!Number.isFinite(parsed)) return;
    // Clamp in real time — out-of-range keystrokes snap to min/max immediately.
    const clamped = clampToRange(parsed, min, max);
    setDraft(String(clamped));
    if (clamped !== value) onChange(clamped);
  }

  function handleBlur() {
    commitParsed(draft ?? String(value));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      nudge(1);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      nudge(-1);
    }
  }

  return (
    <div
      data-mp-toolbar-field=""
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-0.5 rounded-lg border border-border/50 bg-card/75 pl-2 text-foreground/75 shadow-sm transition-[box-shadow,border-color] focus-within:border-border focus-within:shadow",
        percent ? "pr-1.5" : "pr-2",
        disabled && "opacity-50",
        className
      )}
    >
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        value={display}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          handleBlur();
        }}
        onKeyDown={handleKeyDown}
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        style={{ width: `${digits}ch` }}
        className={cn(
          "h-full border-0 bg-transparent py-0 text-center text-xs font-medium tabular-nums text-foreground shadow-none outline-none focus:outline-none focus:ring-0 disabled:cursor-not-allowed",
          inputClassName
        )}
      />
      {steppers ? (
        <div
          className={cn(
            "inline-flex h-4 w-2.5 shrink-0 flex-col overflow-hidden rounded-[3px] bg-muted/70 shadow-none transition-opacity duration-150",
            showSteppers
              ? "opacity-100"
              : "pointer-events-none opacity-0"
          )}
          role="group"
          aria-label="Adjust value"
          aria-hidden={!showSteppers}
        >
          <button
            type="button"
            tabIndex={showSteppers ? 0 : -1}
            disabled={disabled || atMax}
            onClick={() => nudge(1)}
            aria-label="Increase"
            className="inline-flex min-h-0 flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-[hsl(var(--sidebar))] shadow-none transition-colors hover:bg-[hsl(var(--sidebar))] hover:text-[hsl(var(--sidebar-foreground))] disabled:pointer-events-none disabled:opacity-25"
          >
            <ChevronUp className="size-1.5" strokeWidth={3} aria-hidden />
          </button>
          <span
            aria-hidden
            className="mx-auto h-px w-1 shrink-0 bg-border/70 pointer-events-none"
          />
          <button
            type="button"
            tabIndex={showSteppers ? 0 : -1}
            disabled={disabled || atMin}
            onClick={() => nudge(-1)}
            aria-label="Decrease"
            className="inline-flex min-h-0 flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-[hsl(var(--sidebar))] shadow-none transition-colors hover:bg-[hsl(var(--sidebar))] hover:text-[hsl(var(--sidebar-foreground))] disabled:pointer-events-none disabled:opacity-25"
          >
            <ChevronDown className="size-1.5" strokeWidth={3} aria-hidden />
          </button>
        </div>
      ) : null}
      {percent ? (
        <Percent
          className="pointer-events-none size-3 shrink-0 text-foreground/45"
          aria-hidden
        />
      ) : null}
    </div>
  );
}
