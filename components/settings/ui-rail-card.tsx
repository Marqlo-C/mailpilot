"use client";

import { SETTINGS_CARD_CLASSNAME } from "@/components/settings/settings-chrome";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  useTabRail,
  useTabRailClasses,
} from "@/components/ui/segmented-tabs";
import type { TabRailVariant } from "@/lib/ui/tab-rail-preference";

const OPTIONS: { value: TabRailVariant; label: string }[] = [
  { value: "light", label: "Light rail" },
  { value: "dark", label: "Dark rail" },
];

export function UiRailCard() {
  const { variant, setVariant, accountId } = useTabRail();
  const { listClassName, triggerClassName } = useTabRailClasses();
  const saved = Boolean(accountId);

  return (
    <Card className={SETTINGS_CARD_CLASSNAME}>
      <CardHeader>
        <CardTitle>Tab rail</CardTitle>
        <CardDescription>
          Light rail or dark rail on Job Radar, Subscriptions, and Settings.
          Saved for this account on this device.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
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
      </CardContent>
    </Card>
  );
}
