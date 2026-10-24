"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Award,
  Brain,
  Briefcase,
  Cpu,
  FolderGit2,
  GraduationCap,
  Heart,
  Link2,
  Mail,
  MapPin,
  Phone,
  SquareArrowOutUpRight,
  Trophy,
  UserRound,
  Users,
} from "lucide-react";
import {
  NestedCardLevel,
  SettingsEntryCard,
  EntryBulletList,
  SettingsFeatureCard,
  SettingsSectionCard,
  SettingsStatusPill,
  SlidableBadgeRow,
} from "@/components/ui/tactile";
import { ManualProfileEditor } from "@/components/profile/manual-profile-editor";
import { ProfileRevisionsMenu } from "@/components/profile/profile-revisions-menu";
import { SETTINGS_CARD_CLASSNAME } from "@/components/settings/settings-chrome";
import { Badge } from "@/components/ui/badge";
import { explainCandidatePersona } from "@/lib/ai/persona";
import type { MasterProfileInput } from "@/lib/validations/profile";
import { groupSkillSections, skillGroupsFromUnknown } from "@/lib/profile/skill-groups";
import {
  educationProgressLabel,
  formatEducationDates,
  formatEducationTitle,
  formatExperienceHeading,
  formatSchoolName,
  formatStatusPillTitle,
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

/** Single source of truth for chip sizing (tool count badge, date chips, carousel pills). */
const ENTRY_CHIP_CLASSNAME =
  "inline-flex shrink-0 items-center whitespace-nowrap rounded-md border border-border/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground";

function EntryChip({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        ENTRY_CHIP_CLASSNAME,
        className
      )}
      {...props}
    >
      {typeof children === "string" ? formatStatusPillTitle(children) : children}
    </span>
  );
}

const DateChip = EntryChip;

/** Show stored skill headings in Title Case. All-caps labels are recased; mixed case is kept. */
function skillHeading(label: string): string {
  const letters = label.replace(/[^A-Za-z]/g, "");
  if (letters.length > 0 && letters === letters.toUpperCase()) {
    return formatStatusPillTitle(label.toLowerCase());
  }
  return label;
}

const SKILL_HEADING_CLASSNAME =
  "text-xs font-semibold text-foreground/90 tracking-normal";

function ContactChannel({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background/80"
        aria-hidden="true"
      >
        <Icon className="size-4 text-muted-foreground" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className="truncate text-xs font-semibold text-foreground" title={value}>
          {value}
        </p>
      </div>
    </div>
  );
}

function LinkStatusPill({ linked }: { linked: boolean }) {
  if (linked) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        Linked
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      Missing
    </span>
  );
}

function FeatureLogo({
  icon: Icon,
}: {
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div
      className="relative flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-background/80 p-1 shadow-xs"
      aria-hidden="true"
    >
      <div className="flex size-full items-center justify-center rounded-[0.6rem] bg-muted/30">
        <Icon className="size-5 text-muted-foreground" />
      </div>
    </div>
  );
}

