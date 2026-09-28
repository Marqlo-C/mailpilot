"use client";

import { useEffect } from "react";
import { ResumeUploadDialog } from "@/components/profile/resume-upload-dialog";
import { ManualProfileEditor } from "@/components/profile/manual-profile-editor";
import { ProfileRevisionsMenu } from "@/components/profile/profile-revisions-menu";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { MasterProfileInput } from "@/lib/validations/profile";

export type ProfileSnapshotData = MasterProfileInput & {
  updatedAt?: string;
  matchThreshold?: number;
  linkedWebsite?: string | null;
  linkedIndeed?: string | null;
  linkedGlassdoor?: string | null;
  linkedGithub?: string | null;
  linkedLinkedin?: string | null;
  linkedHandshake?: string | null;
};

type MasterProfileCardProps = {
  accountId: string | null;
  profile: ProfileSnapshotData | null;
};

const LINKED_FIELDS: Array<{
  key: keyof ProfileSnapshotData;
  label: string;
}> = [
  { key: "linkedWebsite", label: "Website" },
  { key: "linkedLinkedin", label: "LinkedIn" },
  { key: "linkedGithub", label: "GitHub" },
  { key: "linkedIndeed", label: "Indeed" },
  { key: "linkedGlassdoor", label: "Glassdoor" },
  { key: "linkedHandshake", label: "Handshake" },
];

function formatUpdatedAtUtc(iso: string): string {
  return `${new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  })} UTC`;
}

/**
 * Unified Master Profile card: header identity, edit/import actions, and
 * collapsible snapshot of skills / experience / projects / education.
 */
