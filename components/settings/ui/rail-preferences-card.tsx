"use client";

import { SlidersHorizontal } from "lucide-react";

import { SETTINGS_CARD_CLASSNAME } from "@/components/settings/settings-chrome";
import { SettingsSectionCard } from "@/components/ui/tactile/nested-settings-card";
import {
  useTabRail,
  useTabRailClasses,
} from "@/components/ui/tactile/segmented-tabs";
import type { TabRailVariant } from "@/lib/ui/tab-rail-preference";

const OPTIONS: { value: TabRailVariant; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function RailPreferencesCard() {
  const { variant, setVariant, accountId } = useTabRail();
  const { listClassName, triggerClassName } = useTabRailClasses();
  const saved = Boolean(accountId);

  return (
    <SettingsSectionCard
      className={SETTINGS_CARD_CLASSNAME}
      icon={
        <SlidersHorizontal
          className="size-8 -translate-y-0.5 scale-[0.88] origin-center text-primary shrink-0"
          aria-hidden="true"
        />
      }
      title="Tab Rail"
      subtitle="Light rail or dark rail on Job Radar, Subscriptions, and Settings. Saved for this account on this device."
      curvedDivider
    >
      <div className="space-y-3">
        <div
          className={listClassName}
          role="radiogroup"
          aria-label="Tab rail"
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
        {saved ? null : (
          <p className="text-sm text-muted-foreground">
            Connect an account to save this preference.
          </p>
        )}
      </div>
    </SettingsSectionCard>
  );
}
