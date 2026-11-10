import React from "react";
import { Briefcase, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LogoFrameIcon } from "@/components/ui/logo-frame";
import {
  DateChip,
  EntryBulletList,
  SettingsEntryCard,
  SettingsFeatureCard,
} from "@/components/ui/tactile";
import type { WorkExperienceInput } from "@/lib/validations/profile.schema";
import { FormattedBulletText, SectionCountPill } from "./profile-common";

export function ProfileExperienceCard({
  workExperiences,
  totalWorkBullets,
  isExpanded,
  onToggle,
  openItems,
  toggleItem,
  expandedVariants,
  toggleVariant,
}: {
  workExperiences: WorkExperienceInput[];
  totalWorkBullets: number;
  isExpanded: boolean;
  onToggle: () => void;
  openItems: Record<string, boolean>;
  toggleItem: (key: string) => void;
  expandedVariants: Record<string, boolean>;
  toggleVariant: (key: string) => void;
}) {
  return (
    <SettingsFeatureCard
      logo={<LogoFrameIcon icon={Briefcase} />}
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
      isExpanded={isExpanded}
      onToggle={onToggle}
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
            const itemExpanded = openItems[itemKey] ?? true;
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
                isExpanded={itemExpanded}
                onToggle={() => toggleItem(itemKey)}
                curvedDivider
              >
                <EntryBulletList
                  items={exp.bullets.map((b, bIdx) => {
                    const bulletVariants = b.variants || [];
                    const variantKey = `${itemKey}-bullet-${b.id || bIdx}-variants`;
                    const isVariantExpanded = expandedVariants[variantKey] ?? false;

                    return {
                      key: b.id,
                      content: (
                        <div className="space-y-1 w-full">
                          <div className="text-xs leading-relaxed text-foreground/90">
                            <FormattedBulletText
                              text={b.rawText}
                              hasMetric={b.hasMetric}
                              variantsCount={bulletVariants.length}
                              onToggleVariants={() => toggleVariant(variantKey)}
                            />
                          </div>
                          {bulletVariants.length > 0 && isVariantExpanded ? (
                            <div className="mt-1.5 ml-1 border-l-2 border-border/60 pl-2.5 py-1 space-y-1.5 animate-in fade-in-50 duration-150">
                              {bulletVariants.map((v, vIdx) => (
                                <div
                                  key={`exp-v-${vIdx}`}
                                  className="rounded bg-muted/30 p-2 text-[11px] leading-relaxed text-muted-foreground border border-border/40"
                                >
                                  <div className="flex items-center gap-1.5 mb-1 text-[10px] font-medium text-foreground/80">
                                    <Badge variant="outline" className="text-[9px] px-1 py-0">
                                      {v.origin === "HUMAN_VERIFIED"
                                        ? "Prior Revision"
                                        : "Variant"}
                                    </Badge>
                                  </div>
                                  <p>{v.text}</p>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ),
                    };
                  })}
                />
              </SettingsEntryCard>
            );
          })}
        </div>
      )}
    </SettingsFeatureCard>
  );
}

export function ProfileActivitiesCard({
  activityExperiences,
  totalActivityBullets,
  isExpanded,
  onToggle,
  openItems,
  toggleItem,
}: {
  activityExperiences: WorkExperienceInput[];
  totalActivityBullets: number;
  isExpanded: boolean;
  onToggle: () => void;
  openItems: Record<string, boolean>;
  toggleItem: (key: string) => void;
}) {
  return (
    <SettingsFeatureCard
      logo={<LogoFrameIcon icon={Users} />}
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
      isExpanded={isExpanded}
      onToggle={onToggle}
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
            const isItemExpanded = openItems[itemKey] ?? true;
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
                isExpanded={isItemExpanded}
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
  );
}