export function MasterProfileCard({
  accountId,
  profile,
}: MasterProfileCardProps) {
  useEffect(() => {
    // #region agent log
    if (profile?.updatedAt) {
      const utc = formatUpdatedAtUtc(profile.updatedAt);
      const local = new Date(profile.updatedAt).toLocaleString();
      fetch(
        "http://127.0.0.1:7809/ingest/151252f8-c719-4220-ad29-b58c7990906d",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "3c315a",
          },
          body: JSON.stringify({
            sessionId: "3c315a",
            runId: "post-fix",
            hypothesisId: "J",
            location: "master-profile-card.tsx:mount",
            message: "date format comparison (UTC vs local)",
            data: {
              utc,
              local,
              mismatched: utc.replace(" UTC", "") !== local,
            },
            timestamp: Date.now(),
          }),
        }
      ).catch(() => {});
    }
    // #endregion
  }, [profile?.updatedAt]);

  return (
    <Card className="border-border/80 bg-muted/20 shadow-none">
      <CardHeader className="gap-4 border-b border-border/60 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <CardTitle className="text-xl tracking-tight">Master Profile</CardTitle>
          {profile ? (
            <>
              <div className="space-y-1">
                <p className="text-lg font-semibold">{profile.fullName}</p>
                <p className="text-sm text-muted-foreground">{profile.email}</p>
                <p className="text-sm text-muted-foreground">
                  {[profile.phone, profile.location].filter(Boolean).join(" · ") ||
                    "No phone / location"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {profile.updatedAt ? (
                  <CardDescription>
                    <span suppressHydrationWarning>
                      Updated {formatUpdatedAtUtc(profile.updatedAt)}
                    </span>
                  </CardDescription>
                ) : null}
              </div>
            </>
          ) : (
            <CardDescription>
              No profile data yet. Click Edit Fields or Import Resume to begin.
            </CardDescription>
          )}
        </div>

        {accountId ? (
          <div className="flex flex-wrap gap-2">
            <ManualProfileEditor accountId={accountId} profile={profile} />
            <ResumeUploadDialog
              accountId={accountId}
              triggerLabel="Import Resume"
            />
            {profile ? <ProfileRevisionsMenu accountId={accountId} /> : null}
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-3 pt-6">
        {!accountId ? (
          <p className="text-sm text-muted-foreground">
            Connect a Gmail account to manage your master profile.
          </p>
        ) : !profile ? (
          <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
            <p className="font-medium">No profile data yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Click Edit Fields or Import Resume to begin.
            </p>
          </div>
        ) : (
          <>
            <details className="group rounded-lg border border-border/70 bg-background/50 open:bg-background/70">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between gap-2">
                  Contact & Linked Accounts
                  <span className="text-xs font-normal text-muted-foreground group-open:hidden">
                    Expand
                  </span>
                </span>
              </summary>
              <div className="space-y-4 border-t border-border/60 px-4 py-4 text-sm">
                <dl className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      Phone
                    </dt>
                    <dd className="mt-1 font-medium">
                      {profile.phone || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      Email
                    </dt>
                    <dd className="mt-1 break-all font-medium">
                      {profile.email || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      Summary
                    </dt>
                    <dd className="mt-1 text-muted-foreground">
                      {profile.summary || "—"}
                    </dd>
                  </div>
                </dl>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {LINKED_FIELDS.map(({ key, label }) => {
                    const url = profile[key];
                    const linked = typeof url === "string" && url.length > 0;
                    return (
                      <li
                        key={key}
                        className="flex items-start justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="font-medium">{label}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {linked ? url : "Not linked"}
                          </p>
                        </div>
                        <Badge variant={linked ? "secondary" : "outline"}>
                          {linked ? "Linked" : "Missing"}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </details>

            <details className="group rounded-lg border border-border/70 bg-background/50 open:bg-background/70" open>
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                Skills Matrix
              </summary>
              <div className="space-y-4 border-t border-border/60 px-4 py-4">
                {(
                  [
                    ["Languages", profile.skills.languages],
                    ["Frameworks", profile.skills.frameworks],
                    ["Tools", profile.skills.tools],
                    ["Concepts", profile.skills.concepts],
                  ] as const
                ).map(([label, items]) => (
                  <div key={label}>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {label}
                    </p>
                    {items.length === 0 ? (
                      <p className="text-sm text-muted-foreground">None listed</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {items.map((skill) => (
                          <Badge key={`${label}-${skill}`} variant="secondary">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </details>

            <details className="group rounded-lg border border-border/70 bg-background/50 open:bg-background/70" open>
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                Work History ({profile.experiences.length})
              </summary>
              <div className="space-y-3 border-t border-border/60 px-4 py-4">
                {profile.experiences.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No work history saved.
                  </p>
                ) : (
                  profile.experiences.map((exp) => (
                    <div
                      key={exp.id ?? `${exp.company}-${exp.role}`}
                      className="rounded-md border border-border/60 p-3"
                    >
                      <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
                        <p className="font-semibold">
                          {exp.role} · {exp.company}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {exp.startDate} – {exp.endDate ?? "Present"}
                        </p>
                      </div>
                      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
                        {exp.bullets.map((b) => (
                          <li key={b.id}>
                            {b.rawText}
                            {b.hasMetric ? (
                              <Badge variant="outline" className="ml-2">
                                metric
                              </Badge>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </div>
            </details>

            <details className="group rounded-lg border border-border/70 bg-background/50 open:bg-background/70">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                Projects ({profile.projects.length})
              </summary>
              <div className="space-y-3 border-t border-border/60 px-4 py-4">
                {profile.projects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No projects saved.</p>
                ) : (
                  profile.projects.map((project) => (
                    <div
                      key={project.id ?? project.name}
                      className="rounded-md border border-border/60 p-3 text-sm"
                    >
                      <p className="font-semibold">{project.name}</p>
                      {project.description ? (
                        <p className="mt-1 text-muted-foreground">
                          {project.description}
                        </p>
                      ) : null}
                      {project.technologies.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {project.technologies.map((tech) => (
                            <Badge key={tech} variant="outline">
                              {tech}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                      {project.bullets.length > 0 ? (
                        <ul className="mt-2 list-disc space-y-1 pl-5">
                          {project.bullets.map((bullet) => (
                            <li key={bullet}>{bullet}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </details>

            <details className="group rounded-lg border border-border/70 bg-background/50 open:bg-background/70">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                Education ({profile.education.length})
              </summary>
              <div className="space-y-3 border-t border-border/60 px-4 py-4">
                {profile.education.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No education saved.
                  </p>
                ) : (
                  profile.education.map((ed) => (
                    <div
                      key={ed.id ?? `${ed.institution}-${ed.degree}`}
                      className="rounded-md border border-border/60 p-3 text-sm"
                    >
                      <p className="font-semibold">
                        {ed.degree}
                        {ed.fieldOfStudy ? ` in ${ed.fieldOfStudy}` : ""}
                      </p>
                      <p className="text-muted-foreground">
                        {ed.institution}
                        {ed.graduationDate ? ` · ${ed.graduationDate}` : ""}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}
