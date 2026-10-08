import Link from "next/link";
import type { JobApplication, JobOpportunity, Subscription } from "@prisma/client";
import { Briefcase, ClipboardList, Mail, Send } from "lucide-react";

import { COLORED_WORDMARK_SRC, Wordmark } from "@/components/brand/logo";
import { ScanInboxDialog } from "@/components/scan-inbox-dialog";
import { CompanyLogo } from "@/components/ui/company-logo";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { SCORE_PERCENT_CLASSNAME } from "@/components/ui/score-percent";
import {
  getActiveAccount,
  getJobOpportunitiesForAccount,
  getJobsForAccount,
  getSubscriptionsForAccount,
} from "@/lib/data";
import { faviconUrlForDomain, getCleanDomain } from "@/lib/domain";
import { getCompanyLogoUrl } from "@/lib/company-logo";
import { isUserArchived } from "@/lib/opportunities/lifecycle";
import { sortOpportunities } from "@/lib/opportunities/sorting";
import {
  clutterScoreTier,
  subscriptionClutterScore,
  type ClutterScoreTier,
} from "@/lib/subscriptions/filters";
import { DEFAULT_MATCH_THRESHOLD } from "@/lib/validations/profile";
import { cn } from "@/lib/utils";

const DIGEST_LIMIT = 5;

/** Same tier tints as the subscription clutter chips. */
const CLUTTER_VALUE_CLASSES: Record<ClutterScoreTier, string> = {
  high: "bg-[#c21f10]/10 text-[#c21f10] dark:bg-[#fb6230]/18 dark:text-[#fb6230]",
  mid: "bg-[hsl(28_70%_48%/0.14)] text-[hsl(28_62%_36%)] dark:bg-[hsl(28_70%_48%/0.2)] dark:text-[hsl(28_75%_68%)]",
  low: "bg-[hsl(174_22%_92%)] text-[#147a76] dark:bg-[hsl(174_28%_22%/0.55)] dark:text-[#5eead4]",
};

