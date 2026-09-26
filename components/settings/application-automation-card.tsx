"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

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
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type { AccountRules } from "@/lib/validations/rules";

type ApplicationAutomationCardProps = {
  accountId: string | null;
  rules: AccountRules;
};

export function ApplicationAutomationCard({
  accountId,
  rules,
}: ApplicationAutomationCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const disabled = !accountId || pending;
  const autoSend = rules.applicationMode === "AUTO_SEND";

  function patch(key: keyof AccountRules, value: string | number) {
    if (!accountId) return;
    startTransition(async () => {
      await updateRule(accountId, key, value);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Application Automation</CardTitle>
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
            <Label>Match score threshold</Label>
            <span className="text-sm tabular-nums text-muted-foreground">
              {rules.matchScoreThreshold}%
            </span>
          </div>
          <Slider
            min={50}
            max={100}
            step={1}
            disabled={disabled}
            value={[rules.matchScoreThreshold]}
            onValueCommit={(value) =>
              patch("matchScoreThreshold", value[0] ?? 75)
            }
          />
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
