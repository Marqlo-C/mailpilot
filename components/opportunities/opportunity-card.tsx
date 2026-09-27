"use client";

import { useState } from "react";
import type { JobOpportunity } from "@prisma/client";
import {
  Archive,
  ExternalLink,
  Mail,
  MapPin,
  Send,
} from "lucide-react";

import { getCompanyLogoUrl } from "@/lib/company-logo";
import { canDraftDirectEmail } from "@/lib/application-method";
import { formatDistanceToNow } from "@/lib/format-distance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type OpportunityCardProps = {
  opportunity: JobOpportunity;
  matchThreshold: number;
  pending?: boolean;
  onReviewDraft?: () => void;
  onSendNow?: () => void;
  onMarkApplied?: () => void;
  onDismiss?: () => void;
};

function matchTone(score: number): string {
  if (score >= 80) {
    return "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  }
  if (score >= 60) {
    return "border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-300";
  }
  return "border-border bg-muted text-muted-foreground";
}

function applicationTypeLabel(type: string): string {
  if (type === "DIRECT_EMAIL") return "Email Lead";
  if (type === "QUICK_APPLY") return "Quick Apply";
  return "External link";
}

function CompanyLogo({
  company,
  logoUrl,
  domain,
}: {
  company: string;
  logoUrl: string | null;
  domain: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const src = logoUrl || getCompanyLogoUrl(company, domain);
  const initial = (company.trim()[0] ?? "?").toUpperCase();

  if (failed) {
    return (
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-semibold text-muted-foreground"
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
      className="h-10 w-10 shrink-0 rounded-md bg-muted object-contain"
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Rich JobOpportunity card: logo, match score, salary/age/location badges, apply CTA.
 */
export function OpportunityCard({
  opportunity,
  matchThreshold,
  pending = false,
  onReviewDraft,
  onSendNow,
  onMarkApplied,
  onDismiss,
}: OpportunityCardProps) {
  const canEmail = canDraftDirectEmail(opportunity.recipientEmail);
  const score = opportunity.matchScore ?? 0;
  const belowThreshold = score < matchThreshold;
  const receivedLabel = formatDistanceToNow(new Date(opportunity.receivedAt), {
    addSuffix: true,
  });

  return (
    <Card
      className={cn(belowThreshold && opportunity.isArchived && "opacity-80")}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <CompanyLogo
            company={opportunity.company}
            logoUrl={opportunity.logoUrl}
            domain={opportunity.companyDomain}
          />
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base">{opportunity.company}</CardTitle>
            <CardDescription>{opportunity.title}</CardDescription>
            {opportunity.description ? (
              <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
                {opportunity.description}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {opportunity.salary ? (
                <Badge variant="secondary" className="font-normal">
                  {opportunity.salary}
                </Badge>
              ) : null}
              {opportunity.postedAt ? (
                <Badge variant="outline" className="font-normal">
                  {opportunity.postedAt}
                </Badge>
              ) : null}
              {opportunity.location ? (
                <Badge variant="outline" className="font-normal">
                  <MapPin className="mr-1 h-3 w-3" />
                  {opportunity.location}
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge
              variant="outline"
              className={cn("tabular-nums", matchTone(score))}
              title={opportunity.matchReason ?? undefined}
            >
              {score}%
            </Badge>
            <Badge variant="outline">
              {applicationTypeLabel(opportunity.applicationType)}
            </Badge>
            {opportunity.isArchived ? (
              <Badge variant="secondary">Below threshold</Badge>
            ) : null}
            {opportunity.status === "REVIEW_READY" ? (
              <Badge variant="secondary">Draft ready</Badge>
            ) : null}
          </div>
        </div>
        {opportunity.matchReason ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {opportunity.matchReason}
          </p>
        ) : null}
      </CardHeader>
      <CardFooter className="flex flex-col items-stretch gap-3">
        <div className="flex flex-wrap gap-2">
          {opportunity.applyUrl ? (
            <a
              href={opportunity.applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Open Job Posting
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}

          {canEmail ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={onReviewDraft}
              >
                <Mail className="h-4 w-4" />
                Review & Edit Draft
              </Button>
              <Button size="sm" disabled={pending} onClick={onSendNow}>
                <Send className="h-4 w-4" />
                Send now
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={onMarkApplied}
            >
              Mark applied
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={onDismiss}
          >
            <Archive className="h-4 w-4" />
            Dismiss
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Received {receivedLabel}
        </p>
      </CardFooter>
    </Card>
  );
}
