import type { JobApplication, JobOpportunity, Subscription } from "@prisma/client";
import { ClipboardList, MailCheck, Radar, Send } from "lucide-react";
import { isUserArchived } from "@/lib/opportunities/lifecycle";
import { sortOpportunities } from "@/lib/opportunities/sorting";
import { subscriptionClutterScore } from "@/lib/subscriptions/filters";

export interface ConsoleMetricItem {
  label: string;
  value: number;
  hint: string;
  icon: typeof Radar;
  href: string;
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

  const loudCount = activeSubscriptions.filter((row) => row.clutter >= 60)
    .length;

  const metrics: ConsoleMetricItem[] = [
    {
      label: "Leads",
      value: leadCount,
      hint: "In Job Radar",
      icon: Radar,
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
      icon: MailCheck,
      href: "/subscriptions",
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
