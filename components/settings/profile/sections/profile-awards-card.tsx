import React from "react";
import { Award, Heart, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LogoFrameIcon } from "@/components/ui/logo-frame";
import {
  DateChip,
  SettingsEntryCard,
  SettingsFeatureCard,
  SlidableBadgeRow,
} from "@/components/ui/tactile";
import type { AwardItem, CertificationItem } from "@/lib/validations/profile";
import { SectionCountPill } from "./profile-common";

export function ProfileCertificationsCard({
  certifications,
  isExpanded,
  onToggle,
  openItems,
  toggleItem,
}: {
  certifications: CertificationItem[];
  isExpanded: boolean;
  onToggle: () => void;
  openItems: Record<string, boolean>;
  toggleItem: (key: string) => void;
}) {
  return (
    <SettingsFeatureCard
      logo={<LogoFrameIcon icon={Award} />}
      title="Certifications & Licenses"
      subtitle="Professional certifications, active licenses, and credential authorities."
      statusBadge={
        certifications.length > 0 ? (
          <SectionCountPill count={certifications.length}>
            {certifications.length} {certifications.length === 1 ? "Certificate" : "Certificates"}
          </SectionCountPill>
        ) : null
      }
      isExpanded={isExpanded}
      onToggle={onToggle}
      curvedDivider
    >
      {certifications.length === 0 ? (
        <p className="text-sm text-muted-foreground">None listed.</p>
      ) : (
        <div className="space-y-2.5">
          {certifications.map((item, cIndex) => {
            const itemKey = `cert-${item.name}-${item.issuer ?? cIndex}`;
            const isItemExpanded = openItems[itemKey] ?? true;
            return (
              <SettingsEntryCard
                key={itemKey}
                index={cIndex + 1}
                title={item.name}
                subtitle={item.issuer || undefined}
                trailing={item.date ? <DateChip>{item.date}</DateChip> : null}
                isExpanded={isItemExpanded}
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
  );
}

export function ProfileAwardsCard({
  awards,
  isExpanded,
  onToggle,
  openItems,
  toggleItem,
}: {
  awards: AwardItem[];
  isExpanded: boolean;
  onToggle: () => void;
  openItems: Record<string, boolean>;
  toggleItem: (key: string) => void;
}) {
  return (
    <SettingsFeatureCard
      logo={<LogoFrameIcon icon={Trophy} />}
      title="Honors & Awards"
      subtitle="Distinctions, competitive scholarships, and industry recognitions."
      statusBadge={
        awards.length > 0 ? (
          <SectionCountPill count={awards.length}>
            {awards.length} {awards.length === 1 ? "Award" : "Awards"}
          </SectionCountPill>
        ) : null
      }
      isExpanded={isExpanded}
      onToggle={onToggle}
      curvedDivider
    >
      {awards.length === 0 ? (
        <p className="text-sm text-muted-foreground">None listed.</p>
      ) : (
        <div className="space-y-2.5">
          {awards.map((item, aIndex) => {
            const itemKey = `award-${item.title}-${item.issuer ?? aIndex}`;
            const isItemExpanded = openItems[itemKey] ?? true;
            return (
              <SettingsEntryCard
                key={itemKey}
                index={aIndex + 1}
                title={item.title}
                subtitle={item.issuer || undefined}
                trailing={item.date ? <DateChip>{item.date}</DateChip> : null}
                isExpanded={isItemExpanded}
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
  );
}

export function ProfileInterestsCard({
  interests,
  isExpanded,
  onToggle,
}: {
  interests: string[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <SettingsFeatureCard
      logo={<LogoFrameIcon icon={Heart} />}
      title="Interests & Activities"
      subtitle="Personal pursuits, creative hobbies, and community engagement."
      statusBadge={
        interests.length > 0 ? (
          <SectionCountPill count={interests.length}>
            {interests.length} {interests.length === 1 ? "Interest" : "Interests"}
          </SectionCountPill>
        ) : null
      }
      isExpanded={isExpanded}
      onToggle={onToggle}
      curvedDivider
    >
      {interests.length === 0 ? (
        <p className="text-sm text-muted-foreground">None listed.</p>
      ) : (
        <SlidableBadgeRow>
          {interests.map((interest) => (
            <Badge key={interest} variant="secondary" className="shrink-0 whitespace-nowrap">
              {interest}
            </Badge>
          ))}
        </SlidableBadgeRow>
      )}
    </SettingsFeatureCard>
  );
}
