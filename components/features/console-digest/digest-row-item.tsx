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
  /** Optional container class overrides. */
  className?: string;
}

/**
 * Shared layout primitive for console digest cards.
 * Renders an accessible interactive link with company/sender avatar,
 * primary headline, secondary subtitle, and a trailing metric badge slot.
 */
export function DigestRowItem({
  href,
  logoSrc,
  logoName,
  title,
  subtitle,
  metricBadge,
  className,
}: DigestRowItemProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-md border border-border px-3 py-2 hover:bg-muted/40",
        className
      )}
    >
      <CompanyLogo src={logoSrc} name={logoName} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {metricBadge}
    </Link>
  );
}
