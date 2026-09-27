import Link from "next/link";
import {
  Archive,
  ArrowRight,
  Briefcase,
  ClipboardList,
  Mail,
} from "lucide-react";

import { ScanInboxDialog } from "@/components/scan-inbox-dialog";
import {
  SenderAvatar,
  domainFromActionUrl,
} from "@/components/sender-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getActiveAccount,
  getDashboardMetrics,
} from "@/lib/data";

export default async function DashboardPage() {
  const active = await getActiveAccount();
  const metrics = active
    ? await getDashboardMetrics(active.id)
    : {
        activeInterviews: 0,
        pendingAssessments: 0,
        subscriptionsDetected: 0,
        cleanedRejections: 0,
        actionRequired: [],
        recentSubscriptions: [],
      };

  const cards = [
    {
      label: "Active Interviews",
      value: metrics.activeInterviews,
      icon: Briefcase,
      href: "/jobs",
    },
    {
      label: "Pending Assessments",
      value: metrics.pendingAssessments,
      icon: ClipboardList,
      href: "/jobs",
    },
    {
      label: "Subscriptions Detected",
      value: metrics.subscriptionsDetected,
      icon: Mail,
      href: "/subscriptions",
    },
    {
      label: "Cleaned Rejections",
      value: metrics.cleanedRejections,
      icon: Archive,
      href: "/jobs",
    },
  ] as const;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Overview</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">
            MailPilot
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground md:text-base">
            Real-time unsubscribe detection and job-application triage for{" "}
            {active?.email ?? "your Gmail inboxes"}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ScanInboxDialog accountId={active?.id ?? null} />
          {!active && (
            <Button asChild>
              <a href="/api/auth/google?intent=link">Connect Gmail</a>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.label} href={card.href} className="group">
              <Card className="h-full transition-colors group-hover:border-primary/40">
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                  <CardDescription>{card.label}</CardDescription>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-semibold tracking-tight">
                    {card.value}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Action queue</CardTitle>
              <CardDescription>
                Interviews and assessments waiting on you
              </CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/jobs">
                Open radar <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {metrics.actionRequired.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No urgent actions right now.
              </p>
            ) : (
              metrics.actionRequired.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <SenderAvatar
                      name={job.companyName}
                      domain={domainFromActionUrl(job.actionUrl)}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {job.companyName ?? "Company"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {job.roleTitle ?? "Role"}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary">{job.status}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Recent subscriptions</CardTitle>
              <CardDescription>
                Latest senders with unsubscribe targets
              </CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/subscriptions">
                Manage <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {metrics.recentSubscriptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No subscriptions detected yet.
              </p>
            ) : (
              metrics.recentSubscriptions.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <SenderAvatar
                      email={sub.senderEmail}
                      name={sub.senderName}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {sub.senderName ?? sub.senderEmail}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {sub.emailCount} email
                        {sub.emailCount === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline">
                    {sub.unsubPostUrl
                      ? "One-Click"
                      : sub.unsubMailto
                        ? "Email"
                        : "Link"}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
