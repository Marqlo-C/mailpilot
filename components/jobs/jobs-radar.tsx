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
  dismissOpportunity,
  markOpportunityExternalApplied,
  sendOpportunityApplication,
} from "@/app/actions/opportunities";
import { AtsHandoffDrawer } from "@/components/jobs/ats-handoff-drawer";
import { DraftReviewDialog } from "@/components/jobs/draft-review-dialog";
import { OpportunityDraftDialog } from "@/components/jobs/opportunity-draft-dialog";
import {
  SenderAvatar,
  domainFromActionUrl,
} from "@/components/sender-avatar";
import { canDraftDirectEmail, extractRecruiterEmail } from "@/lib/application-method";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type JobsRadarProps = {
  accountId: string;
  jobs: JobApplication[];
  opportunities: JobOpportunity[];
  profile: MasterProfileInput | null;
  matchThreshold: number;
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

function applicationTypeLabel(type: string): string {
  if (type === "DIRECT_EMAIL") return "Email Lead";
  if (type === "QUICK_APPLY") return "Quick Apply";
  return "External link";
}

export function JobsRadar({
  accountId,
  jobs,
  opportunities,
  profile,
  matchThreshold,
}: JobsRadarProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [portalJob, setPortalJob] = useState<JobApplication | null>(null);
  const [draftJob, setDraftJob] = useState<JobApplication | null>(null);
  const [draftOpportunity, setDraftOpportunity] =
    useState<JobOpportunity | null>(null);

  const opportunityLeads = useMemo(
    () =>
      opportunities.filter(
        (o) => o.status === "DISCOVERED" || o.status === "REVIEW_READY"
      ),
    [opportunities]
  );
  const opportunityApplied = useMemo(
    () => opportunities.filter((o) => o.status === "APPLIED"),
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

  const leadCount = opportunityLeads.length + leads.length;

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

  return (
    <>
      <Tabs defaultValue="leads">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex sm:grid-cols-none">
            <TabsTrigger value="leads">
              Leads / Queue
              {leadCount > 0 && (
                <Badge variant="secondary" className="ml-1.5">
                  {leadCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="applied">Applied</TabsTrigger>
            <TabsTrigger value="action">Action Required</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
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
          {leadCount === 0 ? (
            <EmptyState text="No leads in the queue yet." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {opportunityLeads.map((opp) => {
                const canEmail = canDraftDirectEmail(opp.recipientEmail);
                return (
                  <Card key={`opp-${opp.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        <SenderAvatar
                          name={opp.company}
                          domain={domainFromActionUrl(opp.applyUrl)}
                        />
                        <div className="min-w-0 flex-1">
                          <CardTitle className="text-base">
                            {opp.company}
                          </CardTitle>
                          <CardDescription>{opp.title}</CardDescription>
                          {(opp.location || opp.salary) && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {[opp.location, opp.salary]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {typeof opp.matchScore === "number" && (
                            <Badge
                              variant={
                                opp.matchScore >= matchThreshold
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {opp.matchScore}%
                            </Badge>
                          )}
                          <Badge variant="outline">
                            {applicationTypeLabel(opp.applicationType)}
                          </Badge>
                          {opp.status === "REVIEW_READY" ? (
                            <Badge variant="secondary">Draft ready</Badge>
                          ) : null}
                        </div>
                      </div>
                    </CardHeader>
                    <CardFooter className="flex flex-wrap gap-2">
                      {canEmail ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => setDraftOpportunity(opp)}
                          >
                            <Mail className="h-4 w-4" />
                            Review & Edit Draft
                          </Button>
                          <Button
                            size="sm"
                            disabled={pending}
                            onClick={() => {
                              startTransition(async () => {
                                const result =
                                  await sendOpportunityApplication(
                                    opp.id,
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
                      ) : (
                        <>
                          {opp.applyUrl ? (
                            <Button asChild size="sm">
                              <a
                                href={opp.applyUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <ExternalLink className="h-4 w-4" />
                                {opp.applicationType === "QUICK_APPLY"
                                  ? "Quick Apply"
                                  : "Open apply link"}
                              </a>
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => {
                              startTransition(async () => {
                                await markOpportunityExternalApplied(opp.id);
                                toast.success("Marked as applied");
                                router.refresh();
                              });
                            }}
                          >
                            Mark applied
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => {
                          startTransition(async () => {
                            await dismissOpportunity(opp.id);
                            router.refresh();
                          });
                        }}
                      >
                        <Archive className="h-4 w-4" />
                        Dismiss
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}

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
                          {job.opportunityStatus &&
                          job.opportunityStatus !== "DETECTED" ? (
                            <Badge variant="secondary">
                              {job.opportunityStatus === "DRAFT_PREPARED"
                                ? "Draft ready"
                                : job.opportunityStatus === "DRAFT_SAVED_GMAIL"
                                  ? "In Gmail drafts"
                                  : job.opportunityStatus}
                            </Badge>
                          ) : null}
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
          )}
        </TabsContent>

        <TabsContent value="applied" className="space-y-3">
          {applied.length === 0 && opportunityApplied.length === 0 ? (
            <EmptyState text="No active applications waiting for a response." />
          ) : (
            <ul className="space-y-2">
              {opportunityApplied.map((opp) => (
                <li
                  key={`opp-applied-${opp.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <SenderAvatar
                      name={opp.company}
                      domain={domainFromActionUrl(opp.applyUrl)}
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{opp.company}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {opp.title}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary">
                    Applied {daysAgo(opp.updatedAt)}
                  </Badge>
                </li>
              ))}
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
                  <Badge variant="secondary">
                    Applied {daysAgo(job.appliedAt ?? job.emailDate)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="action" className="space-y-3">
          {actionRequired.length === 0 ? (
            <EmptyState text="Nothing needs your attention right now." />
          ) : (
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
                  <CardFooter>
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
                  </CardFooter>
                </Card>
              ))}
            </div>
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
          {history.length === 0 ? (
            <EmptyState text="No history yet." />
          ) : (
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
                </li>
              ))}
            </ul>
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
