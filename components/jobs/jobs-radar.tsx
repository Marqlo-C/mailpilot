"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { JobApplication } from "@prisma/client";
import { ExternalLink, Loader2, Trash2 } from "lucide-react";

import { emptyRejections } from "@/app/actions/jobs";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type JobsRadarProps = {
  accountId: string;
  jobs: JobApplication[];
};

function formatCountdown(deadlineAt: Date | null): string {
  if (!deadlineAt) return "No deadline";
  const ms = deadlineAt.getTime() - Date.now();
  if (ms <= 0) return "Past due";
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 24) return `${hours}h left`;
  const days = Math.floor(hours / 24);
  return `${days}d left`;
}

export function JobsRadar({ accountId, jobs }: JobsRadarProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const actionRequired = useMemo(
    () =>
      jobs.filter(
        (j) =>
          j.actionRequired &&
          !j.isTrashed &&
          (j.status === "INTERVIEW" || j.status === "OA")
      ),
    [jobs]
  );

  const applications = useMemo(
    () =>
      jobs.filter((j) => j.status === "RECEIVED" && !j.isTrashed),
    [jobs]
  );

  const rejections = useMemo(
    () => jobs.filter((j) => j.status === "REJECTION"),
    [jobs]
  );

  return (
    <Tabs defaultValue="action">
      <TabsList className="grid w-full grid-cols-3 md:w-auto md:inline-flex">
        <TabsTrigger value="action">
          Action Required
          {actionRequired.length > 0 && (
            <Badge variant="secondary" className="ml-1.5">
              {actionRequired.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="applications">Applications</TabsTrigger>
        <TabsTrigger value="rejections">Rejections</TabsTrigger>
      </TabsList>

      <TabsContent value="action" className="mt-4 space-y-3">
        {actionRequired.length === 0 ? (
          <EmptyState text="Nothing needs your attention right now." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {actionRequired.map((job) => (
              <Card key={job.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">
                        {job.companyName ?? "Unknown company"}
                      </CardTitle>
                      <CardDescription>
                        {job.roleTitle ?? "Role not specified"}
                      </CardDescription>
                    </div>
                    <Badge
                      variant={job.status === "OA" ? "default" : "secondary"}
                    >
                      {job.status === "OA" ? "OA" : "Interview"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="font-medium text-primary">
                    {formatCountdown(
                      job.deadlineAt ? new Date(job.deadlineAt) : null
                    )}
                  </p>
                  {job.actionSummary && (
                    <p className="text-muted-foreground">{job.actionSummary}</p>
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
                          : "Schedule / Open"}
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

      <TabsContent value="applications" className="mt-4">
        {applications.length === 0 ? (
          <EmptyState text="No application acknowledgments yet." />
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-lg border border-border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Received</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {applications.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-medium">
                        {job.companyName ?? "—"}
                      </TableCell>
                      <TableCell>{job.roleTitle ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(job.emailDate).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="space-y-3 md:hidden">
              {applications.map((job) => (
                <li
                  key={job.id}
                  className="rounded-lg border border-border bg-card p-4"
                >
                  <p className="font-medium">{job.companyName ?? "—"}</p>
                  <p className="text-sm text-muted-foreground">
                    {job.roleTitle ?? "Role unknown"} ·{" "}
                    {new Date(job.emailDate).toLocaleDateString()}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </TabsContent>

      <TabsContent value="rejections" className="mt-4 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {rejections.length} rejection
            {rejections.length === 1 ? "" : "s"} logged
          </p>
          <Button
            variant="destructive"
            disabled={pending || rejections.length === 0}
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
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Trash All Rejections in Gmail
          </Button>
        </div>

        {rejections.length === 0 ? (
          <EmptyState text="No rejections detected yet." />
        ) : (
          <ul className="space-y-2">
            {rejections.map((job) => (
              <li
                key={job.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {job.companyName ?? "Unknown company"}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {job.roleTitle ?? "Role unknown"} ·{" "}
                    {new Date(job.emailDate).toLocaleDateString()}
                  </p>
                </div>
                <Badge variant={job.isTrashed ? "outline" : "secondary"}>
                  {job.isTrashed ? "Trashed" : "Logged"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>
    </Tabs>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
