"use client";

import { PersonaViewer } from "@/components/profile/persona-viewer";
import { ResumeUploadDialog } from "@/components/profile/resume-upload-dialog";
import { ManualProfileEditor } from "@/components/profile/manual-profile-editor";
import { ProfileRevisionsMenu } from "@/components/profile/profile-revisions-menu";
import { SETTINGS_CARD_CLASSNAME } from "@/components/settings/settings-chrome";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { MasterProfileInput } from "@/lib/validations/profile";
import { skillGroupsFromUnknown } from "@/lib/skill-groups";
import {
  educationProgressLabel,
  formatEducationDates,
  formatEducationTitle,
  formatSchoolName,
} from "@/lib/utils/format";
import { isWorkExperienceCategory } from "@/lib/validations/profile";
import { cn } from "@/lib/utils";

export type ProfileSnapshotData = MasterProfileInput & {
  updatedAt?: string;
  matchThreshold?: number;
  linkedWebsite?: string | null;
  linkedIndeed?: string | null;
  linkedGlassdoor?: string | null;
  linkedGithub?: string | null;
  linkedLinkedin?: string | null;
  linkedHandshake?: string | null;
  seniorityTier?: string | null;
  timelineContext?: string | null;
  toneGuidance?: string | null;
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

function DateChip({
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className="inline-flex shrink-0 items-center whitespace-nowrap rounded-md border border-border/60 px-2.5 py-0.5 text-xs text-muted-foreground"
      {...props}
    >
      {children}
    </p>
  );
}

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
  const skillGroups = skillGroupsFromUnknown(profile?.skills);
  return (
    <Card className={cn(SETTINGS_CARD_CLASSNAME)}>
      <CardHeader className="gap-4 border-b border-border/50 sm:flex-row sm:items-start sm:justify-between">
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
            <PersonaViewer profile={profile} />

            <details className="group rounded-lg border border-border/70 bg-background/50 open:bg-background/70">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between gap-2">
                  Contact & Linked Accounts
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

            <details className="group rounded-lg border border-border/70 bg-background/50 open:bg-background/70">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                Skills
              </summary>
              <div className="space-y-4 border-t border-border/60 px-4 py-4">
                {skillGroups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None listed</p>
                ) : (
                  skillGroups.map((group, index) => (
                    <div key={`${group.label}-${index}`}>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {group.label}
                      </p>
                      {group.items.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          None listed
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {group.items.map((skill) => (
                            <Badge
                              key={`${group.label}-${skill.name}`}
                              variant="secondary"
                              className="gap-1 font-normal"
                            >
                              <span className="font-medium">{skill.name}</span>
                              {skill.proficiency ? (
                                <span className="text-muted-foreground">
                                  · {skill.proficiency}
                                </span>
                              ) : null}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </details>

            <details className="group rounded-lg border border-border/70 bg-background/50 open:bg-background/70">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                Work History ({profile.experiences.filter((exp) => isWorkExperienceCategory(exp.category)).length})
              </summary>
              <div className="space-y-3 border-t border-border/60 px-4 py-4">
                {profile.experiences.filter((exp) => isWorkExperienceCategory(exp.category)).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No work history saved.
                  </p>
                ) : (
                  profile.experiences.filter((exp) => isWorkExperienceCategory(exp.category)).map((exp) => (
                    <div
                      key={exp.id ?? `${exp.company}-${exp.role}`}
                      className="rounded-md border border-border/60 p-3"
                    >
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <p className="font-semibold">
                          {exp.role} · {exp.company}
                        </p>
                        <DateChip>
                          {exp.startDate} – {exp.endDate ?? "Present"}
                        </DateChip>
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
                Activities & Leadership ({profile.experiences.filter((exp) => !isWorkExperienceCategory(exp.category)).length})
              </summary>
              <div className="space-y-3 border-t border-border/60 px-4 py-4">
                {profile.experiences.filter((exp) => !isWorkExperienceCategory(exp.category)).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No activities or leadership saved.
                  </p>
                ) : (
                  profile.experiences.filter((exp) => !isWorkExperienceCategory(exp.category)).map((exp) => (
                    <div
                      key={exp.id ?? `${exp.company}-${exp.role}`}
                      className="rounded-md border border-border/60 p-3"
                    >
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <p className="font-semibold">
                          {exp.role} · {exp.company}
                        </p>
                        <DateChip>
                          {exp.startDate} – {exp.endDate ?? "Present"}
                        </DateChip>
                      </div>
                      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
                        {exp.bullets.map((b) => (
                          <li key={b.id}>{b.rawText}</li>
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
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <p className="font-semibold">{project.name}</p>
                        {project.technologies.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 sm:justify-end">
                            {project.technologies.map((tech) => (
                              <Badge key={tech} variant="outline">
                                {tech}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      {project.description || project.bullets.length > 0 ? (
                        <ul className="mt-2 list-disc space-y-1.5 pl-5">
                          {project.description ? (
                            <li>{project.description}</li>
                          ) : null}
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
                  profile.education.map((ed) => {
                    const title = formatEducationTitle(ed.degree, ed.fieldOfStudy);
                    const school = formatSchoolName(ed.institution, ed.subSchool);
                    const dateRange = formatEducationDates(ed);
                    const progressLabel = educationProgressLabel(ed);
                    return (
                    <div
                      key={ed.id ?? `${ed.institution}-${ed.degree}`}
                      className="rounded-md border border-border/60 p-3 text-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          {school ? <p className="font-semibold">{school}</p> : null}
                          {title ? <p>{title}</p> : null}
                        </div>
                        {dateRange || progressLabel ? (
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            {dateRange ? <DateChip>{dateRange}</DateChip> : null}
                            {progressLabel ? (
                              <Badge
                                variant="outline"
                                className="font-normal text-muted-foreground"
                              >
                                {progressLabel}
                              </Badge>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      {ed.honors.length > 0 ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {ed.honors.join(", ")}
                        </p>
                      ) : null}
                      {ed.coursework.length > 0 ? (
                        <div className="mt-2">
                          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Relevant Coursework
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {ed.coursework.map((course) => (
                              <Badge key={course} variant="outline">
                                {course}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                    );
                  })
                )}
              </div>
            </details>

            <details className="group rounded-lg border border-border/70 bg-background/50 open:bg-background/70">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                Certifications & Licenses ({profile.certifications.length})
              </summary>
              <div className="space-y-2 border-t border-border/60 px-4 py-4 text-sm">
                {profile.certifications.length === 0 ? (
                  <p className="text-muted-foreground">None listed.</p>
                ) : (
                  profile.certifications.map((item) => (
                    <div
                      key={`${item.name}-${item.issuer ?? ""}`}
                      className="rounded-md border border-border/60 p-3"
                    >
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <p className="font-semibold">{item.name}</p>
                        {item.date ? <DateChip>{item.date}</DateChip> : null}
                      </div>
                      {item.issuer ? (
                        <p className="text-muted-foreground">{item.issuer}</p>
                      ) : null}
                      {item.url ? (
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {item.url}
                        </p>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </details>

            <details className="group rounded-lg border border-border/70 bg-background/50 open:bg-background/70">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                Honors & Awards ({profile.awards.length})
              </summary>
              <div className="space-y-2 border-t border-border/60 px-4 py-4 text-sm">
                {profile.awards.length === 0 ? (
                  <p className="text-muted-foreground">None listed.</p>
                ) : (
                  profile.awards.map((item) => (
                    <div
                      key={`${item.title}-${item.issuer ?? ""}`}
                      className="rounded-md border border-border/60 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 font-semibold">{item.title}</p>
                        {item.date ? <DateChip>{item.date}</DateChip> : null}
                      </div>
                      {item.issuer ? (
                        <p className="text-muted-foreground">{item.issuer}</p>
                      ) : null}
                      {item.description ? (
                        <p className="mt-1 leading-relaxed">{item.description}</p>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </details>

            <details className="group rounded-lg border border-border/70 bg-background/50 open:bg-background/70">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                Interests ({profile.interests.length})
              </summary>
              <div className="border-t border-border/60 px-4 py-4">
                {profile.interests.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None listed.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {profile.interests.map((interest) => (
                      <Badge key={interest} variant="secondary">
                        {interest}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}
