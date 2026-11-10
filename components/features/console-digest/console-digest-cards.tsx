import type { JobApplication, JobOpportunity } from "@prisma/client";
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
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <h2 className="text-base font-semibold">Action queue</h2>
            <CardDescription>Drafts and follow-ups waiting on you</CardDescription>
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
            <CardDescription>Subscribed by noise level</CardDescription>
          </div>
          <DigestLink href="/subscriptions">Subscriptions</DigestLink>
        </CardHeader>
        <CardContent className="space-y-2">
          {activeSubscriptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No subscribed senders yet.</p>
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
