import { cn } from "@/lib/utils";

export type StatusDotTone = "idle" | "busy" | "ok" | "error" | "offline";
export type StatusDotSize = "sm" | "md";

const SIZE_CLASS: Record<StatusDotSize, string> = {
  sm: "h-1.5 w-1.5",
  md: "h-2 w-2",
};

const TONE_CLASS: Record<StatusDotTone, string> = {
  idle: "bg-[#e4f7f3]/50",
  busy: "bg-sky-500",
  ok: "bg-brand",
  error: "bg-[#c21f10] dark:bg-[#fb6230]",
  offline: "bg-white/50 opacity-60",
};

/** Soft glow only on the resting “healthy” core — not on the ping halo. */
const TONE_GLOW: Partial<Record<StatusDotTone, string>> = {
  ok: "shadow-[0_0_6px_hsl(var(--brand)/0.45)]",
};

/** Tones that pulse while the underlying work is still running. */
const PING_TONES: ReadonlySet<StatusDotTone> = new Set(["busy", "error"]);

export type StatusDotProps = {
  tone: StatusDotTone;
  size?: StatusDotSize;
  /** Force ping on/off; defaults to on for busy/error. */
  ping?: boolean;
  className?: string;
};

/**
 * Shared 6–8px status indicator for sync, flyouts, toasts, and Ollama.
 * Prefer this over ad-hoc sky/emerald/hex dots so Operate surfaces stay consistent.
 */
export function StatusDot({
  tone,
  size = "sm",
  ping,
  className,
}: StatusDotProps) {
  const shouldPing = ping ?? PING_TONES.has(tone);
  const sizeClass = SIZE_CLASS[size];
  const toneClass = TONE_CLASS[tone];

  return (
    <span
      className={cn("relative flex shrink-0", sizeClass, className)}
      aria-hidden
    >
      {shouldPing ? (
        <span
          className={cn(
            "absolute inline-flex h-full w-full rounded-full opacity-75 motion-safe:animate-ping",
            toneClass
          )}
        />
      ) : null}
      <span
        className={cn(
          "relative inline-flex rounded-full",
          sizeClass,
          toneClass,
          TONE_GLOW[tone]
        )}
      />
    </span>
  );
}
