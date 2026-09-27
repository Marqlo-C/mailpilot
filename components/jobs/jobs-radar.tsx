"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { JobApplication, JobOpportunity } from "@prisma/client";
import {
  Archive,
  ExternalLink,
  Loader2,
  Mail,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  batchSendApplications,
  sendSingleApplication,
  updateApplicationStatus,
} from "@/app/actions/dispatch";
import { emptyRejections } from "@/app/actions/jobs";
import {
  markOpportunityExternalApplied,
  sendOpportunityApplication,
  unmarkApplied,
} from "@/app/actions/opportunities";
import { AtsHandoffDrawer } from "@/components/jobs/ats-handoff-drawer";
import { DraftReviewDialog } from "@/components/jobs/draft-review-dialog";
import { OpportunityDraftDialog } from "@/components/jobs/opportunity-draft-dialog";
import { OpportunitiesView } from "@/components/opportunities/opportunities-view";
import {
  SenderAvatar,
  domainFromActionUrl,
} from "@/components/sender-avatar";
import { extractRecruiterEmail } from "@/lib/application-method";
import {
  isInHistory,
  isUserArchived,
} from "@/lib/opportunities/lifecycle";
import type { MasterProfileInput } from "@/lib/validations/profile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type JobsRadarProps = {
  accountId: string;
  jobs: JobApplication[];
  opportunities: JobOpportunity[];
  profile: MasterProfileInput | null;
  matchThreshold: number;
  retentionDays?: number;
};

function daysAgo(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const ms = Date.now() - new Date(date).getTime();
  const days = Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
  if (days === 0) return "today";
  return `${days}d ago`;
}

function formatCountdown(deadlineAt: Date | null): string {
  if (!deadlineAt) return "No deadline";
  const ms = deadlineAt.getTime() - Date.now();
  if (ms <= 0) return "Past due";
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 24) return `${hours}h left`;
  return `${Math.floor(hours / 24)}d left`;
}

function TabCount({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Badge variant="secondary" className="ml-1.5">
      {count}
    </Badge>
  );
}

