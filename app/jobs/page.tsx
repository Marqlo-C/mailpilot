import { JobsRadar } from "@/components/jobs/jobs-radar";
import { getActiveAccount, getJobsForAccount } from "@/lib/data";

export default async function JobsPage() {
  const active = await getActiveAccount();
  const jobs = active ? await getJobsForAccount(active.id) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Job Radar
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Interviews, assessments, applications, and rejections in one triage board.
        </p>
      </div>

      {!active ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <p className="font-medium">Connect a Gmail account first</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Job classification starts once an inbox is linked.
          </p>
        </div>
      ) : (
        <JobsRadar accountId={active.id} jobs={jobs} />
      )}
    </div>
  );
}
