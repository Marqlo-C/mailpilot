"use client";

import { MousePointerClick } from "lucide-react";

import { SyncControls } from "@/components/opportunities/sync-controls";
import { SETTINGS_CARD_CLASSNAME } from "@/components/settings/settings-chrome";
import { useRailAction } from "@/components/ui/rail-action";
import { SettingsSectionCard } from "@/components/ui/tactile/nested-settings-card";
import { useTabRailClasses } from "@/components/ui/tactile/segmented-tabs";
import type { RailActionVariant } from "@/lib/ui/rail-action-preference";

const OPTIONS: { value: RailActionVariant; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function RailActionPreferencesCard() {
  const { variant, setVariant, accountId } = useRailAction();
  const { listClassName, triggerClassName } = useTabRailClasses();
  const saved = Boolean(accountId);

  return (
    <SettingsSectionCard
      className={SETTINGS_CARD_CLASSNAME}
      icon={
        <MousePointerClick
          className="size-8 -translate-y-0.5 scale-[0.88] origin-center text-primary shrink-0"
          aria-hidden="true"
        />
      }
      title="Action Buttons"
      subtitle="Light or dark plate for the white buttons on the tab rail row, such as Sync Inbox. Colored actions stay as they are. Saved for this account on this device."
      curvedDivider
    >
      <div className="space-y-4">
        <div
          className={listClassName}
          data-mp-tab-rail=""
          role="radiogroup"
          aria-label="Action buttons"
        >
          {OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={variant === option.value}
              data-state={variant === option.value ? "active" : "inactive"}
              className={triggerClassName}
              disabled={!saved}
              onClick={() => setVariant(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="pt-4">
          <SyncControls accountId={accountId} preview />
        </div>
        {saved ? null : (
          <p className="text-sm text-muted-foreground">
            Connect an account to save this preference.
          </p>
        )}
      </div>
    </SettingsSectionCard>
  );
}
