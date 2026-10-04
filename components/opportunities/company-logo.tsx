"use client";

import { CompanyLogo as UiCompanyLogo } from "@/components/ui/company-logo";
import { getCompanyLogoUrl } from "@/lib/company-logo";

type CompanyLogoProps = {
  company: string;
  logoUrl?: string | null;
  domain?: string | null;
  className?: string;
};

/**
 * Job Radar adapter: resolves favicon URL then renders the shared squircle mark.
 * Prefer importing `@/components/ui/company-logo` directly for new call sites.
 */
export function CompanyLogo({
  company,
  logoUrl = null,
  domain = null,
  className,
}: CompanyLogoProps) {
  const src = logoUrl || getCompanyLogoUrl(company, domain);
  return (
    <UiCompanyLogo
      src={src}
      name={company}
      size="lg"
      className={className}
    />
  );
}
