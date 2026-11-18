import type { JobApplication, JobOpportunity, Subscription } from "@prisma/client";
import { isUserArchived } from "@/lib/opportunities/lifecycle";
import { sortOpportunities } from "@/lib/opportunities/sorting";
import { subscriptionClutterScore } from "@/lib/subscriptions/filters";

export type MetricTone = "emerald" | "amber" | "blue" | "rose" | "default";

export type ConsoleMetricId = "leads" | "action" | "applied" | "subscriptions";

export interface ConsoleMetricItem {
  id: ConsoleMetricId;
  label: string;
  value: number;
  hint: string;
  href: string;
  badge?: string;
  tone?: MetricTone;
}

export interface ActiveSubscriptionDigest {
  subscription: Subscription;
  clutter: number;
}

export interface ConsoleDigestData {
  leadCount: number;
  actionOpportunities: JobOpportunity[];
  actionJobs: JobApplication[];
  appliedCount: number;
  activeSubscriptions: ActiveSubscriptionDigest[];
  loudCount: number;
  metrics: ConsoleMetricItem[];
}

export function computeConsoleMetrics(
  opportunities: JobOpportunity[],
  jobs: JobApplication[],
  subscriptions: Subscription[]
): ConsoleDigestData {
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

  const loudCount = activeSubscriptions.filter((row) => row.clutter >= 60).length;

  const actionTotal = actionOpportunities.length + actionJobs.length;

  const metrics: ConsoleMetricItem[] = [
    {
      id: "leads",
      label: "Leads",
      value: leadCount,
      hint: "In Job Radar",
      href: "/jobs",
      tone: "emerald",
      badge: leadCount > 0 ? "Radar Active" : undefined,
    },
    {
      id: "action",
      label: "Action Required",
      value: actionTotal,
      hint: actionTotal === 1 ? "1 item waiting on you" : `${actionTotal} waiting on you`,
      href: "/jobs",
      tone: "amber",
      badge: actionTotal > 0 ? "Needs Triage" : "All Clear",
    },
    {
      id: "applied",
      label: "Dispatched / Applied",
      value: appliedCount,
      hint: "Already sent & tracking",
      href: "/jobs",
      tone: "blue",
      badge: appliedCount > 0 ? `${appliedCount} In-Flight` : undefined,
    },
    {
      id: "subscriptions",
      label: "Loud Senders",
      value: loudCount,
      hint:
        activeSubscriptions.length === 1
          ? "1 total subscription"
          : `${activeSubscriptions.length} total subscriptions`,
      href: "/subscriptions",
      tone: "rose",
      badge: loudCount > 0 ? `${loudCount} Running Loud` : "Quiet Inbox",
    },
  ];

  return {
    leadCount,
    actionOpportunities,
    actionJobs,
    appliedCount,
    activeSubscriptions,
    loudCount,
    metrics,
  };
}
