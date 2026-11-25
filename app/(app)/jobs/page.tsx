import { JobsRadar } from "@/components/features/opportunities/toolbar/jobs-radar";
import { SyncControls } from "@/components/features/opportunities/sync-controls";
import { EmptyState } from "@/components/ui/composites";
import { getMasterProfile } from "@/app/actions/profile";
import {
  getActiveAccount,
  getJobOpportunitiesForAccount,
  getJobsForAccount,
} from "@/lib/data";
import { DEFAULT_MATCH_THRESHOLD } from "@/lib/validations/profile.schema";
import { DEFAULT_ACCOUNT_RULES } from "@/lib/validations/rules.schema";
import { JOB_RADAR_PAGE_TABS } from "@/lib/utils/navigation/page-tabs";
import { readServerActivePageTab } from "@/lib/utils/navigation/page-tabs-server";
import { isFeatureEnabled } from "@/lib/core/feature-flags";

export default async function JobsPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string; opportunityId?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const active = await getActiveAccount();
  const [jobs, opportunities, profileResult, initialTab] = await Promise.all([
    active ? getJobsForAccount(active.id) : [],
    active ? getJobOpportunitiesForAccount(active.id) : [],
    active
      ? getMasterProfile(active.id)
      : { ok: false as const, error: "no account" },
    readServerActivePageTab(
      "/jobs",
      JOB_RADAR_PAGE_TABS.map((t) => t.value),
      active?.id ?? null
    ),
  ]);
  const profile =
    profileResult.ok && profileResult.data
      ? (() => {
          const { updatedAt: _u, ...rest } = profileResult.data;
          return rest;
        })()
      : null;

  const threshold = active?.matchThreshold ?? DEFAULT_MATCH_THRESHOLD;
  const retentionDays =
    active?.rules.dismissedRetentionDays ??
    DEFAULT_ACCOUNT_RULES.dismissedRetentionDays;
  const isEmbeddedAiEnabled = isFeatureEnabled("embedded_ai", active?.rules);
  const isAutoDispatchEnabled =
    active?.rules.applicationMode === "AUTO_SEND";

  if (!active) {
    return (
      <div className="space-y-3 pt-2">
        <div className="mb-3 flex justify-end">
          <SyncControls accountId={null} />
        </div>
        <EmptyState
          size="lg"
          title="Connect a Gmail account first"
          description="Job classification starts once an inbox is linked."
        />
      </div>
    );
  }

  return (
    <JobsRadar
      accountId={active.id}
      initialTab={params.tab ?? initialTab ?? undefined}
      initialOpportunityId={params.opportunityId}
      jobs={jobs}
      opportunities={opportunities}
      profile={profile}
      matchThreshold={threshold}
      retentionDays={retentionDays}
      isEmbeddedAiEnabled={isEmbeddedAiEnabled}
      isAutoDispatchEnabled={isAutoDispatchEnabled}
    />
  );
}
