"use client";

import { MousePointerClick } from "lucide-react";

import { AppearanceModeToggle } from "@/components/settings/tactile-preferences/appearance-mode-toggle";
import { LogoFrameIcon } from "@/components/ui/logo-frame";
import { SyncInboxSample } from "@/components/settings/tactile-preferences/sync-inbox-sample";
import { useRailAction } from "@/components/ui/rail-action";
import {
  NESTED_CARD_TYPOGRAPHY,
  SettingsFeatureCard,
} from "@/components/ui/tactile/nested-settings-card";

export function RailActionPreferencesCard() {
  const { variant, setVariant, accountId } = useRailAction();
  const saved = Boolean(accountId);

  return (
    <SettingsFeatureCard
      logo={<LogoFrameIcon icon={MousePointerClick} />}
      title="Action Buttons"
      subtitle="Top level actions — others keep their pizzazz."
      statusBadge={
        <AppearanceModeToggle
          value={variant}
          onChange={setVariant}
          disabled={!saved}
          label="Action buttons"
        />
      }
      curvedDivider
    >
      <div className="flex items-center justify-between gap-3">
        <p className={NESTED_CARD_TYPOGRAPHY[3].subtitle}>
          Hover the button for a quick preview.
        </p>
        <SyncInboxSample />
      </div>
      {saved ? null : (
        <p className="text-xs text-muted-foreground">
          Connect an account to save this preference.
        </p>
      )}
    </SettingsFeatureCard>
  );
}
