"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { logoInitials } from "@/lib/company-logo";

export { logoInitials } from "@/lib/company-logo";

const SIZE_CONFIG = {
  sm: {
    outer: "size-8 rounded-lg p-1",
    inner: "rounded-md",
    text: "text-[10px]",
  },
  md: {
    outer: "size-9 rounded-xl p-1",
    inner: "rounded-[0.55rem]",
    text: "text-xs",
  },
  lg: {
    outer: "size-10 rounded-xl p-1",
    inner: "rounded-[0.6rem]",
    text: "text-sm",
  },
} as const;

const GRADIENT_PALETTES = [
  "bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-inner",
  "bg-gradient-to-br from-blue-500 to-teal-500 text-white shadow-inner",
  "bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-inner",
  "bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-inner",
  "bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-inner",
  "bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-inner",
  "bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-inner",
  "bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-inner",
];

function getGradientClass(name: string): string {
  const clean = (name || "").trim().toLowerCase();
  let hash = 0;
  const str = clean || "company";
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % GRADIENT_PALETTES.length;
  return GRADIENT_PALETTES[index];
}

type CompanyLogoSize = keyof typeof SIZE_CONFIG;

export type CompanyLogoProps = {
  src?: string | null;
  name: string;
  size?: CompanyLogoSize;
  className?: string;
};

/**
 * Shared squircle company mark for Job Radar + Subscriptions.
 * Cascades from Google Favicon CDN -> Random CSS gradient with initials / icon.
 * Detects and intercepts Google's 16x16 default fallback globe to prevent generic globe rendering.
 */
export function CompanyLogo({
  src,
  name,
  size = "md",
  className,
}: CompanyLogoProps) {
  const [failed, setFailed] = useState(false);
  const [prevSrc, setPrevSrc] = useState(src);

  if (prevSrc !== src) {
    setPrevSrc(src);
    setFailed(false);
  }

  const initials = logoInitials(name);
  const { outer, inner, text } = SIZE_CONFIG[size];
  const gradientClass = getGradientClass(name);
  const showImage = Boolean(src) && !failed;

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
            onLoad={(e) => {
              const img = e.currentTarget;
              // Google Favicon returns a 16x16 default globe icon when no favicon exists for the domain.
              // Legitimate domain favicons requested with sz=128 are scaled to >= 32px or 128px.
              if (img.naturalWidth <= 16 && img.naturalHeight <= 16) {
                setFailed(true);
              }
            }}
            onError={() => setFailed(true)}
          />
        ) : initials ? (
          <span
            className={cn(
              "flex size-full items-center justify-center font-bold uppercase tracking-wide select-none",
              text,
              gradientClass
            )}
          >
            {initials}
          </span>
        ) : (
          <span
            className={cn(
              "flex size-full items-center justify-center select-none",
              gradientClass
            )}
          >
            <Building2 className="size-3.5 text-white/90" />
          </span>
        )}
      </div>
    </div>
  );
}
