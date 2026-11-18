"use client";

import type { JobApplication, JobOpportunity } from "@prisma/client";
import { CheckCircle2, Inbox, Radio, Sparkles } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { DigestLink } from "./digest-link";
import { OpportunityDigestRow } from "./opportunity-digest-row";
import { ApplicationDigestRow } from "./application-digest-row";
import { SubscriptionDigestRow } from "./subscription-digest-row";
import type { ActiveSubscriptionDigest } from "./metrics";
import { cn } from "@/lib/utils";

const DIGEST_LIMIT = 5;

export function ConsoleDigestCards({
  actionOpportunities,
  actionJobs,
  activeSubscriptions,
  threshold,
}: {
  actionOpportunities: JobOpportunity[];
  actionJobs: JobApplication[];
  activeSubscriptions: ActiveSubscriptionDigest[];
  threshold: number;
}) {
  const actionTotal = actionOpportunities.length + actionJobs.length;
  const loudSendersCount = activeSubscriptions.filter((s) => s.clutter >= 60).length;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Left Card: Action Center (Drafts & Follow-ups) */}
      <Card className="relative overflow-hidden border-border/80 bg-card/60 shadow-xs backdrop-blur-xs mp-specular-depth mp-top-lit-border">
        <CardHeader className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-md border border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Sparkles className="size-3.5" />
              </span>
              <h2 className="font-brand text-base font-bold tracking-tight text-foreground sm:text-lg">
                Action Center
              </h2>
              {actionTotal > 0 ? (
                <span className="inline-flex items-center rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                  {actionTotal} pending
                </span>
              ) : null}
            </div>
            <CardDescription className="text-xs">
              Drafts and follow-ups waiting on your decision
            </CardDescription>
          </div>
          <DigestLink href="/jobs">Job Radar</DigestLink>
        </CardHeader>
        <CardContent className="space-y-2 pt-1">
          {actionTotal === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/70 py-8 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-5" />
              </div>
              <p className="mt-2 text-sm font-medium text-foreground">
                All caught up
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                No drafts or assessments pending in your action queue right now.
              </p>
            </div>
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

      {/* Right Card: Subscription Signal & Noise (Loudest Senders) */}
      <Card className="relative overflow-hidden border-border/80 bg-card/60 shadow-xs backdrop-blur-xs mp-specular-depth mp-top-lit-border">
        <CardHeader className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-md border border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <Radio className="size-3.5" />
              </span>
              <h2 className="font-brand text-base font-bold tracking-tight text-foreground sm:text-lg">
                Subscription Signal &amp; Noise
              </h2>
              {loudSendersCount > 0 ? (
                <span className="inline-flex items-center rounded-full border border-rose-500/25 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-300">
                  {loudSendersCount} loud
                </span>
              ) : null}
            </div>
            <CardDescription className="text-xs">
              Loudest senders ranked by clutter &amp; delivery volume
            </CardDescription>
          </div>
          <DigestLink href="/subscriptions">Subscriptions</DigestLink>
        </CardHeader>
        <CardContent className="space-y-2 pt-1">
          {activeSubscriptions.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/70 py-8 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Inbox className="size-5" />
              </div>
              <p className="mt-2 text-sm font-medium text-foreground">
                No subscriptions detected
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Subscription radar will identify senders as emails arrive.
              </p>
            </div>
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
  );
}
