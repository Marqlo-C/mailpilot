"use client";

import { useEffect, useState } from "react";
import { Waves } from "lucide-react";

import { SETTINGS_CARD_CLASSNAME } from "@/components/settings/settings-chrome";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTabRailClasses } from "@/components/ui/segmented-tabs";
import {
  WavyMeter,
  WavyMeterDark,
  WavyMeterLight,
} from "@/components/ui/wavy-meter";
import {
  persistWavyMeterPreference,
  readWavyMeterPreference,
  WAVY_METER_CHANGE_EVENT,
  type WavyMeterVariant,
} from "@/lib/ui/wavy-meter-preference";

const OPTIONS: { value: WavyMeterVariant; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function UiMeterCard({ accountId }: { accountId: string | null }) {
  const [variant, setVariantState] = useState<WavyMeterVariant>("light");
  const { listClassName, triggerClassName } = useTabRailClasses();
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
    <Card className={SETTINGS_CARD_CLASSNAME}>
      <CardHeader className="flex flex-row items-center gap-3 border-b border-border/50 p-3.5 space-y-0">
        <Waves
          className="h-8 w-8 -translate-y-0.5 scale-[0.88] origin-center text-primary shrink-0"
          aria-hidden="true"
        />
        <div className="space-y-0.5 min-w-0">
          <CardTitle>Usage meters</CardTitle>
          <CardDescription className="text-xs">
            Light meter or dark meter for proxy gauges, quotas, and credit
            meters. Saved for this account on this device.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div
          className={listClassName}
          role="radiogroup"
          aria-label="Usage meters style"
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
      </CardContent>
    </Card>
  );
}
