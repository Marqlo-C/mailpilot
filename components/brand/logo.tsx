"use client";

import { cn } from "@/lib/utils";

export type LogoVariant = "full" | "icon" | "inverted";
export type LogoSize = "sm" | "md" | "lg";

type LogoProps = {
  variant?: LogoVariant;
  size?: LogoSize;
  className?: string;
  /** When true, show wordmark text beside the mark for "full". */
  showWordmark?: boolean;
  priority?: boolean;
};

const SIZE_PX: Record<LogoSize, number> = {
  sm: 28,
  md: 36,
  lg: 48,
};

const SRC: Record<LogoVariant, string> = {
  full: "/logos/colored-logo.svg",
  icon: "/logos/transparent-logo.svg",
  inverted: "/logos/transparent-logo.svg",
};

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
        className={cn(
          "shrink-0 object-contain",
          variant === "full" && "rounded-md"
        )}
      />
      {showWordmark ? (
        <span
          className={cn(
            "truncate font-semibold tracking-tight",
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

/**
 * Responsive nav brand: full wordmark from `lg` up, icon-only below.
 */
export function NavLogo({
  collapsed = false,
  className,
}: {
  collapsed?: boolean;
  className?: string;
}) {
  if (collapsed) {
    return (
      <Logo
        variant="inverted"
        size="sm"
        showWordmark={false}
        className={className}
        priority
      />
    );
  }

  return (
    <span className={cn("inline-flex items-center", className)}>
      <span className="lg:hidden">
        <Logo variant="inverted" size="sm" showWordmark={false} priority />
      </span>
      <span className="hidden lg:inline-flex">
        <Logo variant="inverted" size="md" showWordmark priority />
      </span>
    </span>
  );
}
