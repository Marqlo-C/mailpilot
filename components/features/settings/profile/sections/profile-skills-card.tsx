import React from "react";
import { Cpu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LogoFrameIcon } from "@/components/ui/logo-frame";
import { SettingsFeatureCard, SlidableBadgeRow } from "@/components/ui/tactile";
import { cn } from "@/lib/utils";
import { groupSkillSections, type SkillGroup } from "@/lib/profile/skill-groups";

type SkillSection = ReturnType<typeof groupSkillSections>[number];
import {
  SectionCountPill,
  SKILL_HEADING_CLASSNAME,
  skillHeading,
} from "./profile-common";

export function ProfileSkillsCard({
  isExpanded,
  onToggle,
  totalSkillsCount,
  totalSkillGroupsCount,
  skillGroups,
  skillSections,
}: {
  isExpanded: boolean;
  onToggle: () => void;
  totalSkillsCount: number;
  totalSkillGroupsCount: number;
  skillGroups: SkillGroup[];
  skillSections: SkillSection[];
}) {
  return (
    <SettingsFeatureCard
      logo={<LogoFrameIcon icon={Cpu} />}
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
      isExpanded={isExpanded}
      onToggle={onToggle}
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
  );
}
