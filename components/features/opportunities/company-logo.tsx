"use client";

import { CompanyLogo as UiCompanyLogo } from "@/components/ui/logo-frame";
import { getCompanyLogoUrl } from "@/lib/utils/company-logo";
import { isKnownJobDomain } from "@/lib/constants/job-sources";

type CompanyLogoProps = {
  company: string;
  logoUrl?: string | null;
  domain?: string | null;
  className?: string;
};

/**
 * Job Radar adapter: resolves favicon URL then renders the shared squircle mark.
 * Prefer importing `@/components/ui/logo-frame` directly for new call sites.
 */
export function CompanyLogo({
  company,
  logoUrl = null,
  domain = null,
  className,
}: CompanyLogoProps) {
  const isAggregator = (val?: string | null): boolean => {
    if (!val) return false;
    const lower = val.toLowerCase();
    return lower.includes("jobleads") || isKnownJobDomain(lower);
  };

  const safeLogo = logoUrl && !isAggregator(logoUrl) ? logoUrl : null;
  const safeDomain = domain && !isAggregator(domain) ? domain : null;
  const src = safeLogo || getCompanyLogoUrl(company, safeDomain);
  return (
    <UiCompanyLogo
      src={src}
      name={company}
      size="lg"
      className={className}
    />
  );
}
