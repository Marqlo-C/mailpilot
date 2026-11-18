import { SyncControls } from "@/components/features/opportunities/sync-controls";
import { AccountSwitcher } from "@/components/layout/account-switcher";
import { EmptyState } from "@/components/ui/composites";
import {
  getActiveAccount,
  getJobOpportunitiesForAccount,
  getJobsForAccount,
  getSubscriptionsForAccount,
  listAccounts,
} from "@/lib/data";
import { DEFAULT_MATCH_THRESHOLD } from "@/lib/validations/profile.schema";
import {
  ConsoleDigestCards,
  ConsoleMetricsGrid,
  ConsolePulseCapsules,
  computeConsoleMetrics,
} from "@/components/features/console-digest";

export default async function ConsolePage() {
  const [active, accounts] = await Promise.all([
    getActiveAccount(),
    listAccounts(),
  ]);

  const opportunities = active ? await getJobOpportunitiesForAccount(active.id) : [];
  const jobs = active ? await getJobsForAccount(active.id) : [];
  const subscriptions = active ? await getSubscriptionsForAccount(active.id) : [];
  const threshold = active?.matchThreshold ?? DEFAULT_MATCH_THRESHOLD;

  const { actionOpportunities, actionJobs, activeSubscriptions, metrics } =
    computeConsoleMetrics(opportunities, jobs, subscriptions);

  return (
    <div className="space-y-6">
      {/* Executive Mission Control Header */}
      <header className="flex flex-col gap-4 border-b border-border/60 pb-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-brand text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Mission Control
              </h1>
              <span className="inline-flex items-center rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-teal-700 dark:text-teal-300">
                Console Overview
              </span>
            </div>
            <p className="max-w-xl text-xs text-muted-foreground sm:text-sm">
              Real-time triage and operational intelligence across Job Radar and Subscriptions.
            </p>
          </div>

          {/* Right Action Deck: Account Switcher Context & Sync Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            {accounts.length > 0 ? (
              <AccountSwitcher
                accounts={accounts}
                activeAccountId={active?.id ?? null}
                activeEmail={active?.email ?? null}
                surface="header"
              />
            ) : null}
            <SyncControls accountId={active?.id ?? null} />
          </div>
        </div>

        {/* Real-time System Pulse Indicator Capsules */}
        <ConsolePulseCapsules activeAccount={active} />
      </header>

      {!active ? (
        <EmptyState
          size="lg"
          title="Connect a Gmail account first"
          description="Job Radar and Subscriptions fill in once an inbox is linked."
        />
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
