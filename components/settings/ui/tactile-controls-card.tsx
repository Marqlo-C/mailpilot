"use client";

import { Palette } from "lucide-react";

import { SETTINGS_CARD_CLASSNAME } from "@/components/settings/settings-chrome";
import { MeterPreferencesCard } from "@/components/settings/ui/meter-preferences-card";
import { RailActionPreferencesCard } from "@/components/settings/ui/rail-action-preferences-card";
import { RailPreferencesCard } from "@/components/settings/ui/rail-preferences-card";
import { TogglePreferencesCard } from "@/components/settings/ui/toggle-preferences-card";
import { SettingsSectionCard } from "@/components/ui/tactile/nested-settings-card";

export function TactileControlsCard({
  accountId,
}: {
  accountId: string | null;
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
      subtitle="Choose the look of the tabs, buttons, meters, and switches."
      curvedDivider
    >
      <RailPreferencesCard />
      <MeterPreferencesCard accountId={accountId} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 [&>*]:h-full [&>*]:min-w-0">
        <RailActionPreferencesCard />
        <TogglePreferencesCard accountId={accountId} />
      </div>
    </SettingsSectionCard>
  );
}
