"use client";

import { useEffect, useState } from "react";
import { ToggleRight } from "lucide-react";

import { SETTINGS_CARD_CLASSNAME } from "@/components/settings/settings-chrome";
import { SettingsSectionCard } from "@/components/ui/tactile/nested-settings-card";
import { useTabRailClasses } from "@/components/ui/tactile/segmented-tabs";
import { WaveToggle } from "@/components/ui/tactile/wave-toggle";
import {
  persistWaveTogglePreference,
  readWaveTogglePreference,
  WAVE_TOGGLE_CHANGE_EVENT,
  type WaveToggleVariant,
} from "@/lib/ui/wave-toggle-preference";

const OPTIONS: { value: WaveToggleVariant; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function TogglePreferencesCard({
  accountId,
}: {
  accountId: string | null;
}) {
  const [variant, setVariantState] = useState<WaveToggleVariant>("dark");
  const [previewChecked, setPreviewChecked] = useState(true);
  const { listClassName, triggerClassName } = useTabRailClasses();
  const saved = Boolean(accountId);

  useEffect(() => {
    setVariantState(readWaveTogglePreference(accountId));

    const sync = () => {
      setVariantState(readWaveTogglePreference(accountId));
    };

    window.addEventListener(WAVE_TOGGLE_CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(WAVE_TOGGLE_CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [accountId]);

  function handleSelect(next: WaveToggleVariant) {
    setVariantState(next);
    persistWaveTogglePreference(accountId, next);
  }

  return (
    <SettingsSectionCard
      className={SETTINGS_CARD_CLASSNAME}
      icon={
        <ToggleRight
          className="size-8 -translate-y-0.5 scale-[0.88] origin-center text-primary shrink-0"
          aria-hidden="true"
        />
      }
      title="Toggle Switches"
      subtitle="Light toggle or dark toggle for automation and settings switches. Saved for this account on this device."
      curvedDivider
    >
      <div className="space-y-4">
        <div
          className={listClassName}
          data-mp-tab-rail=""
          role="radiogroup"
          aria-label="Toggle switches style"
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
              onClick={() => handleSelect(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Live Interactive Preview */}
        <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3.5">
          <WaveToggle
            id="ui-toggle-preview"
            checked={previewChecked}
            onCheckedChange={setPreviewChecked}
            variant={variant}
            label={previewChecked ? "Active wave motion" : "Idle switch state"}
            description="Click to test fluid transition and wave animation in real time."
            aria-label="Live preview of selected toggle switch"
          />

          <p className="text-[11px] text-muted-foreground pt-1">
            {variant === "dark"
              ? "Dark toggle features the deep forest teal reservoir with bioluminescent mint waterline."
              : "Light toggle features the airy seafoam frosted reservoir with vibrant turquoise fluid."}
          </p>
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
