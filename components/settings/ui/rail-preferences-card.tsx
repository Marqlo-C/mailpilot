"use client";

import { SlidersHorizontal } from "lucide-react";

import { AppearanceModeToggle } from "@/components/settings/ui/appearance-mode-toggle";
import { SettingsFeatureLogo } from "@/components/settings/ui/feature-logo";
import { SettingsFeatureCard } from "@/components/ui/tactile/nested-settings-card";
import { useTabRail } from "@/components/ui/tactile/segmented-tabs";

export function RailPreferencesCard() {
  const { variant, setVariant, accountId } = useTabRail();
  const saved = Boolean(accountId);

  return (
    <SettingsFeatureCard
      logo={<SettingsFeatureLogo icon={SlidersHorizontal} />}
      title="Tab Rail"
      subtitle="Navigation bars at the top of Job Radar, Subscriptions, and Settings."
      statusBadge={
        <AppearanceModeToggle
          value={variant}
          onChange={setVariant}
          disabled={!saved}
          label="Tab rail"
        />
      }
      curvedDivider
    >
      {saved ? null : (
        <p className="text-sm text-muted-foreground">
          Connect an account to save this preference.
        </p>
      )}
    </SettingsFeatureCard>
  );
}