export default async function ConsolePage() {
  const active = await getActiveAccount();
  const opportunities = active
    ? await getJobOpportunitiesForAccount(active.id)
    : [];
  const jobs = active ? await getJobsForAccount(active.id) : [];
  const subscriptions = active
    ? await getSubscriptionsForAccount(active.id)
    : [];
  const threshold = active?.matchThreshold ?? DEFAULT_MATCH_THRESHOLD;

  const leadCount =
    opportunities.filter(
      (opportunity) =>
        opportunity.status === "DISCOVERED" && !isUserArchived(opportunity)
    ).length +
    jobs.filter((job) => job.status === "LEAD" && !job.isArchived).length;

  const actionOpportunities = sortOpportunities(
    opportunities.filter(
      (opportunity) =>
        opportunity.status === "REVIEW_READY" && !isUserArchived(opportunity)
    ),
    "deadline-asc"
  );
  const actionJobs = jobs.filter(
    (job) =>
      (job.status === "OA" || job.status === "INTERVIEW") && !job.isTrashed
  );

  const appliedCount =
    opportunities.filter(
      (opportunity) =>
        opportunity.status === "APPLIED" && !isUserArchived(opportunity)
    ).length + jobs.filter((job) => job.status === "APPLIED").length;

  const activeSubscriptions = subscriptions
    .filter(
      (subscription) =>
        subscription.status === "ACTIVE" || subscription.status === "FAILED"
    )
    .map((subscription) => ({
      subscription,
      clutter: subscriptionClutterScore({
        emailCount: subscription.emailCount,
        lastReceivedAt: subscription.lastReceivedAt,
      }),
    }))
    .sort((a, b) => b.clutter - a.clutter);

  const loudCount = activeSubscriptions.filter((row) => row.clutter >= 60)
    .length;

  const metrics = [
    {
      label: "Leads",
      value: leadCount,
      hint: "In Job Radar",
      icon: Briefcase,
      href: "/jobs",
    },
    {
      label: "Action required",
      value: actionOpportunities.length + actionJobs.length,
      hint: "Waiting on you",
      icon: ClipboardList,
      href: "/jobs",
    },
    {
      label: "Applied",
      value: appliedCount,
      hint: "Already sent",
      icon: Send,
      href: "/jobs",
    },
    {
      label: "Subscriptions",
      value: activeSubscriptions.length,
      hint: loudCount === 1 ? "1 running loud" : `${loudCount} running loud`,
      icon: Mail,
      href: "/subscriptions",
    },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="md:-mt-[4.25rem] md:pt-[calc(4.25rem-2.375rem)]">
        <div className="flex flex-col justify-end gap-3 pt-2 sm:flex-row sm:items-end sm:justify-between md:pt-0">
          <h1>
            <span className="sr-only">MailPilot</span>
            <span className="inline-flex h-[78px] max-w-[min(100%,27rem)] items-center overflow-hidden rounded-[32%/42%] md:max-w-[33rem]">
              <Wordmark
                src={COLORED_WORDMARK_SRC}
                height={156}
                imgClassName="max-w-none"
                priority
              />
            </span>
          </h1>
          <ScanInboxDialog accountId={active?.id ?? null} />
        </div>
        <p className="mt-1 max-w-xl text-xs leading-snug text-muted-foreground">
          What needs attention across Job Radar and Subscriptions.
        </p>
      </div>

      {!active ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <p className="font-medium">Connect a Gmail account first</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Job Radar and Subscriptions fill in once an inbox is linked.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <Link key={metric.label} href={metric.href} className="group">
                  <Card className="h-full transition-colors group-hover:border-primary/40">
                    <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                      <CardDescription>{metric.label}</CardDescription>
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-semibold tracking-tight">
                        {metric.value}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {metric.hint}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <h2 className="text-base font-semibold">Action queue</h2>
                  <CardDescription>
                    Drafts and follow-ups waiting on you
                  </CardDescription>
                </div>
                <DigestLink href="/jobs">Job Radar</DigestLink>
              </CardHeader>
              <CardContent className="space-y-2">
                {actionOpportunities.length + actionJobs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nothing needs your attention right now.
                  </p>
                ) : (
                  <>
                    {actionOpportunities.slice(0, DIGEST_LIMIT).map((opportunity) => (
                      <OpportunityDigestRow
                        key={opportunity.id}
                        opportunity={opportunity}
                        threshold={threshold}
                      />
                    ))}
                    {actionJobs
                      .slice(0, Math.max(0, DIGEST_LIMIT - actionOpportunities.length))
                      .map((job) => (
                        <ApplicationDigestRow key={job.id} job={job} />
                      ))}
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <h2 className="text-base font-semibold">Loudest senders</h2>
                  <CardDescription>
                    Active subscriptions by clutter score
                  </CardDescription>
                </div>
                <DigestLink href="/subscriptions">Subscriptions</DigestLink>
              </CardHeader>
              <CardContent className="space-y-2">
                {activeSubscriptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No active subscriptions yet.
                  </p>
                ) : (
                  activeSubscriptions.slice(0, DIGEST_LIMIT).map((row) => (
                    <SubscriptionDigestRow
                      key={row.subscription.id}
                      subscription={row.subscription}
                      clutter={row.clutter}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function DigestLink({
  href,
  children,
}: {
  href: string;
  children: string;
}) {
  return (
    <Link
      href={href}
      className="text-xs font-medium text-teal-600 underline underline-offset-2 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300"
    >
      {children}
    </Link>
  );
}

function OpportunityDigestRow({
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

function ApplicationDigestRow({ job }: { job: JobApplication }) {
  const domain = job.actionUrl ? domainFromUrl(job.actionUrl) : null;
  return (
    <Link
      href="/jobs"
      className="flex items-center gap-3 rounded-md border border-border px-3 py-2 hover:bg-muted/40"
    >
      <CompanyLogo
        src={domain ? faviconUrlForDomain(domain) : null}
        name={job.companyName ?? "Company"}
        size="md"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {job.companyName ?? "Company"}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {job.roleTitle ?? "Role"}
        </p>
      </div>
      <span className="shrink-0 text-[11px] font-medium text-amber-600 dark:text-amber-400">
        {job.status === "OA" ? "Assessment" : "Interview"}
      </span>
    </Link>
  );
}

function SubscriptionDigestRow({
  subscription,
  clutter,
}: {
  subscription: Subscription;
  clutter: number;
}) {
  const domain = getCleanDomain(subscription.senderEmail);
  const tier = clutterScoreTier(clutter);
  return (
    <Link
      href="/subscriptions"
      className="flex items-center gap-3 rounded-md border border-border px-3 py-2 hover:bg-muted/40"
    >
      <CompanyLogo
        src={domain ? faviconUrlForDomain(domain) : null}
        name={subscription.senderName ?? subscription.senderEmail}
        size="md"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {subscription.senderName ?? "—"}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {subscription.senderEmail}
        </p>
      </div>
      <span
        title="Clutter score"
        className={cn(
          "inline-flex h-[30px] shrink-0 items-center justify-center rounded-md px-2",
          SCORE_PERCENT_CLASSNAME,
          CLUTTER_VALUE_CLASSES[tier]
        )}
      >
        {clutter}%
      </span>
    </Link>
  );
}

function scoreTone(score: number): string {
  if (score >= 80) {
    return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  }
  if (score >= 60) {
    return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  }
  return "bg-muted/60 text-muted-foreground";
}

function domainFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
