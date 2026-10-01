"use client";

import { useState } from "react";

import { getCompanyLogoUrl } from "@/lib/company-logo";
import { cn } from "@/lib/utils";

type CompanyLogoProps = {
  company: string;
  logoUrl?: string | null;
  domain?: string | null;
  className?: string;
};

/**
 * Job Radar company mark: favicon / unavatar with initials fallback.
 */
export function CompanyLogo({
  company,
  logoUrl = null,
  domain = null,
  className,
}: CompanyLogoProps) {
  const [failed, setFailed] = useState(false);
  const src = logoUrl || getCompanyLogoUrl(company, domain);
  const initial = company.trim().slice(0, 2).toUpperCase() || "?";

  if (failed) {
    return (
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-muted/40 text-xs font-bold uppercase text-muted-foreground shadow-sm",
          className
        )}
        aria-hidden
      >
        {initial}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={40}
      height={40}
      className={cn(
        "h-10 w-10 shrink-0 rounded-xl border border-border/70 bg-muted/40 object-contain p-1 shadow-sm",
        className
      )}
      onError={() => setFailed(true)}
    />
  );
}
