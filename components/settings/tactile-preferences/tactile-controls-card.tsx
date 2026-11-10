"use client";

import { Palette } from "lucide-react";

import { SETTINGS_CARD_CLASSNAME } from "@/lib/navigation/settings-chrome";
import { MeterPreferencesCard } from "@/components/settings/tactile-preferences/meter-preferences-card";
import { RailActionPreferencesCard } from "@/components/settings/tactile-preferences/rail-action-preferences-card";
import { RailPreferencesCard } from "@/components/settings/tactile-preferences/rail-preferences-card";
import { TogglePreferencesCard } from "@/components/settings/tactile-preferences/toggle-preferences-card";
import { ToolbarPreferencesCard } from "@/components/settings/tactile-preferences/toolbar-preferences-card";
import { SettingsSectionCard } from "@/components/ui/tactile/nested-settings-card";
import type { ServerUiPreferences } from "@/lib/ui/ui-preferences-server";

export function TactileControlsCard({
  accountId,
  initialPreferences,
}: {
  accountId: string | null;
  initialPreferences?: ServerUiPreferences;
}) {
  return (
    <SettingsSectionCard
      className={SETTINGS_CARD_CLASSNAME}
      icon={
        <Palette
          className="size-8 -translate-y-0.5 scale-[0.88] origin-center text-primary shrink-0"
          aria-hidden="true"
        />
      }
      title="Tactile Controls & Themes"
      subtitle="Choose the look of the tabs, toolbar, buttons, meters, and switches."
      curvedDivider
    >
      <RailPreferencesCard />
      <ToolbarPreferencesCard />
      <MeterPreferencesCard
        accountId={accountId}
        initialVariant={initialPreferences?.wavyMeter}
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 [&>*]:h-full [&>*]:min-w-0">
        <RailActionPreferencesCard />
        <TogglePreferencesCard
          accountId={accountId}
          initialVariant={initialPreferences?.waveToggle}
        />
      </div>
    </SettingsSectionCard>
  );
}
