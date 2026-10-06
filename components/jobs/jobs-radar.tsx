"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { JobApplication, JobOpportunity } from "@prisma/client";
import {
  Archive,
  BadgeInfo,
  ExternalLink,
  Mail,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  sendSingleApplication,
  updateApplicationStatus,
} from "@/app/actions/dispatch";
import { emptyRejections } from "@/app/actions/jobs";
import {
  markOpportunityExternalApplied,
  sendOpportunityApplication,
  unmarkApplied,
} from "@/app/actions/opportunities";
import { updateMatchThreshold } from "@/app/actions/profile";
import { AtsHandoffDrawer } from "@/components/jobs/ats-handoff-drawer";
import { DraftReviewDialog } from "@/components/jobs/draft-review-dialog";
import { OpportunityDraftDialog } from "@/components/jobs/opportunity-draft-dialog";
import { OpportunitiesView } from "@/components/opportunities/opportunities-view";
import { SyncControls } from "@/components/opportunities/sync-controls";
import { CompanyLogo } from "@/components/ui/company-logo";
import { domainFromActionUrl } from "@/components/sender-avatar";
import { extractRecruiterEmail } from "@/lib/application-method";
import { faviconUrlForDomain } from "@/lib/domain";
import {
  isInHistory,
  isUserArchived,
  meetsMatchThreshold,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type JobsRadarProps = {
  accountId: string;
  jobs: JobApplication[];
  opportunities: JobOpportunity[];
  profile: MasterProfileInput | null;
  matchThreshold: number;
  retentionDays?: number;
};

const tabDescriptions: Record<string, string> = {
  leads:
    "Sourced opportunities and recruiter outreach matching your profile preferences.",
  applied: "Submitted applications and confirmation tracking records.",
  action:
    "Upcoming assessment links, interview requests, and urgent recruiter actions.",
  history: "Archived and dismissed opportunities stored for reference.",
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

function jobApplicationLogoSrc(
  actionUrl: string | null | undefined
): string | null {
  const domain = domainFromActionUrl(actionUrl);
  return domain ? faviconUrlForDomain(domain) : null;
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
  const [threshold, setThreshold] = useState(matchThreshold);
  const [activeTab, setActiveTab] = useState("leads");
  const [sort, setSort] = useState(TAB_SORT_CONFIG.leads.defaultSort);

  useEffect(() => {
    setThreshold(matchThreshold);
  }, [matchThreshold]);

  function handleTabChange(nextTab: string) {
    setActiveTab(nextTab);
    const nextConfig = TAB_SORT_CONFIG[tabKeyFromValue(nextTab)];
    const allowed = nextConfig.options.map((o) => o.value);
    if (!allowed.includes(sort)) {
      setSort(nextConfig.defaultSort);
    }
  }

  function commitThreshold(value: number) {
    const next = Math.min(100, Math.max(0, Math.round(value)));
    setThreshold(next);
    startTransition(async () => {
      const result = await updateMatchThreshold(accountId, next);
      if (!result.ok) {
        toast.error(result.error);
        setThreshold(matchThreshold);
        return;
      }
      router.refresh();
    });
  }

  // Leads: discoveries not user-archived, filtered by live threshold (0% = all).
  const opportunityLeadsAll = useMemo(() => {
    return opportunities.filter(
      (o) =>
        o.status === "DISCOVERED" &&
        !isUserArchived(o) &&
        meetsMatchThreshold(o.matchScore, threshold)
    );
  }, [opportunities, threshold]);

  const opportunityAction = useMemo(
    () =>
      opportunities.filter(
        (o) => o.status === "REVIEW_READY" && !isUserArchived(o)
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
          !meetsMatchThreshold(o.matchScore, threshold)
      ).length,
    [opportunities, threshold]
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
    <div>
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="mb-3 flex flex-col justify-between gap-3 pt-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-1.5">
            <TabsList className={segmentedTabsListClassName}>
              <TabsTrigger
                value="leads"
                className={segmentedTabsTriggerClassName}
              >
                <span>Leads</span>
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
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex shrink-0 rounded-full p-0.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    aria-label="Tab description"
                  >
                    <BadgeInfo className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-left">
                  {tabDescriptions[activeTab] ?? tabDescriptions.leads}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <SyncControls accountId={accountId} />
          </div>
        </div>

        <TabsContent value="leads" className="mt-0 space-y-3">
          {leadCount === 0 && !hasOpportunityLeads ? (
            <EmptyState text="No leads in the queue yet." />
          ) : (
            <div className="space-y-4">
              {hasOpportunityLeads ? (
                <OpportunitiesView
                  opportunities={sortedOpportunityLeads}
                  matchThreshold={threshold}
                  retentionDays={retentionDays}
                  variant="leads"
                  pending={pending}
                  emptyText="No matching opportunities."
                  showThresholdControl
                  onThresholdChange={setThreshold}
                  onThresholdCommit={commitThreshold}
                  hiddenCount={archivedLeadCount}
                  sortOption={sort}
                  onSortOptionChange={setSort}
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
                            <CompanyLogo
                              src={jobApplicationLogoSrc(job.actionUrl)}
                              name={job.companyName ?? "Company"}
                              size="lg"
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
                                    job.matchScore >= threshold
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
                                Send Now
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

        <TabsContent value="applied" className="mt-0 space-y-4">
          {appliedCount === 0 ? (
            <EmptyState text="No active applications waiting for a response." />
          ) : (
            <>
              {sortedOpportunityApplied.length > 0 ? (
                <OpportunitiesView
                  opportunities={sortedOpportunityApplied}
                  matchThreshold={threshold}
                  retentionDays={retentionDays}
                  variant="applied"
                  pending={pending}
                  emptyText="No applied opportunities."
                  sortOption={sort}
                  onSortOptionChange={setSort}
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
                        <CompanyLogo
                          src={jobApplicationLogoSrc(job.actionUrl)}
                          name={job.companyName ?? "Company"}
                          size="lg"
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

        <TabsContent value="action" className="mt-0 space-y-4">
          {actionCount === 0 ? (
            <EmptyState text="Nothing needs your attention right now." />
          ) : (
            <>
              {sortedOpportunityAction.length > 0 ? (
                <OpportunitiesView
                  opportunities={sortedOpportunityAction}
                  matchThreshold={threshold}
                  retentionDays={retentionDays}
                  variant="action"
                  pending={pending}
                  emptyText="No drafts awaiting review."
                  sortOption={sort}
                  onSortOptionChange={setSort}
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
                          <CompanyLogo
                            src={jobApplicationLogoSrc(job.actionUrl)}
                            name={job.companyName ?? "Company"}
                            size="lg"
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

        <TabsContent value="history" className="mt-0 space-y-4">
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
                  matchThreshold={threshold}
                  retentionDays={retentionDays}
                  variant="history"
                  pending={pending}
                  emptyText="No archived opportunities."
                  sortOption={sort}
                  onSortOptionChange={setSort}
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
                        <CompanyLogo
                          src={jobApplicationLogoSrc(job.actionUrl)}
                          name={job.companyName ?? "Company"}
                          size="lg"
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
