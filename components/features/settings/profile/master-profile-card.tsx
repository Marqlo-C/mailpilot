"use client";

import { useCallback, useMemo, useState } from "react";
import { UserRound } from "lucide-react";
import { SettingsSectionCard } from "@/components/ui/tactile";
import { ManualProfileEditor } from "./manual-profile-editor";
import { ProfileRevisionsMenu } from "@/components/features/profile/profile-revisions-menu";
import { SETTINGS_CARD_CLASSNAME } from "@/lib/utils/navigation/settings-chrome";
import { explainCandidatePersona } from "@/lib/persona";
import type { MasterProfileInput } from "@/lib/validations/profile.schema";
import { groupSkillSections, skillGroupsFromUnknown } from "@/lib/profile/skill-groups";
import { isWorkExperienceCategory } from "@/lib/validations/profile.schema";
import { LINKED_ACCOUNT_FIELDS } from "@/components/features/settings/profile/platform-mark";
import {
  ProfileActivitiesCard,
  ProfileAwardsCard,
  ProfileCertificationsCard,
  ProfileContactsCard,
  ProfileEducationCard,
  ProfileExperienceCard,
  ProfileInterestsCard,
  ProfilePersonaCard,
  ProfileProjectsCard,
  ProfileSkillsCard,
  ProfileUpdatedStamp,
} from "./sections";

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

  const [expandedVariants, setExpandedVariants] = useState<Record<string, boolean>>({});

  const toggleVariant = useCallback((key: string) => {
    setExpandedVariants((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const personaInfo = useMemo(() => {
    if (!profile) return null;
    const explained = explainCandidatePersona(profile);
    const tier = profile.seniorityTier?.trim() || explained.seniorityTier;
    return { tier };
  }, [profile]);

  const linkedCount = useMemo(() => {
    if (!profile) return 0;
    return LINKED_ACCOUNT_FIELDS.filter(({ key }) => {
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
            {profile ? (
              <ProfileRevisionsMenu
                accountId={accountId}
                revisionStamp={profile.updatedAt}
              />
            ) : null}
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
          {/* Top Identity Window */}
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
              <ProfileUpdatedStamp iso={profile.updatedAt} />
            ) : null}
          </div>

          {/* Level 2 Feature Cards for Profile Sections */}
          <div className="space-y-3">
            <ProfilePersonaCard
              accountId={accountId}
              profile={profile}
              isExpanded={openSections.persona}
              onToggle={() => toggleSection("persona")}
              personaInfo={personaInfo}
            />

            <ProfileContactsCard
              profile={profile}
              isExpanded={openSections.contact}
              onToggle={() => toggleSection("contact")}
              linkedCount={linkedCount}
            />

            <ProfileSkillsCard
              isExpanded={openSections.skills}
              onToggle={() => toggleSection("skills")}
              totalSkillsCount={totalSkillsCount}
              totalSkillGroupsCount={totalSkillGroupsCount}
              skillGroups={skillGroups}
              skillSections={skillSections}
            />

            <ProfileExperienceCard
              workExperiences={workExperiences}
              totalWorkBullets={totalWorkBullets}
              isExpanded={openSections.experience}
              onToggle={() => toggleSection("experience")}
              openItems={openItems}
              toggleItem={toggleItem}
              expandedVariants={expandedVariants}
              toggleVariant={toggleVariant}
            />

            <ProfileActivitiesCard
              activityExperiences={activityExperiences}
              totalActivityBullets={totalActivityBullets}
              isExpanded={openSections.activities}
              onToggle={() => toggleSection("activities")}
              openItems={openItems}
              toggleItem={toggleItem}
            />

            <ProfileProjectsCard
              projects={profile.projects}
              totalProjectBullets={totalProjectBullets}
              isExpanded={openSections.projects}
              onToggle={() => toggleSection("projects")}
              openItems={openItems}
              toggleItem={toggleItem}
              expandedVariants={expandedVariants}
              toggleVariant={toggleVariant}
            />

            <ProfileEducationCard
              education={profile.education}
              isExpanded={openSections.education}
              onToggle={() => toggleSection("education")}
              openItems={openItems}
              toggleItem={toggleItem}
            />

            <ProfileCertificationsCard
              certifications={profile.certifications}
              isExpanded={openSections.certifications}
              onToggle={() => toggleSection("certifications")}
              openItems={openItems}
              toggleItem={toggleItem}
            />

            <ProfileAwardsCard
              awards={profile.awards}
              isExpanded={openSections.awards}
              onToggle={() => toggleSection("awards")}
              openItems={openItems}
              toggleItem={toggleItem}
            />

            <ProfileInterestsCard
              interests={profile.interests}
              isExpanded={openSections.interests}
              onToggle={() => toggleSection("interests")}
            />
          </div>
        </div>
      )}
    </SettingsSectionCard>
  );
}
