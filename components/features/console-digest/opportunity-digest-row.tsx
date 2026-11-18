import type { JobOpportunity } from "@prisma/client";
import { DigestRowItem } from "./digest-row-item";
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
        <span
          title={score < threshold ? "Below match threshold" : "Match score"}
          className={cn(
            "inline-flex h-[30px] shrink-0 items-center justify-center rounded-md px-2",
            SCORE_PERCENT_CLASSNAME,
            scoreTone(score)
          )}
        >
          {score}%
        </span>
      }
    />
  );
}
