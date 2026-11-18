"use client";

import * as React from "react";
import Link from "next/link";
import { CompanyLogo } from "@/components/ui/logo-frame";
import { cn } from "@/lib/utils";

export interface DigestRowItemProps {
  /** Target navigation URL for the digest item. */
  href: string;
  /** Optional image URL or favicon source for the company/sender avatar. */
  logoSrc?: string | null;
  /** Fallback entity name used for generating monogram avatars. */
  logoName: string;
  /** Primary title text (e.g. company name, sender name). */
  title: string;
  /** Secondary subtitle text (e.g. role title, email address). */
  subtitle: string;
  /** Trailing metric badge or status chip slot. */
  metricBadge: React.ReactNode;
  /** Direct inline action slot (e.g. "Review", "Manage", "Send"). */
  action?: React.ReactNode;
  /** Optional auxiliary visual meter (e.g. clutter meter bar). */
  meter?: React.ReactNode;
  /** Optional container class overrides. */
  className?: string;
}

/**
 * Shared layout primitive for console digest cards.
 * Renders an accessible interactive card item with company/sender avatar,
 * primary headline, secondary subtitle, metric badge, optional meter, and direct inline action slot.
 */
export function DigestRowItem({
  href,
  logoSrc,
  logoName,
  title,
  subtitle,
  metricBadge,
  action,
  meter,
  className,
}: DigestRowItemProps) {
  return (
    <div
      className={cn(
        "group relative flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-card/40 p-2.5 transition-all duration-150 hover:border-primary/40 hover:bg-muted/40 hover:shadow-2xs active:scale-[0.99] sm:px-3 sm:py-2.5",
        className
      )}
    >
      {/* Primary stretched link spanning the row */}
      <Link
        href={href}
        className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`${title} - ${subtitle}`}
      />

      {/* Leading logo & titles */}
      <div className="relative z-10 flex min-w-0 flex-1 items-center gap-3 pointer-events-none">
        <CompanyLogo src={logoSrc} name={logoName} size="md" className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground transition-colors group-hover:text-primary">
              {title}
            </p>
          </div>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          {meter ? <div className="mt-1">{meter}</div> : null}
        </div>
      </div>

      {/* Trailing metric badge and direct inline action */}
      <div className="relative z-10 flex shrink-0 items-center gap-2 pointer-events-auto">
        {metricBadge}
        {action}
      </div>
    </div>
  );
}
