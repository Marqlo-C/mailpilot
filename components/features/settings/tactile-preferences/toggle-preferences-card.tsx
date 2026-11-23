"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { ToggleRight } from "lucide-react";

import { AppearanceModeToggle } from "@/components/features/settings/tactile-preferences/appearance-mode-toggle";
import { LogoFrameIcon } from "@/components/ui/logo-frame";
import {
  NESTED_CARD_TYPOGRAPHY,
  SettingsFeatureCard,
} from "@/components/ui/tactile/nested-settings-card";
import { WaveToggle } from "@/components/ui/tactile/wave-toggle";
import {
  persistWaveTogglePreference,
  readWaveTogglePreference,
  WAVE_TOGGLE_CHANGE_EVENT,
  type WaveToggleVariant,
} from "@/lib/utils/ui/wave-toggle-preference";

export function TogglePreferencesCard({
  accountId,
  initialVariant,
}: {
  accountId: string | null;
  initialVariant?: WaveToggleVariant;
}) {
  const subscribe = useCallback((onStoreChange: () => void) => {
    window.addEventListener(WAVE_TOGGLE_CHANGE_EVENT, onStoreChange);
    window.addEventListener("storage", onStoreChange);
    return () => {
      window.removeEventListener(WAVE_TOGGLE_CHANGE_EVENT, onStoreChange);
      window.removeEventListener("storage", onStoreChange);
    };
  }, []);
  const variant = useSyncExternalStore(
    subscribe,
    () => readWaveTogglePreference(accountId),
    () => initialVariant ?? "dark"
  );
  const [previewChecked, setPreviewChecked] = useState(true);
  const saved = Boolean(accountId);

  function handleSelect(next: WaveToggleVariant) {
    persistWaveTogglePreference(accountId, next);
  }

  return (
    <SettingsFeatureCard
      logo={<LogoFrameIcon icon={ToggleRight} />}
      title="Toggle Switches"
      subtitle="Switches for on/off preferences everywhere."
      statusBadge={
        <AppearanceModeToggle
          value={variant}
          onChange={handleSelect}
          disabled={!saved}
          label="Toggle switches style"
        />
      }
      curvedDivider
    >
      <div className="flex items-center justify-between gap-3">
        <p className={NESTED_CARD_TYPOGRAPHY[3].subtitle}>
          Click the switch and watch it move.
        </p>
        <WaveToggle
          id="ui-toggle-preview"
          checked={previewChecked}
          onCheckedChange={setPreviewChecked}
          variant={variant}
          aria-label={previewChecked ? "On" : "Off"}
        />
      </div>
      {saved ? null : (
        <p className="text-xs text-muted-foreground">
          Connect an account to save this preference.
        </p>
      )}
    </SettingsFeatureCard>
  );
}
