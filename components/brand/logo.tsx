"use client";

import { cn } from "@/lib/utils";

export type LogoVariant = "full" | "icon" | "inverted";
export type LogoSize = "xs" | "sm" | "md" | "lg";

type LogoProps = {
  variant?: LogoVariant;
  size?: LogoSize;
  className?: string;
  /** When true, show wordmark text beside the mark for "full". */
  showWordmark?: boolean;
  priority?: boolean;
};

const SIZE_PX: Record<LogoSize, number> = {
  xs: 14,
  sm: 28,
  md: 36,
  lg: 48,
};

const SRC: Record<LogoVariant, string> = {
  full: "/logos/colored-logo-only.png",
  icon: "/logos/transparent-logo-only.png",
  inverted: "/logos/colored-logo-only.png",
};

export const WHITE_WORDMARK_SRC =
  "/logos/transparent-white-wordmark-inline.png";
export const COLORED_WORDMARK_SRC =
  "/logos/colored-logo-plus-wordmark-inline.png";

/**
 * MailPilot brand mark. Use `full` for colored mark + optional text,
 * `icon` for compact mark, `inverted` for dark surfaces / PDF headers.
 */
export function Logo({
  variant = "full",
  size = "md",
  className,
  showWordmark = variant === "full",
  priority = false,
}: LogoProps) {
  const px = SIZE_PX[size];
  const src = SRC[variant];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2",
        variant === "inverted" && "text-white",
        className
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="MailPilot"
        width={px}
        height={px}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        className="shrink-0 rounded-[22%] object-contain"
      />
      {showWordmark ? (
        <span
          className={cn(
            "truncate font-semibold tracking-tight",
            size === "xs" && "text-xs",
            size === "sm" && "text-sm",
            size === "md" && "text-lg",
            size === "lg" && "text-xl"
          )}
        >
          MailPilot
        </span>
      ) : null}
    </span>
  );
}

type WordmarkProps = {
  src: string;
  className?: string;
  imgClassName?: string;
  height?: number;
  priority?: boolean;
};

/**
 * Inline logo + wordmark image (wide asset, not a square mark).
 */
export function Wordmark({
  src,
  className,
  imgClassName,
  height = 32,
  priority = false,
}: WordmarkProps) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="MailPilot"
        height={height}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        className={cn("h-auto w-auto object-contain", imgClassName)}
        style={{ height }}
      />
    </span>
  );
}

/**
 * Sidebar brand: icon-only when collapsed; plane + white wordmark when expanded.
 * Heights are optically matched — each asset has different canvas padding, so the
 * plane is scaled up in a fixed squircle tile and the wordmark is rendered oversized
 * inside a clipped h-9 band so letter cap-height aligns with the plane.
 */
export function NavLogo({
  collapsed = false,
  className,
}: {
  collapsed?: boolean;
  className?: string;
}) {
  const planeTile = (
    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[22%]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={SRC.inverted}
        alt=""
        width={36}
        height={36}
        decoding="async"
        fetchPriority="high"
        aria-hidden
        className="h-full w-full scale-125 object-contain"
      />
    </span>
  );

  if (collapsed) {
    return (
      <span className={cn("inline-flex", className)} aria-label="MailPilot">
        {planeTile}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center overflow-hidden",
        className
      )}
      aria-label="MailPilot"
    >
      {/* Mobile / narrow: icon only */}
      <span className="lg:hidden">{planeTile}</span>

      {/* Desktop: plane + wordmark — gap is 25% tighter than gap-2.5 (10px → 7.5px) */}
      <span className="hidden items-center gap-[7.5px] lg:inline-flex">
        {planeTile}

        <span className="relative flex h-9 shrink-0 items-center overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={WHITE_WORDMARK_SRC}
            alt=""
            width={180}
            height={76}
            decoding="async"
            fetchPriority="high"
            className="pointer-events-none h-[76px] w-auto max-w-none object-contain"
          />
        </span>
      </span>
    </span>
  );
}
