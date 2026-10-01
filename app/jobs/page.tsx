import { JobsRadar } from "@/components/jobs/jobs-radar";
import { ScanInboxDialog } from "@/components/scan-inbox-dialog";
import { getMasterProfile } from "@/app/actions/profile";
import {
  getActiveAccount,
  getJobOpportunitiesForAccount,
  getJobsForAccount,
} from "@/lib/data";
import { DEFAULT_MATCH_THRESHOLD } from "@/lib/validations/profile";
import { DEFAULT_ACCOUNT_RULES } from "@/lib/validations/rules";

export default async function JobsPage() {
  const active = await getActiveAccount();
  const jobs = active ? await getJobsForAccount(active.id) : [];
  const opportunities = active
    ? await getJobOpportunitiesForAccount(active.id)
    : [];
  const profileResult = active
    ? await getMasterProfile(active.id)
    : { ok: false as const, error: "no account" };
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

  if (!active) {
    return (
      <div className="space-y-4">
        <p className="pb-3 text-xs text-muted-foreground">
          Leads, applications, action items, and history in one pipeline.
        </p>
        <div className="mb-3 flex justify-end">
          <ScanInboxDialog accountId={null} />
        </div>

        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <p className="font-medium">Connect a Gmail account first</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Job classification starts once an inbox is linked.
          </p>
        </div>
      </div>
    );
  }

  return (
    <JobsRadar
      accountId={active.id}
      jobs={jobs}
      opportunities={opportunities}
      profile={profile}
      matchThreshold={threshold}
      retentionDays={retentionDays}
    />
  );
}
