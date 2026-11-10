import React from "react";
import { GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LogoFrameIcon } from "@/components/ui/logo-frame";
import {
  DateChip,
  ENTRY_CHIP_CLASSNAME,
  EntryChip,
  SettingsEntryCard,
  SettingsFeatureCard,
  SlidableBadgeRow,
} from "@/components/ui/tactile";
import {
  educationProgressLabel,
  formatEducationDates,
  formatEducationTitle,
  formatSchoolName,
} from "@/lib/utils/format";
import type { EducationInput } from "@/lib/validations/profile";
import { SectionCountPill } from "./profile-common";

export function ProfileEducationCard({
  education,
  isExpanded,
  onToggle,
  openItems,
  toggleItem,
}: {
  education: EducationInput[];
  isExpanded: boolean;
  onToggle: () => void;
  openItems: Record<string, boolean>;
  toggleItem: (key: string) => void;
}) {
  return (
    <SettingsFeatureCard
      logo={<LogoFrameIcon icon={GraduationCap} />}
      title="Education & Academics"
      subtitle="Academic institutions, degrees, relevant coursework, and honors."
      statusBadge={
        education.length > 0 ? (
          <SectionCountPill count={education.length}>
            {education.length} {education.length === 1 ? "Credential" : "Credentials"}
          </SectionCountPill>
        ) : null
      }
      isExpanded={isExpanded}
      onToggle={onToggle}
      curvedDivider
    >
      {education.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No education saved.
        </p>
      ) : (
        <div className="space-y-3">
          {education.map((ed, edIndex) => {
            const title = formatEducationTitle(ed.degree, ed.fieldOfStudy);
            const school = formatSchoolName(ed.institution, ed.subSchool);
            const dateRange = formatEducationDates(ed);
            const progressLabel = educationProgressLabel(ed);
            const itemKey = `edu-${ed.id ?? `${ed.institution}-${ed.degree}-${edIndex}`}`;
            const isItemExpanded = openItems[itemKey] ?? true;
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
                isExpanded={isItemExpanded}
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
  );
}
