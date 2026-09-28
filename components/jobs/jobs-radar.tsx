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
import { SyncControls } from "@/components/opportunities/sync-controls";
import {
  SenderAvatar,
  domainFromActionUrl,
} from "@/components/sender-avatar";
import { extractRecruiterEmail } from "@/lib/application-method";
import {
  isInHistory,
  isUserArchived,
} from "@/lib/opportunities/lifecycle";
import {
  TAB_SORT_CONFIG,
  sortActionRequired,
  sortJobApplications,
  sortOpportunities,
  tabKeyFromValue,
} from "@/lib/opportunities/sorting";
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
import {
  segmentedTabsListClassName,
  segmentedTabsTriggerClassName,
  TabCountBadge,
} from "@/components/ui/segmented-tabs";
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
  const [activeTab, setActiveTab] = useState("leads");
  const [sort, setSort] = useState(TAB_SORT_CONFIG.leads.defaultSort);

  const sortConfig = TAB_SORT_CONFIG[tabKeyFromValue(activeTab)];

  function handleTabChange(nextTab: string) {
    setActiveTab(nextTab);
    const nextConfig = TAB_SORT_CONFIG[tabKeyFromValue(nextTab)];
    const allowed = nextConfig.options.map((o) => o.value);
    if (!allowed.includes(sort)) {
      setSort(nextConfig.defaultSort);
    }
  }

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

  const sortedOpportunityLeads = useMemo(
    () => sortOpportunities(opportunityLeadsAll, sort),
    [opportunityLeadsAll, sort]
  );
  const sortedOpportunityApplied = useMemo(
    () => sortOpportunities(opportunityApplied, sort),
    [opportunityApplied, sort]
  );
  const sortedOpportunityAction = useMemo(
    () => sortOpportunities(opportunityAction, sort),
    [opportunityAction, sort]
  );
  const sortedOpportunityHistory = useMemo(
    () => sortOpportunities(opportunityHistory, sort),
    [opportunityHistory, sort]
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
  const hasOpportunityLeads = useMemo(
    () =>
      opportunities.some(
        (o) => o.status === "DISCOVERED" && !isUserArchived(o)
      ),
    [opportunities]
  );
  const discoveredLeadCount = useMemo(
    () =>
      opportunities.filter(
        (o) => o.status === "DISCOVERED" && !isUserArchived(o)
      ).length,
    [opportunities]
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

  const sortedLeads = useMemo(
    () => sortJobApplications(leads, sort),
    [leads, sort]
  );
  const sortedApplied = useMemo(
    () => sortJobApplications(applied, sort),
    [applied, sort]
  );
  const sortedActionRequired = useMemo(
    () => sortActionRequired(actionRequired, sort),
    [actionRequired, sort]
  );
  const sortedHistory = useMemo(
    () => sortJobApplications(history, sort),
    [history, sort]
  );

  const leadCount = discoveredLeadCount + leads.length;
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Job Radar
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Leads, applications, action items, and history in one pipeline.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <TabsList className={segmentedTabsListClassName}>
            <TabsTrigger value="leads" className={segmentedTabsTriggerClassName}>
              <span>Leads / Queue</span>
              <TabCountBadge count={leadCount} />
            </TabsTrigger>
            <TabsTrigger
              value="applied"
              className={segmentedTabsTriggerClassName}
            >
              <span>Applied</span>
              <TabCountBadge count={appliedCount} />
            </TabsTrigger>
            <TabsTrigger
              value="action"
              className={segmentedTabsTriggerClassName}
            >
              <span>Action Required</span>
              <TabCountBadge count={actionCount} />
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className={segmentedTabsTriggerClassName}
            >
              <span>History</span>
              <TabCountBadge count={historyCount} />
            </TabsTrigger>
          </TabsList>

          <div className="flex shrink-0 flex-wrap items-center gap-2.5 self-start sm:self-auto">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="whitespace-nowrap">Sort by</span>
              <select
                id="jobs-tab-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="h-8 rounded-lg border border-border bg-background px-2 py-0.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-[#3c837b]"
              >
                {sortConfig.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={pending || batchIds.length === 0}
              className="bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:pointer-events-none disabled:opacity-40"
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
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Batch Send Approved ({batchIds.length})
            </Button>
            <SyncControls accountId={accountId} />
          </div>
        </div>

        <TabsContent value="leads" className="space-y-3">
          {leadCount === 0 && !hasOpportunityLeads ? (
            <EmptyState text="No leads in the queue yet." />
          ) : (
            <div className="space-y-4">
              {hasOpportunityLeads ? (
                <OpportunitiesView
                  opportunities={sortedOpportunityLeads}
                  matchThreshold={matchThreshold}
                  retentionDays={retentionDays}
                  variant="leads"
                  pending={pending}
                  emptyText="No matching opportunities."
                  showMatchesOnly={showOnlyMatches}
                  onShowMatchesOnlyChange={setShowOnlyMatches}
                  hiddenCount={archivedLeadCount}
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

              {sortedLeads.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {sortedLeads.map((job) => {
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
              {sortedOpportunityApplied.length > 0 ? (
                <OpportunitiesView
                  opportunities={sortedOpportunityApplied}
                  matchThreshold={matchThreshold}
                  retentionDays={retentionDays}
                  variant="applied"
                  pending={pending}
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
              {sortedApplied.length > 0 ? (
                <ul className="space-y-2">
                  {sortedApplied.map((job) => (
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
              {sortedOpportunityAction.length > 0 ? (
                <OpportunitiesView
                  opportunities={sortedOpportunityAction}
                  matchThreshold={matchThreshold}
                  retentionDays={retentionDays}
                  variant="action"
                  pending={pending}
                  emptyText="No drafts awaiting review."
                  onReviewDraft={(opp) => setDraftOpportunity(opp)}
                  onSendNow={handleOpportunitySend}
                />
              ) : null}
              {sortedActionRequired.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {sortedActionRequired.map((job) => (
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
              {sortedOpportunityHistory.length > 0 ? (
                <OpportunitiesView
                  opportunities={sortedOpportunityHistory}
                  matchThreshold={matchThreshold}
                  retentionDays={retentionDays}
                  variant="history"
                  pending={pending}
                  emptyText="No archived opportunities."
                />
              ) : null}
              {sortedHistory.length > 0 ? (
                <ul className="space-y-2">
                  {sortedHistory.map((job) => (
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
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
