import { COLORED_WORDMARK_SRC, Wordmark } from "@/components/brand/logo";
import { SyncControls } from "@/components/features/opportunities/sync-controls";
import {
  getActiveAccount,
  getJobOpportunitiesForAccount,
  getJobsForAccount,
  getSubscriptionsForAccount,
} from "@/lib/data";
import { DEFAULT_MATCH_THRESHOLD } from "@/lib/validations/profile.schema";
import {
  ConsoleDigestCards,
  ConsoleMetricsGrid,
  computeConsoleMetrics,
} from "@/components/features/console-digest";

export default async function ConsolePage() {
  const active = await getActiveAccount();
  const opportunities = active ? await getJobOpportunitiesForAccount(active.id) : [];
  const jobs = active ? await getJobsForAccount(active.id) : [];
  const subscriptions = active ? await getSubscriptionsForAccount(active.id) : [];
  const threshold = active?.matchThreshold ?? DEFAULT_MATCH_THRESHOLD;

  const { actionOpportunities, actionJobs, activeSubscriptions, metrics } =
    computeConsoleMetrics(opportunities, jobs, subscriptions);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between md:pt-0">
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
          <SyncControls accountId={active?.id ?? null} />
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
          <ConsoleMetricsGrid metrics={metrics} />
          <ConsoleDigestCards
            actionOpportunities={actionOpportunities}
            actionJobs={actionJobs}
            activeSubscriptions={activeSubscriptions}
            threshold={threshold}
          />
        </>
      )}
    </div>
  );
}
