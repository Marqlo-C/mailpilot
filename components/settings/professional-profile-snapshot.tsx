"use client";

import { Pencil } from "lucide-react";

import { ResumeUploadDialog } from "@/components/profile/resume-upload-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatEducationTitle, formatSchoolName } from "@/lib/utils/format";
import {
  isWorkExperienceCategory,
  type MasterProfileInput,
} from "@/lib/validations/profile";
import { skillGroupsFromUnknown } from "@/lib/skill-groups";

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

type ProfessionalProfileSnapshotProps = {
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

/**
 * Read-only audit view of the structured master profile for truthfulness checks.
 */
export function ProfessionalProfileSnapshot({
  accountId,
  profile,
}: ProfessionalProfileSnapshotProps) {
  if (!accountId) {
    return (
      <Card className="border-border/80 bg-muted/25 shadow-none">
        <CardHeader>
          <CardTitle>Professional Profile Snapshot</CardTitle>
          <CardDescription>
            Connect a Gmail account to review your structured master profile.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!profile) {
    return (
      <Card className="border-border/80 bg-muted/25 shadow-none">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Professional Profile Snapshot</CardTitle>
            <CardDescription>
              Upload a resume to populate skills, work history, projects, and
              education for verification.
            </CardDescription>
          </div>
          <ResumeUploadDialog accountId={accountId} triggerLabel="Upload Resume" />
        </CardHeader>
      </Card>
    );
  }

  const skillGroups = skillGroupsFromUnknown(profile.skills);

  return (
    <Card className="border-border/80 bg-muted/25 shadow-none">
      <CardHeader className="gap-4 border-b border-border/60 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-xl tracking-tight">
            Professional Profile Snapshot
          </CardTitle>
          <CardDescription>
            Audit the structured master profile used for matching, tailoring,
            and dispatch. Last updated{" "}
            <span suppressHydrationWarning>
              {profile.updatedAt
                ? `${new Date(profile.updatedAt).toLocaleString("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "UTC",
                  })} UTC`
                : "—"}
            </span>
            .
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <ResumeUploadDialog
            accountId={accountId}
            initialProfile={profile}
            triggerLabel="Manually Edit Profile"
            triggerVariant="secondary"
          />
          <ResumeUploadDialog
            accountId={accountId}
            triggerLabel="Re-parse Resume"
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-6">
        <SnapshotSection
          title="Identity"
          hint="Primary contact from the master resume"
        >
          <div className="space-y-1 text-sm">
            <p className="text-base font-semibold text-foreground">
              {profile.fullName}
            </p>
            <p className="text-muted-foreground">{profile.email}</p>
            <p className="text-muted-foreground">
              {[profile.phone, profile.location].filter(Boolean).join(" · ") ||
                "No phone / location on file"}
            </p>
            {profile.summary ? (
              <p className="mt-3 leading-relaxed text-foreground/90">
                {profile.summary}
              </p>
            ) : null}
            {profile.links.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {profile.links.map((link) => (
                  <li key={`${link.label}-${link.url}`}>
                    <span className="font-medium text-foreground/80">
                      {link.label}:
                    </span>{" "}
                    {link.url}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </SnapshotSection>

        <SnapshotSection
          title="Contact"
          hint="Candidate contact details for resumes"
        >
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Phone
              </dt>
              <dd className="mt-1 font-medium">{profile.phone || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Email
              </dt>
              <dd className="mt-1 break-all font-medium">
                {profile.email || "—"}
              </dd>
            </div>
          </dl>
        </SnapshotSection>

        <SnapshotSection
          title="Linked Accounts"
          hint="External professional profile URLs"
        >
          <ul className="grid gap-2 sm:grid-cols-2">
            {LINKED_FIELDS.map(({ key, label }) => {
              const url = profile[key];
              const linked = typeof url === "string" && url.length > 0;
              return (
                <li
                  key={key}
                  className="flex items-start justify-between gap-3 rounded-md border border-border/60 bg-background/50 px-3 py-2 text-sm"
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
        </SnapshotSection>

        <SnapshotSection title="Skills" hint="Grouped by category">
          <div className="space-y-4">
            {skillGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">None listed</p>
            ) : (
              skillGroups.map((group, index) => (
                <div key={`${group.label}-${index}`}>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </p>
                  {group.items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None listed</p>
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
        </SnapshotSection>

        <SnapshotSection
          title="Work History"
          hint={`${profile.experiences.filter((exp) => isWorkExperienceCategory(exp.category)).length} role${profile.experiences.filter((exp) => isWorkExperienceCategory(exp.category)).length === 1 ? "" : "s"}`}
        >
          {profile.experiences.filter((exp) => isWorkExperienceCategory(exp.category)).length === 0 ? (
            <p className="text-sm text-muted-foreground">No work history saved.</p>
          ) : (
            <ul className="space-y-4">
              {profile.experiences.filter((exp) => isWorkExperienceCategory(exp.category)).map((exp) => (
                <li
                  key={exp.id ?? `${exp.company}-${exp.role}-${exp.startDate}`}
                  className="rounded-md border border-border/60 bg-background/50 p-3"
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                    <p className="font-semibold">
                      {exp.role} · {exp.company}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {exp.category && exp.category !== "Work" ? `${exp.category} · ` : ""}
                      {exp.startDate} – {exp.endDate ?? "Present"}
                      {exp.location ? ` · ${exp.location}` : ""}
                    </p>
                  </div>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-foreground/90">
                    {exp.bullets.map((bullet) => (
                      <li key={bullet.id}>
                        {bullet.rawText}
                        {bullet.hasMetric ? (
                          <Badge variant="outline" className="ml-2 align-middle">
                            metric
                          </Badge>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </SnapshotSection>

        <SnapshotSection
          title="Activities & Leadership"
          hint={`${profile.experiences.filter((exp) => !isWorkExperienceCategory(exp.category)).length} role${profile.experiences.filter((exp) => !isWorkExperienceCategory(exp.category)).length === 1 ? "" : "s"}`}
        >
          {profile.experiences.filter((exp) => !isWorkExperienceCategory(exp.category)).length === 0 ? (
            <p className="text-sm text-muted-foreground">No activities or leadership saved.</p>
          ) : (
            <ul className="space-y-4">
              {profile.experiences.filter((exp) => !isWorkExperienceCategory(exp.category)).map((exp) => (
                <li
                  key={exp.id ?? `${exp.company}-${exp.role}-${exp.startDate}`}
                  className="rounded-md border border-border/60 bg-background/50 p-3"
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                    <p className="font-semibold">
                      {exp.role} · {exp.company}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {exp.category} · {exp.startDate} – {exp.endDate ?? "Present"}
                    </p>
                  </div>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
                    {exp.bullets.map((bullet) => (
                      <li key={bullet.id}>{bullet.rawText}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </SnapshotSection>

        <SnapshotSection
          title="Projects"
          hint={`${profile.projects.length} project${profile.projects.length === 1 ? "" : "s"}`}
        >
          {profile.projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects saved.</p>
          ) : (
            <ul className="space-y-3">
              {profile.projects.map((project) => (
                <li
                  key={project.id ?? project.name}
                  className="rounded-md border border-border/60 bg-background/50 p-3 text-sm"
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
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/90">
                      {project.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  ) : null}
                  {project.link ? (
                    <p className="mt-2 truncate text-xs text-muted-foreground">
                      {project.link}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </SnapshotSection>

        <SnapshotSection
          title="Education"
          hint={`${profile.education.length} entr${profile.education.length === 1 ? "y" : "ies"}`}
        >
          {profile.education.length === 0 ? (
            <p className="text-sm text-muted-foreground">No education saved.</p>
          ) : (
            <ul className="space-y-3">
              {profile.education.map((ed) => (
                <li
                  key={ed.id ?? `${ed.institution}-${ed.degree}`}
                  className="rounded-md border border-border/60 bg-background/50 p-3 text-sm"
                >
                  {formatEducationTitle(ed.degree, ed.fieldOfStudy) ? (
                    <p className="font-semibold">
                      {formatEducationTitle(ed.degree, ed.fieldOfStudy)}
                    </p>
                  ) : null}
                  <p className="text-muted-foreground">
                    {formatSchoolName(ed.institution, ed.subSchool)}
                    {ed.graduationDate ? ` · ${ed.graduationDate}` : ""}
                  </p>
                  {ed.coursework.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {ed.coursework.map((course) => (
                        <Badge key={course} variant="outline">
                          {course}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </SnapshotSection>

        <SnapshotSection
          title="Certifications & Licenses"
          hint={`${profile.certifications.length} item${profile.certifications.length === 1 ? "" : "s"}`}
        >
          {profile.certifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">None listed.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {profile.certifications.map((item) => (
                <li key={item.name}>
                  <span className="font-medium">{item.name}</span>
                  {item.issuer ? ` — ${item.issuer}` : ""}
                  {item.date ? ` (${item.date})` : ""}
                </li>
              ))}
            </ul>
          )}
        </SnapshotSection>

        <SnapshotSection
          title="Honors & Awards"
          hint={`${profile.awards.length} item${profile.awards.length === 1 ? "" : "s"}`}
        >
          {profile.awards.length === 0 ? (
            <p className="text-sm text-muted-foreground">None listed.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {profile.awards.map((item) => (
                <li key={item.title}>
                  <span className="font-medium">{item.title}</span>
                  {item.issuer ? ` — ${item.issuer}` : ""}
                  {item.date ? ` (${item.date})` : ""}
                  {item.description ? `. ${item.description}` : ""}
                </li>
              ))}
            </ul>
          )}
        </SnapshotSection>

        <SnapshotSection
          title="Interests"
          hint={`${profile.interests.length} item${profile.interests.length === 1 ? "" : "s"}`}
        >
          {profile.interests.length === 0 ? (
            <p className="text-sm text-muted-foreground">None listed.</p>
          ) : (
            <p className="text-sm">{profile.interests.join(", ")}</p>
          )}
        </SnapshotSection>
      </CardContent>
    </Card>
  );
}

function SnapshotSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-lg border border-border/70 bg-background/40 shadow-none">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            {title}
          </h3>
          {hint ? (
            <p className="text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        <span
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-muted/50 text-muted-foreground"
          title={`${title} (edit via Manually Edit Profile)`}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </span>
      </summary>
      <div className="border-t border-border/60 px-4 py-4">{children}</div>
    </details>
  );
}
