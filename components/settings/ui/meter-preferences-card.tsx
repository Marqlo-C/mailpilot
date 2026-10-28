"use client";

import { useEffect, useState } from "react";
import { Waves } from "lucide-react";

import { AppearanceModeToggle } from "@/components/settings/ui/appearance-mode-toggle";
import { SettingsFeatureLogo } from "@/components/settings/ui/feature-logo";
import { SettingsFeatureCard } from "@/components/ui/tactile/nested-settings-card";
import { WavyMeter } from "@/components/ui/tactile/wavy-meter";
import {
  persistWavyMeterPreference,
  readWavyMeterPreference,
  WAVY_METER_CHANGE_EVENT,
  type WavyMeterVariant,
} from "@/lib/ui/wavy-meter-preference";

export function MeterPreferencesCard({
  accountId,
}: {
  accountId: string | null;
}) {
  const [variant, setVariantState] = useState<WavyMeterVariant>("light");
  const saved = Boolean(accountId);

  useEffect(() => {
    setVariantState(readWavyMeterPreference(accountId));

    const sync = () => {
      setVariantState(readWavyMeterPreference(accountId));
    };

    window.addEventListener(WAVY_METER_CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(WAVY_METER_CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [accountId]);

  function handleSelect(next: WavyMeterVariant) {
    setVariantState(next);
    persistWavyMeterPreference(accountId, next);
  }

  return (
    <SettingsFeatureCard
      logo={<SettingsFeatureLogo icon={Waves} />}
      title="Usage Meters"
      subtitle="Credit and usage meters for your connected APIs."
      statusBadge={
        <AppearanceModeToggle
          value={variant}
          onChange={handleSelect}
          disabled={!saved}
          label="Usage meters style"
        />
      }
      curvedDivider
    >
      <div className="space-y-4">
        {/* Live Interactive Preview */}
        <div className="space-y-2 rounded-xl border border-border/80 bg-muted/20 p-3.5">
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-foreground">
              <span className="font-semibold text-sm">6,800</span>{" "}
              <span className="text-muted-foreground font-normal">
                / 10,000 credits used (Live Preview)
              </span>
            </span>
            <span className="font-mono text-xs font-semibold text-foreground">
              68%
            </span>
          </div>

          <WavyMeter
            value={68}
            variant={variant}
            aria-label="Live preview of selected usage meter"
          />

          <p className="text-[11px] text-muted-foreground">
            {variant === "dark"
              ? "Dark meter features the deep forest teal reservoir with bioluminescent mint waterline."
              : "Light meter features the airy seafoam frosted reservoir with vibrant turquoise fluid."}
          </p>
        </div>

        {saved ? null : (
          <p className="text-sm text-muted-foreground">
            Connect an account to save this preference.
          </p>
        )}
      </div>
    </SettingsFeatureCard>
  );
}
