"use client";

import { PanelTop } from "lucide-react";

import { AppearanceModeToggle } from "@/components/settings/ui/appearance-mode-toggle";
import { LogoFrameIcon } from "@/components/ui/logo-frame";
import { useToolbarTheme } from "@/components/ui/toolbar-theme";
import { SettingsFeatureCard } from "@/components/ui/tactile/nested-settings-card";

export function ToolbarPreferencesCard() {
  const { variant, setVariant, accountId } = useToolbarTheme();
  const saved = Boolean(accountId);

  return (
    <SettingsFeatureCard
      logo={<LogoFrameIcon icon={PanelTop} />}
      title="Filter Toolbar"
      subtitle="Noise filter / match filter, search, and filters on Job Radar and Subscriptions. The wavy slider stays the same in both looks."
      statusBadge={
        <AppearanceModeToggle
          value={variant}
          onChange={setVariant}
          disabled={!saved}
          label="Filter toolbar"
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
