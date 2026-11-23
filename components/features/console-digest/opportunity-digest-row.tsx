"use client";

import type { JobOpportunity } from "@/lib/generated/prisma/client";
import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { DigestRowItem } from "./digest-row-item";
import { NumberTicker } from "@/components/ui/number-ticker";
import { SCORE_PERCENT_CLASSNAME } from "@/components/ui/styles/score-percent";
import { getCompanyLogoUrl } from "@/lib/utils/company-logo";
import { scoreTone } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

export function OpportunityDigestRow({
  opportunity,
  threshold,
}: {
  opportunity: JobOpportunity;
  threshold: number;
}) {
  const score = opportunity.matchScore ?? 0;
  const isHighMatch = score >= threshold;
  const hasExternalUrl = Boolean(opportunity.applyUrl);
  const actionHref = opportunity.applyUrl || "/jobs";

  return (
    <DigestRowItem
      href="/jobs"
      logoSrc={
        opportunity.logoUrl ||
        getCompanyLogoUrl(opportunity.company, opportunity.companyDomain)
      }
      logoName={opportunity.company}
      title={opportunity.company}
      subtitle={opportunity.title}
      metricBadge={
        <div className="flex items-center gap-1.5">
          <span
            title={score < threshold ? "Below match threshold" : "Match score"}
            className={cn(
              "inline-flex h-[28px] shrink-0 items-center justify-center rounded-md px-2",
              SCORE_PERCENT_CLASSNAME,
              scoreTone(score)
            )}
          >
            <NumberTicker value={score} />%
          </span>
        </div>
      }
      action={
        <Link
          href={actionHref}
          target={hasExternalUrl ? "_blank" : undefined}
          rel={hasExternalUrl ? "noreferrer noopener" : undefined}
          className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-primary/25 bg-primary/10 px-2.5 text-xs font-semibold text-primary shadow-2xs transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:scale-95"
          onClick={(e) => {
            // Allow direct click without triggering parent row link
            e.stopPropagation();
          }}
          title={hasExternalUrl ? "Open direct job posting" : "Review lead in Job Radar"}
        >
          <span>Review</span>
          {hasExternalUrl ? (
            <ExternalLink className="size-3" />
          ) : (
            <ArrowRight className="size-3" />
          )}
        </Link>
      }
    />
  );
}
