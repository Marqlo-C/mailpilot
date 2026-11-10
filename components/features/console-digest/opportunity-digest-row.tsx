import Link from "next/link";
import type { JobOpportunity } from "@prisma/client";
import { CompanyLogo } from "@/components/ui/logo-frame";
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
    <Link
      href="/jobs"
      className="flex items-center gap-3 rounded-md border border-border px-3 py-2 hover:bg-muted/40"
    >
      <CompanyLogo
        src={
          opportunity.logoUrl ||
          getCompanyLogoUrl(opportunity.company, opportunity.companyDomain)
        }
        name={opportunity.company}
        size="md"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{opportunity.company}</p>
        <p className="truncate text-xs text-muted-foreground">
          {opportunity.title}
        </p>
      </div>
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
    </Link>
  );
}