export function JobsRadar({
  accountId,
  jobs,
  opportunities,
  profile,
  matchThreshold,
  retentionDays = 30,
}: JobsRadarProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [portalJob, setPortalJob] = useState<JobApplication | null>(null);
  const [draftJob, setDraftJob] = useState<JobApplication | null>(null);
  const [draftOpportunity, setDraftOpportunity] =
    useState<JobOpportunity | null>(null);
  const [showOnlyMatches, setShowOnlyMatches] = useState(true);

  // Leads: discoveries not user-archived. Matches-only hides below-threshold.
  const opportunityLeadsAll = useMemo(() => {
    const discovered = opportunities.filter(
      (o) => o.status === "DISCOVERED" && !isUserArchived(o)
    );
    if (!showOnlyMatches) return discovered;
    return discovered.filter(
      (o) => !o.isArchived && (o.matchScore ?? 0) >= matchThreshold
    );
  }, [opportunities, showOnlyMatches, matchThreshold]);

  const opportunityAction = useMemo(
    () =>
      opportunities.filter(
        (o) =>
          o.status === "REVIEW_READY" &&
          !o.isArchived &&
          !isUserArchived(o)
      ),
    [opportunities]
  );
  const opportunityApplied = useMemo(
    () =>
      opportunities.filter(
        (o) => o.status === "APPLIED" && !isUserArchived(o)
      ),
    [opportunities]
  );
  // History: dismissed + user-archived (below-threshold soft-hides stay in leads).
  const opportunityHistory = useMemo(
    () => opportunities.filter((o) => isInHistory(o)),
    [opportunities]
  );
  const archivedLeadCount = useMemo(
    () =>
      opportunities.filter(
        (o) =>
          o.status === "DISCOVERED" &&
          !isUserArchived(o) &&
          (o.isArchived || (o.matchScore ?? 0) < matchThreshold)
      ).length,
    [opportunities, matchThreshold]
  );

  const leads = useMemo(
    () => jobs.filter((j) => j.status === "LEAD" && !j.isArchived),
    [jobs]
  );
  const applied = useMemo(
    () => jobs.filter((j) => j.status === "APPLIED"),
    [jobs]
  );
  const actionRequired = useMemo(
    () =>
      jobs.filter(
        (j) =>
          (j.status === "OA" || j.status === "INTERVIEW") && !j.isTrashed
      ),
    [jobs]
  );
  const history = useMemo(
    () =>
      jobs.filter((j) =>
        ["REJECTION", "OFFER", "ARCHIVED"].includes(j.status)
      ),
    [jobs]
  );

  const leadCount = opportunityLeadsAll.length + leads.length;
  const appliedCount = opportunityApplied.length + applied.length;
  const actionCount = opportunityAction.length + actionRequired.length;
  const historyCount = opportunityHistory.length + history.length;

  const batchIds = leads
    .filter(
      (j) =>
        j.dispatchType === "EMAIL" &&
        (j.matchScore ?? 0) >= matchThreshold &&
        Boolean(
          extractRecruiterEmail({
            actionSummary: j.actionSummary,
            actionUrl: j.actionUrl,
            applyUrl: j.applyUrl,
          })
        )
    )
    .map((j) => j.id);

  function handleOpportunitySend(opp: JobOpportunity) {
    startTransition(async () => {
      const result = await sendOpportunityApplication(opp.id, false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Application sent");
      router.refresh();
    });
  }

  return (
    <>
      <Tabs defaultValue="leads">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex sm:grid-cols-none">
            <TabsTrigger value="leads">
              Leads / Queue
              <TabCount count={leadCount} />
            </TabsTrigger>
            <TabsTrigger value="applied">
              Applied
              <TabCount count={appliedCount} />
            </TabsTrigger>
            <TabsTrigger value="action">
              Action Required
              <TabCount count={actionCount} />
            </TabsTrigger>
            <TabsTrigger value="history">
              History
              <TabCount count={historyCount} />
            </TabsTrigger>
          </TabsList>

          <Button
            type="button"
            size="sm"
            disabled={pending || batchIds.length === 0}
            onClick={() => {
              startTransition(async () => {
                const toastId = toast.loading(
                  `Batch sending ${batchIds.length} applications…`
                );
                const result = await batchSendApplications(batchIds);
                if (!result.ok || !result.data) {
                  toast.error(result.ok ? "Batch failed" : result.error, {
                    id: toastId,
                  });
                  return;
                }
                toast.success(
                  `Sent ${result.data.sent}, skipped ${result.data.skipped}`,
                  { id: toastId }
                );
                router.refresh();
              });
            }}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Batch Send Approved ({batchIds.length})
          </Button>
        </div>

        <TabsContent value="leads" className="space-y-3">
          <div className="flex flex-col gap-2 rounded-lg border border-border/80 bg-muted/30 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Switch
                id="show-only-matches"
                checked={showOnlyMatches}
                onCheckedChange={setShowOnlyMatches}
              />
              <Label htmlFor="show-only-matches" className="text-sm font-normal">
                {showOnlyMatches
                  ? `Show only matches (≥ ${matchThreshold}%)`
                  : "Show all (including filtered)"}
              </Label>
            </div>
            {archivedLeadCount > 0 ? (
              <p className="text-xs text-muted-foreground">
                {archivedLeadCount} below-threshold listing
                {archivedLeadCount === 1 ? "" : "s"}
                {showOnlyMatches ? " hidden" : " visible"}
              </p>
            ) : null}
          </div>

          {leadCount === 0 ? (
            <EmptyState text="No leads in the queue yet." />
          ) : (
            <div className="space-y-4">
              {opportunityLeadsAll.length > 0 ? (
                <OpportunitiesView
                  opportunities={opportunityLeadsAll}
                  matchThreshold={matchThreshold}
                  retentionDays={retentionDays}
                  variant="leads"
                  pending={pending}
                  emptyText="No matching opportunities."
                  onReviewDraft={(opp) => setDraftOpportunity(opp)}
                  onSendNow={handleOpportunitySend}
                  onMarkApplied={(opp) => {
                    startTransition(async () => {
                      await markOpportunityExternalApplied(opp.id);
                      toast.success("Marked as applied");
                      router.refresh();
                    });
                  }}
                />
              ) : null}

              {leads.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {leads.map((job) => {
                    const canEmail = Boolean(
                      extractRecruiterEmail({
                        actionSummary: job.actionSummary,
                        actionUrl: job.actionUrl,
                        applyUrl: job.applyUrl,
                      })
                    );
                    const isPortal =
                      job.dispatchType === "PORTAL" ||
                      job.applicationMethod === "PORTAL_QUICK_APPLY" ||
                      job.applicationMethod === "EXTERNAL_LINK" ||
                      !canEmail;

                    return (
                      <Card key={job.id}>
                        <CardHeader className="pb-3">
                          <div className="flex items-start gap-3">
                            <SenderAvatar
                              name={job.companyName}
                              domain={domainFromActionUrl(job.actionUrl)}
                            />
                            <div className="min-w-0 flex-1">
                              <CardTitle className="text-base">
                                {job.companyName ?? "Unknown company"}
                              </CardTitle>
                              <CardDescription>
                                {job.roleTitle ?? "Role not specified"}
                              </CardDescription>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              {typeof job.matchScore === "number" && (
                                <Badge
                                  variant={
                                    job.matchScore >= matchThreshold
                                      ? "default"
                                      : "secondary"
                                  }
                                >
                                  {job.matchScore}%
                                </Badge>
                              )}
                              <Badge variant="outline">
                                {isPortal
                                  ? job.applicationMethod === "EXTERNAL_LINK"
                                    ? "External link"
                                    : "Portal"
                                  : "Email Lead"}
                              </Badge>
                            </div>
                          </div>
                        </CardHeader>
                        <CardFooter className="flex flex-wrap gap-2">
                          {isPortal ? (
                            <>
                              {(job.applyUrl || job.actionUrl) && (
                                <Button asChild size="sm" variant="outline">
                                  <a
                                    href={job.applyUrl || job.actionUrl || "#"}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                    Open link
                                  </a>
                                </Button>
                              )}
                              <Button
                                size="sm"
                                onClick={() => setPortalJob(job)}
                              >
                                ATS Quick-Fill
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={pending}
                                onClick={() => setDraftJob(job)}
                              >
                                <Mail className="h-4 w-4" />
                                Review & Edit Draft
                              </Button>
                              <Button
                                size="sm"
                                disabled={pending}
                                onClick={() => {
                                  startTransition(async () => {
                                    const result = await sendSingleApplication(
                                      job.id,
                                      false
                                    );
                                    if (!result.ok) {
                                      toast.error(result.error);
                                      return;
                                    }
                                    toast.success("Application sent");
                                    router.refresh();
                                  });
                                }}
                              >
                                <Send className="h-4 w-4" />
                                Send now
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => {
                              startTransition(async () => {
                                await updateApplicationStatus(job.id, "ARCHIVED");
                                router.refresh();
                              });
                            }}
                          >
                            <Archive className="h-4 w-4" />
                            Archive
                          </Button>
                        </CardFooter>
                      </Card>
                    );
                  })}
                </div>
              ) : null}
            </div>
          )}
        </TabsContent>

        <TabsContent value="applied" className="space-y-4">
          {appliedCount === 0 ? (
            <EmptyState text="No active applications waiting for a response." />
          ) : (
            <>
              {opportunityApplied.length > 0 ? (
                <OpportunitiesView
                  opportunities={opportunityApplied}
                  matchThreshold={matchThreshold}
                  retentionDays={retentionDays}
                  variant="applied"
                  pending={pending}
                  showSort={false}
                  emptyText="No applied opportunities."
                  onUnmarkApplied={(opp) => {
                    startTransition(async () => {
                      await unmarkApplied(opp.id);
                      toast.success("Moved back to leads");
                      router.refresh();
                    });
                  }}
                />
              ) : null}
              {applied.length > 0 ? (
                <ul className="space-y-2">
                  {applied.map((job) => (
                    <li
                      key={job.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <SenderAvatar
                          name={job.companyName}
                          domain={domainFromActionUrl(job.actionUrl)}
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {job.companyName ?? "Company"}
                          </p>
                          <p className="truncate text-sm text-muted-foreground">
                            {job.roleTitle ?? "Role"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          Applied {daysAgo(job.appliedAt ?? job.emailDate)}
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => {
                            startTransition(async () => {
                              await updateApplicationStatus(job.id, "LEAD");
                              toast.success("Moved back to leads");
                              router.refresh();
                            });
                          }}
                        >
                          Unmark
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </TabsContent>

        <TabsContent value="action" className="space-y-4">
          {actionCount === 0 ? (
            <EmptyState text="Nothing needs your attention right now." />
          ) : (
            <>
              {opportunityAction.length > 0 ? (
                <OpportunitiesView
                  opportunities={opportunityAction}
                  matchThreshold={matchThreshold}
                  retentionDays={retentionDays}
                  variant="action"
                  pending={pending}
                  showSort={false}
                  emptyText="No drafts awaiting review."
                  onReviewDraft={(opp) => setDraftOpportunity(opp)}
                  onSendNow={handleOpportunitySend}
                />
              ) : null}
              {actionRequired.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {actionRequired.map((job) => (
                    <Card key={job.id} className="border-primary/30">
                      <CardHeader className="pb-3">
                        <div className="flex items-start gap-3">
                          <SenderAvatar
                            name={job.companyName}
                            domain={domainFromActionUrl(job.actionUrl)}
                          />
                          <div className="min-w-0 flex-1">
                            <CardTitle className="text-base">
                              {job.companyName ?? "Company"}
                            </CardTitle>
                            <CardDescription>
                              {job.roleTitle ?? "Role"}
                            </CardDescription>
                          </div>
                          <Badge>{job.status}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <p className="font-medium text-primary">
                          {formatCountdown(
                            job.deadlineAt ? new Date(job.deadlineAt) : null
                          )}
                        </p>
                        {job.actionSummary && (
                          <p className="text-muted-foreground">
                            {job.actionSummary}
                          </p>
                        )}
                      </CardContent>
                      <CardFooter className="flex flex-wrap gap-2">
                        {job.actionUrl ? (
                          <Button asChild size="sm">
                            <a
                              href={job.actionUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <ExternalLink className="h-4 w-4" />
                              {job.status === "OA"
                                ? "Take Assessment"
                                : "Open link"}
                            </a>
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" disabled>
                            No action link
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => {
                            startTransition(async () => {
                              await updateApplicationStatus(job.id, "ARCHIVED");
                              router.refresh();
                            });
                          }}
                        >
                          <Archive className="h-4 w-4" />
                          Dismiss
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <div className="flex justify-end">
            <Button
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={() => {
                if (
                  !window.confirm(
                    "Trash all rejection-labeled messages in Gmail?"
                  )
                ) {
                  return;
                }
                startTransition(async () => {
                  await emptyRejections(accountId);
                  router.refresh();
                });
              }}
            >
              <Trash2 className="h-4 w-4" />
              Cleanup Rejections in Gmail
            </Button>
          </div>

          {historyCount === 0 ? (
            <EmptyState text="No history yet." />
          ) : (
            <>
              {opportunityHistory.length > 0 ? (
                <OpportunitiesView
                  opportunities={opportunityHistory}
                  matchThreshold={matchThreshold}
                  retentionDays={retentionDays}
                  variant="history"
                  pending={pending}
                  showSort={false}
                  emptyText="No archived opportunities."
                />
              ) : null}
              {history.length > 0 ? (
                <ul className="space-y-2">
                  {history.map((job) => (
                    <li
                      key={job.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <SenderAvatar
                          name={job.companyName}
                          domain={domainFromActionUrl(job.actionUrl)}
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {job.companyName ?? "Company"}
                          </p>
                          <p className="truncate text-sm text-muted-foreground">
                            {job.roleTitle ?? "Role"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            job.status === "OFFER"
                              ? "default"
                              : job.status === "REJECTION"
                                ? "destructive"
                                : "outline"
                          }
                        >
                          {job.status}
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => {
                            startTransition(async () => {
                              await updateApplicationStatus(job.id, "LEAD");
                              toast.success("Restored to leads");
                              router.refresh();
                            });
                          }}
                        >
                          Restore
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </TabsContent>
      </Tabs>

      <AtsHandoffDrawer
        open={Boolean(portalJob)}
        onOpenChange={(open) => !open && setPortalJob(null)}
        application={portalJob}
        profile={profile}
      />
      <DraftReviewDialog
        open={Boolean(draftJob)}
        onOpenChange={(open) => !open && setDraftJob(null)}
        application={draftJob}
        onCompleted={() => router.refresh()}
      />
      <OpportunityDraftDialog
        open={Boolean(draftOpportunity)}
        onOpenChange={(open) => !open && setDraftOpportunity(null)}
        opportunity={draftOpportunity}
        onCompleted={() => router.refresh()}
      />
    </>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
