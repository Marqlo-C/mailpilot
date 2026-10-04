"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Nested squircles:
 * - outer: bordered ring (padding creates the gap)
 * - inner: same-shape mask; favicon fills it via object-cover so corners round
 */
const SIZE_CONFIG = {
  sm: {
    outer: "size-8 rounded-lg p-1",
    inner: "rounded-md",
  },
  md: {
    outer: "size-9 rounded-xl p-1",
    inner: "rounded-[0.55rem]",
  },
  lg: {
    outer: "size-10 rounded-xl p-1",
    inner: "rounded-[0.6rem]",
  },
} as const;

type CompanyLogoSize = keyof typeof SIZE_CONFIG;

export type CompanyLogoProps = {
  src: string | null;
  name: string;
  size?: CompanyLogoSize;
  className?: string;
};

function logoInitials(name: string): string {
  const source = name.trim();
  if (!source) return "";
  const words = source.split(/[\s._-]+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0]![0] ?? ""}${words[1]![0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

/**
 * Shared squircle company / sender mark for Job Radar + Subscriptions.
 */
export function CompanyLogo({
  src,
  name,
  size = "md",
  className,
}: CompanyLogoProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;
  const initials = logoInitials(name);
  const { outer, inner } = SIZE_CONFIG[size];

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center border border-border/50 bg-background/80 shadow-sm",
        outer,
        className
      )}
      aria-hidden
    >
      <div
        className={cn(
          "relative size-full overflow-hidden bg-muted/30",
          inner
        )}
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src!}
            alt=""
            className="size-full object-cover"
            loading="lazy"
            onError={() => setFailed(true)}
          />
        ) : initials ? (
          <span className="flex size-full items-center justify-center text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            {initials}
          </span>
        ) : (
          <span className="flex size-full items-center justify-center">
            <Building2 className="size-3.5 text-muted-foreground/70" />
          </span>
        )}
      </div>
    </div>
  );
}
