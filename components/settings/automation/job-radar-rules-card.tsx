"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Radar } from "lucide-react";
import { toast } from "sonner";

import { updateMatchThreshold } from "@/app/actions/profile";
import { updateRule } from "@/app/actions/settings";
import { SETTINGS_CARD_CLASSNAME } from "@/components/settings/settings-chrome";
import { SettingsSectionCard } from "@/components/ui/tactile/nested-settings-card";
import { WaveToggle } from "@/components/ui/tactile/wave-toggle";
import { WavySlider } from "@/components/ui/tactile/wavy-slider";
import { DEFAULT_MATCH_THRESHOLD } from "@/lib/validations/profile";
import type { AccountRules } from "@/lib/validations/rules";

type JobRadarRulesCardProps = {
  accountId: string | null;
  rules: AccountRules;
  matchThreshold?: number | null;
};

export function JobRadarRulesCard({
  accountId,
  rules,
  matchThreshold,
}: JobRadarRulesCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const initialThreshold = matchThreshold ?? DEFAULT_MATCH_THRESHOLD;
  const [threshold, setThreshold] = useState(initialThreshold);
  const disabled = !accountId || pending;
  const autoSend = rules.applicationMode === "AUTO_SEND";

  useEffect(() => {
    setThreshold(matchThreshold ?? DEFAULT_MATCH_THRESHOLD);
  }, [matchThreshold]);

  function patch(key: keyof AccountRules, value: string | number) {
    if (!accountId) return;
    startTransition(async () => {
      const result = await updateRule(accountId, key, value);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  function commitThreshold(value: number) {
    if (!accountId) return;
    const next = Math.min(100, Math.max(0, Math.round(value)));
    setThreshold(next);
    startTransition(async () => {
      const result = await updateMatchThreshold(accountId, next);
      if (!result.ok) {
        toast.error(result.error);
        setThreshold(matchThreshold ?? DEFAULT_MATCH_THRESHOLD);
        return;
      }
      toast.success(`Match threshold set to ${next}%`);
      router.refresh();
    });
  }

  return (
    <SettingsSectionCard
      className={SETTINGS_CARD_CLASSNAME}
      icon={
        <Radar
          className="size-8 -translate-y-0.5 scale-[1.15] origin-center text-primary shrink-0"
          aria-hidden="true"
        />
      }
      title="Job Radar Dispatch Rules"
      subtitle="Control auto-send dispatch mode, candidate match thresholds, and daily rate limits."
      toggle={
        <WaveToggle
          id="applicationMode"
          checked={autoSend}
          disabled={disabled}
          onCheckedChange={(checked) => {
            patch("applicationMode", checked ? "AUTO_SEND" : "MANUAL_REVIEW");
            toast.success(
              checked
                ? "Auto-send enabled for matching leads"
                : "Manual review required for leads"
            );
          }}
        />
      }
      curvedDivider
    >
      <div className="space-y-4">
        {!accountId && (
          <p className="text-sm text-muted-foreground">
            Connect an account to configure application automation.
          </p>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">
              Minimum Match Threshold
            </span>
            <span className="font-mono text-xs font-medium text-primary">
              {threshold}%
            </span>
          </div>
          <WavySlider
            min={0}
            max={100}
            step={1}
            disabled={disabled}
            value={threshold}
            onChange={(val) => setThreshold(val)}
            onCommit={(val) => commitThreshold(val)}
            widthClassName="w-full"
            aria-label="Match threshold"
          />
          <p className="text-[11px] text-muted-foreground">
            Leads scoring below this threshold are soft-hidden on Job Radar (0% shows all).
          </p>
        </div>

        <div className="space-y-1.5 pt-1">
          <label
            htmlFor="max-sends"
            className="text-xs font-semibold text-foreground block"
          >
            Max Daily Auto-Sends
          </label>
          <input
            id="max-sends"
            type="number"
            min={1}
            max={20}
            disabled={disabled}
            defaultValue={rules.maxAutoSendsPerDay}
            onBlur={(e) => {
              const n = Number(e.target.value);
              if (!Number.isFinite(n)) return;
              patch("maxAutoSendsPerDay", Math.min(20, Math.max(1, n)));
            }}
            className="h-8 w-24 rounded-lg border border-border/60 bg-card px-2.5 font-mono text-xs font-medium text-foreground outline-none focus:border-border focus:ring-1 focus:ring-ring"
          />
          <p className="text-[11px] text-muted-foreground">
            Hard safety cap to prevent accidental high-volume mailings (1–20 sends/day).
          </p>
        </div>
      </div>
    </SettingsSectionCard>
  );
}
