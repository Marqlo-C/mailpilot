"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateMatchThreshold } from "@/app/actions/profile";
import { updateRule } from "@/app/actions/settings";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { WavySlider } from "@/components/ui/wavy-slider";
import { DEFAULT_MATCH_THRESHOLD } from "@/lib/validations/profile";
import type { AccountRules } from "@/lib/validations/rules";

type ApplicationAutomationCardProps = {
  accountId: string | null;
  rules: AccountRules;
  /** Canonical: PermanentSettings / UserProfile via getActiveAccount.matchThreshold */
  matchThreshold?: number | null;
};

export function ApplicationAutomationCard({
  accountId,
  rules,
  matchThreshold,
}: ApplicationAutomationCardProps) {
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
      await updateRule(accountId, key, value);
      router.refresh();
    });
  }

  function commitThreshold(value: number) {
    if (!accountId) return;
    const next = Math.min(100, Math.max(0, Math.round(value)));
    setThreshold(next);
    startTransition(async () => {
      await updateMatchThreshold(accountId, next);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Job Radar Rules</CardTitle>
        <CardDescription>
          Control auto-send behavior, match thresholds, and daily caps.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!accountId && (
          <p className="text-sm text-muted-foreground">
            Connect an account to configure application automation.
          </p>
        )}

        <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
          <div>
            <p className="text-sm font-medium">
              {autoSend ? "Auto-Send" : "Manual Review"}
            </p>
            <p className="text-xs text-muted-foreground">
              Auto-send dispatches email leads that meet the match threshold.
            </p>
          </div>
          <Switch
            checked={autoSend}
            disabled={disabled}
            onCheckedChange={(checked) =>
              patch(
                "applicationMode",
                checked ? "AUTO_SEND" : "MANUAL_REVIEW"
              )
            }
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Match Threshold</Label>
            <span className="text-sm tabular-nums text-muted-foreground">
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
          <p className="text-xs text-muted-foreground">
            Leads scoring below this threshold are hidden on Job Radar (0% shows
            all).
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="max-sends">Max daily auto-sends</Label>
          <Input
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
          />
        </div>
      </CardContent>
    </Card>
  );
}
