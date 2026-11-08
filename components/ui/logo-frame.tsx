"use client";

import { useState, type ComponentType, type ReactNode } from "react";
import { Building2, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { logoInitials } from "@/lib/utils/company-logo";

export { logoInitials } from "@/lib/utils/company-logo";

/**
 * Global squircle mark frame — single place to tune outer/inner chrome.
 * Inner radius = outer radius − padding (even concentric gutter).
 *
 * - sm → 32px (`size-8`)
 * - md → 36px (`size-9`) — subscription cards
 * - lg → 40px (`size-10`) — job cards, settings feature marks
 */
const SIZE_CONFIG = {
  sm: {
    outer: "size-8 rounded-lg p-0.5",
    inner: "rounded-[0.375rem]",
    text: "text-[10px]",
    icon: "size-3.5",
  },
  md: {
    outer: "size-9 rounded-xl p-0.5",
    inner: "rounded-[0.625rem]",
    text: "text-xs",
    icon: "size-4",
  },
  lg: {
    outer: "size-10 rounded-xl p-0.5",
    inner: "rounded-[0.625rem]",
    text: "text-sm",
    icon: "size-5",
  },
} as const;

export type LogoFrameSize = keyof typeof SIZE_CONFIG;

const FRAME_SHADOW =
  "shadow-[0_1px_2px_rgba(15,23,42,0.06),0_1px_3px_rgba(15,23,42,0.04)]";

export type LogoFrameProps = {
  size?: LogoFrameSize;
  className?: string;
  children: ReactNode;
};

/** Shared outer/inner squircle chrome. Put image, initials, or an icon inside. */
export function LogoFrame({
  size = "md",
  className,
  children,
}: LogoFrameProps) {
  const { outer, inner } = SIZE_CONFIG[size];
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center border border-border/50 bg-background/80",
        FRAME_SHADOW,
        outer,
        className
      )}
      aria-hidden
    >
      <div
        className={cn(
          "relative flex size-full items-center justify-center overflow-hidden bg-muted/30",
          inner
        )}
      >
        {children}
      </div>
    </div>
  );
}

export type LogoFrameIconProps = {
  icon: LucideIcon | ComponentType<{ className?: string }>;
  size?: LogoFrameSize;
  className?: string;
  iconClassName?: string;
};

/** Lucide / custom icon inside {@link LogoFrame} — settings feature marks, etc. */
export function LogoFrameIcon({
  icon: Icon,
  size = "lg",
  className,
  iconClassName,
}: LogoFrameIconProps) {
  return (
    <LogoFrame size={size} className={className}>
      <Icon
        className={cn(
          SIZE_CONFIG[size].icon,
          "text-muted-foreground",
          iconClassName
        )}
      />
    </LogoFrame>
  );
}

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

export type CompanyLogoProps = {
  src?: string | null;
  fallbackSrc?: string | null;
  name: string;
  size?: LogoFrameSize;
  className?: string;
  imageClassName?: string;
};

/**
 * Company / sender mark on {@link LogoFrame}.
 * Cascades Direct CDN → Google Favicon → gradient initials.
 * Intercepts Google's 16×16 default globe.
 */
export function CompanyLogo({
  src,
  fallbackSrc,
  name,
  size = "md",
  className,
  imageClassName,
}: CompanyLogoProps) {
  const targetSrc = src || fallbackSrc || null;
  const [prevProps, setPrevProps] = useState({ src, fallbackSrc, name });
  const [currentSrc, setCurrentSrc] = useState<string | null>(targetSrc);
  const [failed, setFailed] = useState(false);
  const [attemptedFallback, setAttemptedFallback] = useState(false);

  if (
    prevProps.src !== src ||
    prevProps.fallbackSrc !== fallbackSrc ||
    prevProps.name !== name
  ) {
    setPrevProps({ src, fallbackSrc, name });
    setCurrentSrc(targetSrc);
    setFailed(false);
    setAttemptedFallback(false);
  }

  const handleImageError = () => {
    if (!attemptedFallback && fallbackSrc && fallbackSrc !== currentSrc) {
      setAttemptedFallback(true);
      setCurrentSrc(fallbackSrc);
    } else {
      setFailed(true);
    }
  };

  const initials = logoInitials(name);
  const { text } = SIZE_CONFIG[size];
  const gradientClass = getGradientClass(name);
  const showImage = Boolean(currentSrc) && !failed;

  return (
    <LogoFrame size={size} className={className}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={currentSrc!}
          alt=""
          className={cn("size-full object-cover", imageClassName)}
          loading="lazy"
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth <= 16 && img.naturalHeight <= 16) {
              handleImageError();
            }
          }}
          onError={handleImageError}
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
    </LogoFrame>
  );
}
