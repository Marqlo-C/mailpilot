import React from "react";
import { Brain, Link2, Mail, MapPin, Phone } from "lucide-react";
import { SettingsFeatureCard } from "@/components/ui/tactile";
import { LogoFrameIcon } from "@/components/ui/logo-frame";
import { PersonaViewer } from "@/components/features/profile/persona-viewer";
import {
  LINKED_ACCOUNT_FIELDS,
  LinkStatusPill,
  PlatformMark,
} from "@/components/features/settings/profile/platform-mark";
import type { ProfileSnapshotData } from "../master-profile-card";
import { ContactChannel, SectionCountPill } from "./profile-common";

export function ProfilePersonaCard({
  accountId,
  profile,
  isExpanded,
  onToggle,
  personaInfo,
}: {
  accountId: string | null;
  profile: ProfileSnapshotData;
  isExpanded: boolean;
  onToggle: () => void;
  personaInfo: { tier: string } | null;
}) {
  if (!personaInfo) return null;
  return (
    <SettingsFeatureCard
      logo={<LogoFrameIcon icon={Brain} />}
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
      isExpanded={isExpanded}
      onToggle={onToggle}
      curvedDivider
    >
      <PersonaViewer accountId={accountId} profile={profile} />
    </SettingsFeatureCard>
  );
}

export function ProfileContactsCard({
  profile,
  isExpanded,
  onToggle,
  linkedCount,
}: {
  profile: ProfileSnapshotData;
  isExpanded: boolean;
  onToggle: () => void;
  linkedCount: number;
}) {
  return (
    <SettingsFeatureCard
      logo={<LogoFrameIcon icon={Link2} />}
      title="Contact & Linked Accounts"
      subtitle="Direct contact channels, professional summary, and external portfolio links."
      statusBadge={
        <SectionCountPill count={LINKED_ACCOUNT_FIELDS.length}>
          <span>{LINKED_ACCOUNT_FIELDS.length} Sites</span>
          <span
            aria-hidden="true"
            className="h-2.5 w-px shrink-0 bg-border/90"
          />
          <span>{linkedCount} Linked</span>
        </SectionCountPill>
      }
      isExpanded={isExpanded}
      onToggle={onToggle}
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
          {LINKED_ACCOUNT_FIELDS.map(({ key, label, iconSrc, iconSize }) => {
            const url = profile[key];
            const linked = typeof url === "string" && url.length > 0;
            return (
              <li
                key={key}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <PlatformMark name={label} src={iconSrc} iconSize={iconSize} />
                  <div className="min-w-0 flex-1">
                    <h5 className="truncate text-xs font-semibold text-foreground">
                      {label}
                    </h5>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {linked ? url : "Not linked"}
                    </p>
                  </div>
                </div>
                <LinkStatusPill linked={linked} />
              </li>
            );
          })}
        </ul>
      </div>
    </SettingsFeatureCard>
  );
}