function SectionCountPill({
  level,
  count,
  hasItems,
  children,
  dotClassName,
  className,
}: {
  level?: NestedCardLevel;
  count?: number;
  hasItems?: boolean;
  children: React.ReactNode;
  dotClassName?: string;
  className?: string;
}) {
  if (count === 0 || hasItems === false) {
    return null;
  }

  return (
    <SettingsStatusPill
      level={level}
      count={count}
      hasItems={hasItems}
      dotClassName={dotClassName}
      className={className}
    >
      {children}
    </SettingsStatusPill>
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
 * Unified Master Profile card:
 * Level 1 SettingsSectionCard wrapping top identity window and Level 2 SettingsFeatureCard
 * sections matching Outbound canonical titles with 100% data fidelity.
 */
export function MasterProfileCard({
  accountId,
  profile,
}: MasterProfileCardProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    persona: false,
    contact: false,
    skills: false,
    experience: true,
    activities: false,
    projects: false,
    education: false,
    certifications: false,
    awards: false,
    interests: false,
  });

  const toggleSection = useCallback((key: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});

  const toggleItem = useCallback((key: string, defaultOpen = true) => {
    setOpenItems((prev) => ({
      ...prev,
      [key]: !(prev[key] ?? defaultOpen),
    }));
  }, []);

  const personaInfo = useMemo(() => {
    if (!profile) return null;
    const explained = explainCandidatePersona(profile);
    const tier = profile.seniorityTier?.trim() || explained.seniorityTier;
    const timeline = profile.timelineContext?.trim() || explained.timelineContext;
    const tone = profile.toneGuidance?.trim() || explained.toneGuidance;
    return { explained, tier, timeline, tone };
  }, [profile]);

  const linkedCount = useMemo(() => {
    if (!profile) return 0;
    return LINKED_FIELDS.filter(({ key }) => {
      const val = profile[key];
      return typeof val === "string" && val.trim().length > 0;
    }).length;
  }, [profile]);

  const skillGroups = useMemo(
    () => skillGroupsFromUnknown(profile?.skills),
    [profile?.skills]
  );
  const skillSections = useMemo(
    () => groupSkillSections(skillGroups),
    [skillGroups]
  );
  const totalSkillsCount = useMemo(
    () => skillGroups.reduce((acc, g) => acc + g.items.length, 0),
    [skillGroups]
  );
  const totalSkillGroupsCount = skillGroups.length;

  const workExperiences = useMemo(
    () => (profile?.experiences ?? []).filter((exp) => isWorkExperienceCategory(exp.category)),
    [profile?.experiences]
  );

  const activityExperiences = useMemo(
    () => (profile?.experiences ?? []).filter((exp) => !isWorkExperienceCategory(exp.category)),
    [profile?.experiences]
  );

  const totalWorkBullets = useMemo(
    () =>
      workExperiences.reduce(
        (acc, exp) =>
          acc +
          (exp.bullets ?? []).filter((b) => Boolean(b.rawText && b.rawText.trim()))
            .length,
        0
      ),
    [workExperiences]
  );

  const totalActivityBullets = useMemo(
    () =>
      activityExperiences.reduce(
        (acc, exp) =>
          acc +
          (exp.bullets ?? []).filter((b) => Boolean(b.rawText && b.rawText.trim()))
            .length,
        0
      ),
    [activityExperiences]
  );

  const totalProjectBullets = useMemo(
    () =>
      (profile?.projects ?? []).reduce((acc, p) => {
        const explicit = (p.bullets ?? []).filter((b) => Boolean(b && b.trim()));
        if (explicit.length > 0) {
          return acc + explicit.length;
        }
        return acc + (p.description?.trim() ? 1 : 0);
      }, 0),
    [profile?.projects]
  );

  return (
    <SettingsSectionCard
      className={SETTINGS_CARD_CLASSNAME}
      icon={
        <UserRound
          className="h-8 w-8 -translate-y-0.5 text-primary shrink-0"
          aria-hidden="true"
        />
      }
      title="Master Profile"
      subtitle="Universal resume profile, skills, and background history used for tailoring."
      toggle={
        accountId ? (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <ManualProfileEditor accountId={accountId} profile={profile} />
            {profile ? <ProfileRevisionsMenu accountId={accountId} /> : null}
          </div>
        ) : undefined
      }
      curvedDivider
    >
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
        <div className="space-y-4">
          {/* Top Identity Window (Preserved) */}
          <div className="flex flex-col gap-3 rounded-lg border border-border/50 bg-card/70 p-3.5 sm:flex-row sm:items-center sm:justify-between shadow-xs">
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-baseline gap-1.5">
                <p className="text-sm font-semibold text-foreground">{profile.fullName}</p>
                {profile.email ? (
                  <span className="text-xs text-muted-foreground">({profile.email})</span>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {[profile.phone, profile.location].filter(Boolean).join(" · ") ||
                  "No phone / location"}
              </p>
            </div>
            {profile.updatedAt ? (
              <span
                className="text-[11px] text-muted-foreground shrink-0"
                suppressHydrationWarning
              >
                Updated {formatUpdatedAtUtc(profile.updatedAt)}
              </span>
            ) : null}
          </div>

          {/* Level 2 Feature Cards for Profile Sections */}
          <div className="space-y-3">
            {/* 1. Persona & Career Synthesis */}
            {personaInfo && (
              <SettingsFeatureCard
                logo={<FeatureLogo icon={Brain} />}
                title="Persona & Career Synthesis"
                subtitle="Seniority tier, target title family, career trajectory, and tone positioning."
                statusBadge={
                  personaInfo?.tier ? (
                    <SectionCountPill
                      hasItems={true}
                      className="bg-primary/10 text-primary font-medium"
                    >
                      {personaInfo.tier}
                    </SectionCountPill>
                  ) : null
                }
                isExpanded={openSections.persona}
                onToggle={() => toggleSection("persona")}
                curvedDivider
              >
                <div className="space-y-3.5 text-sm">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Seniority
                    </p>
                    <p className="mt-1 font-medium text-foreground">{personaInfo.tier}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Title family
                    </p>
                    <p className="mt-1 text-foreground">{personaInfo.explained.titleFamily}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Timeline
                    </p>
                    <p className="mt-1 leading-relaxed text-foreground/90">{personaInfo.timeline}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Tone and positioning
                    </p>
                    <p className="mt-1 leading-relaxed text-foreground/90">{personaInfo.tone}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      How this was decided
                    </p>
                    <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed text-foreground/90">
                      {personaInfo.explained.rationale.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </SettingsFeatureCard>
            )}

            {/* 2. Contact & Linked Accounts */}
            <SettingsFeatureCard
              logo={<FeatureLogo icon={Link2} />}
              title="Contact & Linked Accounts"
              subtitle="Direct contact channels, professional summary, and external portfolio links."
              statusBadge={
                linkedCount > 0 ? (
                  <SectionCountPill count={linkedCount}>
                    {linkedCount} of {LINKED_FIELDS.length} Linked
                  </SectionCountPill>
                ) : null
              }
              isExpanded={openSections.contact}
              onToggle={() => toggleSection("contact")}
              curvedDivider
            >
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
                  <ContactChannel
                    icon={Phone}
                    label="Phone"
                    value={profile.phone || "—"}
                  />
                  <ContactChannel
                    icon={Mail}
                    label="Email"
                    value={profile.email || "—"}
                  />
                  <ContactChannel
                    icon={MapPin}
                    label="Location"
                    value={profile.location || "—"}
                  />
                </div>
                <div className="space-y-1 rounded-xl border border-border/60 bg-muted/20 p-3.5">
                  <p className="text-[11px] font-semibold text-muted-foreground">Summary</p>
                  {profile.summary?.trim() && profile.summary.trim() !== "—" ? (
                    <p className="text-xs leading-relaxed text-foreground/85">
                      {profile.summary}
                    </p>
                  ) : (
                    <p className="text-xs italic text-muted-foreground">
                      No professional summary added
                    </p>
                  )}
                </div>
                <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  {LINKED_FIELDS.map(({ key, label }) => {
                    const url = profile[key];
                    const linked = typeof url === "string" && url.length > 0;
                    return (
                      <li
                        key={key}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground">{label}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {linked ? url : "Not linked"}
                          </p>
                        </div>
                        <LinkStatusPill linked={linked} />
                      </li>
                    );
                  })}
                </ul>
              </div>
            </SettingsFeatureCard>

            {/* 3. Skills & Core Competencies */}
            <SettingsFeatureCard
              logo={<FeatureLogo icon={Cpu} />}
              title="Skills & Core Competencies"
              subtitle="Categorized skill taxonomy, domains, and granular proficiency levels."
              statusBadge={
                totalSkillsCount > 0 ? (
                  <SectionCountPill count={totalSkillsCount}>
                    <span>
                      {totalSkillGroupsCount}{" "}
                      {totalSkillGroupsCount === 1 ? "Group" : "Groups"}
                    </span>
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-px shrink-0 bg-border/90"
                    />
                    <span>
                      {totalSkillsCount}{" "}
                      {totalSkillsCount === 1 ? "Skill" : "Skills"}
                    </span>
                  </SectionCountPill>
                ) : null
              }
              isExpanded={openSections.skills}
              onToggle={() => toggleSection("skills")}
              curvedDivider
            >
              <div className="space-y-4">
                {skillGroups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None listed</p>
                ) : (
                  skillSections.map((section, sectionIndex) => (
                    <div
                      key={`${section.parentCategory ?? "root"}-${sectionIndex}`}
                      className="space-y-3"
                    >
                      {section.parentCategory ? (
                        <p className={SKILL_HEADING_CLASSNAME}>
                          {skillHeading(section.parentCategory)}
                        </p>
                      ) : null}
                      {section.groups.map((group, index) => (
                        <div key={`${section.parentCategory ?? ""}-${group.label}-${index}`}>
                          <p className={cn("mb-2", SKILL_HEADING_CLASSNAME)}>
                            {skillHeading(group.label)}
                          </p>
                          {group.items.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              None listed
                            </p>
                          ) : (
                            <SlidableBadgeRow>
                              {group.items.map((skill) => (
                                <Badge
                                  key={`${group.label}-${skill.name}`}
                                  variant="secondary"
                                  className="gap-1 font-normal shrink-0 whitespace-nowrap"
                                >
                                  <span className="font-medium text-foreground">{skill.name}</span>
                                  {skill.proficiency ? (
                                    <span className="text-muted-foreground">
                                      · {skill.proficiency}
                                    </span>
                                  ) : null}
                                </Badge>
                              ))}
                            </SlidableBadgeRow>
                          )}
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </SettingsFeatureCard>

            {/* 4. Work Experience & History (Expanded by default) */}
            <SettingsFeatureCard
              logo={<FeatureLogo icon={Briefcase} />}
              title="Work Experience & History"
              subtitle="Chronological employment roles with quantifiable achievement bullets."
              statusBadge={
                workExperiences.length > 0 ? (
                  <SectionCountPill count={workExperiences.length}>
                    <span>
                      {workExperiences.length}{" "}
                      {workExperiences.length === 1 ? "Role" : "Roles"}
                    </span>
                    {totalWorkBullets > 0 ? (
                      <>
                        <span
                          aria-hidden="true"
                          className="h-2.5 w-px shrink-0 bg-border/90"
                        />
                        <span>
                          {totalWorkBullets}{" "}
                          {totalWorkBullets === 1 ? "Bullet" : "Bullets"}
                        </span>
                      </>
                    ) : null}
                  </SectionCountPill>
                ) : null
              }
              isExpanded={openSections.experience}
              onToggle={() => toggleSection("experience")}
              curvedDivider
            >
              {workExperiences.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No work history saved.
                </p>
              ) : (
                <div className="space-y-3">
                  {workExperiences.map((exp, expIndex) => {
                    const itemKey = `work-${exp.id ?? `${exp.company}-${exp.role}`}`;
                    const isExpanded = openItems[itemKey] ?? true;
                    return (
                      <SettingsEntryCard
                        key={itemKey}
                        index={expIndex + 1}
                        title={exp.role}
                        subtitle={[exp.company, exp.location].filter(Boolean).join(" · ")}
                        trailing={
                          <DateChip>
                            {exp.startDate} – {exp.endDate ?? "Present"}
                          </DateChip>
                        }
                        isExpanded={isExpanded}
                        onToggle={() => toggleItem(itemKey)}
                        curvedDivider
                      >
                        <EntryBulletList
                          items={exp.bullets.map((b) => ({
                            key: b.id,
                            content: (
                              <>
                                {b.rawText}
                                {b.hasMetric ? (
                                  <Badge variant="outline" className="ml-2 rounded-md px-2 py-0.5 font-mono text-[10px]">
                                    metric
                                  </Badge>
                                ) : null}
                              </>
                            ),
                          }))}
                        />
                      </SettingsEntryCard>
                    );
                  })}
                </div>
              )}
            </SettingsFeatureCard>

            {/* 5. Activities & Leadership */}
            <SettingsFeatureCard
              logo={<FeatureLogo icon={Users} />}
              title="Activities & Leadership"
              subtitle="Campus leadership, extracurricular positions, volunteer initiatives, and community impact."
              statusBadge={
                activityExperiences.length > 0 ? (
                  <SectionCountPill count={activityExperiences.length}>
                    <span>
                      {activityExperiences.length}{" "}
                      {activityExperiences.length === 1 ? "Activity" : "Activities"}
                    </span>
                    {totalActivityBullets > 0 ? (
                      <>
                        <span
                          aria-hidden="true"
                          className="h-2.5 w-px shrink-0 bg-border/90"
                        />
                        <span>
                          {totalActivityBullets}{" "}
                          {totalActivityBullets === 1 ? "Bullet" : "Bullets"}
                        </span>
                      </>
                    ) : null}
                  </SectionCountPill>
                ) : null
              }
              isExpanded={openSections.activities}
              onToggle={() => toggleSection("activities")}
              curvedDivider
            >
              {activityExperiences.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No activities or leadership saved.
                </p>
              ) : (
                <div className="space-y-3">
                  {activityExperiences.map((exp, actIndex) => {
                    const itemKey = `activity-${exp.id ?? `${exp.company}-${exp.role}`}`;
                    const isExpanded = openItems[itemKey] ?? true;
                    return (
                      <SettingsEntryCard
                        key={itemKey}
                        index={actIndex + 1}
                        title={exp.role}
                        subtitle={[exp.company, exp.location].filter(Boolean).join(" · ")}
                        trailing={
                          <DateChip>
                            {exp.startDate} – {exp.endDate ?? "Present"}
                          </DateChip>
                        }
                        isExpanded={isExpanded}
                        onToggle={() => toggleItem(itemKey)}
                        curvedDivider
                      >
                        <EntryBulletList
                          items={exp.bullets.map((b) => ({ key: b.id, content: b.rawText }))}
                        />
                      </SettingsEntryCard>
                    );
                  })}
                </div>
              )}
            </SettingsFeatureCard>

            {/* 6. Projects & Practical Work */}
            <SettingsFeatureCard
              logo={<FeatureLogo icon={FolderGit2} />}
              title="Projects & Practical Work"
              subtitle="Key practical initiatives, technical deliverables, descriptions, and technology stacks."
              statusBadge={
                profile.projects.length > 0 ? (
                  <SectionCountPill count={profile.projects.length}>
                    <span>
                      {profile.projects.length}{" "}
                      {profile.projects.length === 1 ? "Project" : "Projects"}
                    </span>
                    {totalProjectBullets > 0 ? (
                      <>
                        <span
                          aria-hidden="true"
                          className="h-2.5 w-px shrink-0 bg-border/90"
                        />
                        <span>
                          {totalProjectBullets}{" "}
                          {totalProjectBullets === 1 ? "Bullet" : "Bullets"}
                        </span>
                      </>
                    ) : null}
                  </SectionCountPill>
                ) : null
              }
              isExpanded={openSections.projects}
              onToggle={() => toggleSection("projects")}
              curvedDivider
            >
              {profile.projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">No projects saved.</p>
              ) : (
                <div className="space-y-3">
                  {profile.projects.map((project, pIndex) => {
                    const itemKey = `project-${project.id ?? project.name ?? pIndex}`;
                    const isExpanded = openItems[itemKey] ?? true;
                    const hasTools = project.technologies.length > 0;
                    const toolLabel = hasTools
                      ? `${project.technologies.length} ${project.technologies.length === 1 ? "Tool" : "Tools"}`
                      : null;

                    return (
                      <SettingsEntryCard
                        key={itemKey}
                        index={pIndex + 1}
                        title={
                          <div className="inline-flex items-center gap-1.5 leading-none max-w-full">
                            <h4 className="text-sm font-semibold text-foreground truncate leading-none">
                              {project.name}
                            </h4>
                            {project.link ? (
                              <a
                                href={project.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(event) => event.stopPropagation()}
                                className="inline-flex items-center justify-center self-center text-muted-foreground/60 hover:text-foreground transition-colors shrink-0 p-0.5"
                                title="Open repository"
                              >
                                <SquareArrowOutUpRight className="size-3.5 shrink-0" />
                              </a>
                            ) : null}
                          </div>
                        }
                        subtitle={project.description || undefined}
                        trailing={
                          toolLabel ? (
                            <EntryChip>
                              {toolLabel}
                            </EntryChip>
                          ) : null
                        }
                        isExpanded={isExpanded}
                        onToggle={() => toggleItem(itemKey)}
                        curvedDivider
                      >
                        {project.technologies.length > 0 && (
                          <SlidableBadgeRow>
                            {project.technologies.map((tech) => (
                              <Badge key={tech} variant="outline" className={ENTRY_CHIP_CLASSNAME}>
                                {tech}
                              </Badge>
                            ))}
                          </SlidableBadgeRow>
                        )}
                        {project.bullets.length > 0 ? (
                          <EntryBulletList
                            items={project.bullets.map((bullet) => ({ key: bullet, content: bullet }))}
                          />
                        ) : null}
                        {project.technologies.length === 0 && project.bullets.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No additional details recorded.</p>
                        ) : null}
                      </SettingsEntryCard>
                    );
                  })}
                </div>
              )}
            </SettingsFeatureCard>

            {/* 7. Education & Academics */}
            <SettingsFeatureCard
              logo={<FeatureLogo icon={GraduationCap} />}
              title="Education & Academics"
              subtitle="Academic institutions, degrees, relevant coursework, and honors."
              statusBadge={
                profile.education.length > 0 ? (
                  <SectionCountPill count={profile.education.length}>
                    {profile.education.length} {profile.education.length === 1 ? "Credential" : "Credentials"}
                  </SectionCountPill>
                ) : null
              }
              isExpanded={openSections.education}
              onToggle={() => toggleSection("education")}
              curvedDivider
            >
              {profile.education.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No education saved.
                </p>
              ) : (
                <div className="space-y-3">
                  {profile.education.map((ed, edIndex) => {
                    const title = formatEducationTitle(ed.degree, ed.fieldOfStudy);
                    const school = formatSchoolName(ed.institution, ed.subSchool);
                    const dateRange = formatEducationDates(ed);
                    const progressLabel = educationProgressLabel(ed);
                    const itemKey = `edu-${ed.id ?? `${ed.institution}-${ed.degree}-${edIndex}`}`;
                    const isExpanded = openItems[itemKey] ?? true;
                    return (
                      <SettingsEntryCard
                        key={itemKey}
                        index={edIndex + 1}
                        title={school || "Academic Institution"}
                        subtitle={title || undefined}
                        trailing={
                          dateRange || progressLabel ? (
                            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                              {dateRange ? <DateChip>{dateRange}</DateChip> : null}
                              {progressLabel ? (
                                <EntryChip>
                                  {progressLabel}
                                </EntryChip>
                              ) : null}
                            </div>
                          ) : null
                        }
                        isExpanded={isExpanded}
                        onToggle={() => toggleItem(itemKey)}
                        curvedDivider
                      >
                        {ed.honors.length > 0 ? (
                          <p className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">Honors: </span>
                            {ed.honors.join(", ")}
                          </p>
                        ) : null}
                        {ed.coursework.length > 0 ? (
                          <div className="space-y-1.5">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Relevant Coursework
                            </p>
                            <SlidableBadgeRow>
                              {ed.coursework.map((course) => (
                                <Badge key={course} variant="outline" className={ENTRY_CHIP_CLASSNAME}>
                                  {course}
                                </Badge>
                              ))}
                            </SlidableBadgeRow>
                          </div>
                        ) : null}
                      </SettingsEntryCard>
                    );
                  })}
                </div>
              )}
            </SettingsFeatureCard>

            {/* 8. Certifications & Licenses */}
            <SettingsFeatureCard
              logo={<FeatureLogo icon={Award} />}
              title="Certifications & Licenses"
              subtitle="Professional certifications, active licenses, and credential authorities."
              statusBadge={
                profile.certifications.length > 0 ? (
                  <SectionCountPill count={profile.certifications.length}>
                    {profile.certifications.length} {profile.certifications.length === 1 ? "Certificate" : "Certificates"}
                  </SectionCountPill>
                ) : null
              }
              isExpanded={openSections.certifications}
              onToggle={() => toggleSection("certifications")}
              curvedDivider
            >
              {profile.certifications.length === 0 ? (
                <p className="text-sm text-muted-foreground">None listed.</p>
              ) : (
                <div className="space-y-2.5">
                  {profile.certifications.map((item, cIndex) => {
                    const itemKey = `cert-${item.name}-${item.issuer ?? cIndex}`;
                    const isExpanded = openItems[itemKey] ?? true;
                    return (
                      <SettingsEntryCard
                        key={itemKey}
                        index={cIndex + 1}
                        title={item.name}
                        subtitle={item.issuer || undefined}
                        trailing={item.date ? <DateChip>{item.date}</DateChip> : null}
                        isExpanded={isExpanded}
                        onToggle={() => toggleItem(itemKey)}
                        curvedDivider
                      >
                        {item.url ? (
                          <p className="truncate text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">Credential URL: </span>
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline ml-1"
                            >
                              {item.url}
                            </a>
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">No credential URL attached.</p>
                        )}
                      </SettingsEntryCard>
                    );
                  })}
                </div>
              )}
            </SettingsFeatureCard>

            {/* 9. Honors & Awards */}
            <SettingsFeatureCard
              logo={<FeatureLogo icon={Trophy} />}
              title="Honors & Awards"
              subtitle="Distinctions, competitive scholarships, and industry recognitions."
              statusBadge={
                profile.awards.length > 0 ? (
                  <SectionCountPill count={profile.awards.length}>
                    {profile.awards.length} {profile.awards.length === 1 ? "Award" : "Awards"}
                  </SectionCountPill>
                ) : null
              }
              isExpanded={openSections.awards}
              onToggle={() => toggleSection("awards")}
              curvedDivider
            >
              {profile.awards.length === 0 ? (
                <p className="text-sm text-muted-foreground">None listed.</p>
              ) : (
                <div className="space-y-2.5">
                  {profile.awards.map((item, aIndex) => {
                    const itemKey = `award-${item.title}-${item.issuer ?? aIndex}`;
                    const isExpanded = openItems[itemKey] ?? true;
                    return (
                      <SettingsEntryCard
                        key={itemKey}
                        index={aIndex + 1}
                        title={item.title}
                        subtitle={item.issuer || undefined}
                        trailing={item.date ? <DateChip>{item.date}</DateChip> : null}
                        isExpanded={isExpanded}
                        onToggle={() => toggleItem(itemKey)}
                        curvedDivider
                      >
                        {item.description ? (
                          <p className="text-xs text-foreground/90 leading-relaxed">
                            {item.description}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">No description provided.</p>
                        )}
                      </SettingsEntryCard>
                    );
                  })}
                </div>
              )}
            </SettingsFeatureCard>

            {/* 10. Interests & Activities */}
            <SettingsFeatureCard
              logo={<FeatureLogo icon={Heart} />}
              title="Interests & Activities"
              subtitle="Personal pursuits, creative hobbies, and community engagement."
              statusBadge={
                profile.interests.length > 0 ? (
                  <SectionCountPill count={profile.interests.length}>
                    {profile.interests.length} {profile.interests.length === 1 ? "Interest" : "Interests"}
                  </SectionCountPill>
                ) : null
              }
              isExpanded={openSections.interests}
              onToggle={() => toggleSection("interests")}
              curvedDivider
            >
              {profile.interests.length === 0 ? (
                <p className="text-sm text-muted-foreground">None listed.</p>
              ) : (
                <SlidableBadgeRow>
                  {profile.interests.map((interest) => (
                    <Badge key={interest} variant="secondary" className="shrink-0 whitespace-nowrap">
                      {interest}
                    </Badge>
                  ))}
                </SlidableBadgeRow>
              )}
            </SettingsFeatureCard>
          </div>
        </div>
      )}
    </SettingsSectionCard>
  );
}
