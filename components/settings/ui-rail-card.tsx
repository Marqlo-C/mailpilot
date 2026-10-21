"use client";

import { SlidersHorizontal } from "lucide-react";

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
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function UiRailCard() {
  const { variant, setVariant, accountId } = useTabRail();
  const { listClassName, triggerClassName } = useTabRailClasses();
  const saved = Boolean(accountId);

  return (
    <Card className={SETTINGS_CARD_CLASSNAME}>
      <CardHeader className="flex flex-row items-center gap-3 border-b border-border/50 p-3.5 space-y-0">
        <SlidersHorizontal
          className="h-8 w-8 -translate-y-0.5 scale-[0.88] origin-center text-primary shrink-0"
          aria-hidden="true"
        />
        <div className="space-y-0.5 min-w-0">
          <CardTitle>Tab rail</CardTitle>
          <CardDescription className="text-xs">
            Light rail or dark rail on Job Radar, Subscriptions, and Settings.
            Saved for this account on this device.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
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
