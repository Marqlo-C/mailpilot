"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateRule } from "@/app/actions/settings";
import {
  SETTINGS_CARD_CLASSNAME,
  SETTINGS_ROW_CLASSNAME,
  SETTINGS_SELECT_CLASSNAME,
} from "@/components/settings/settings-chrome";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { AccountRules } from "@/lib/validations/rules";
import { cn } from "@/lib/utils";

type AutomationRulesCardProps = {
  accountId: string | null;
  rules: AccountRules;
};

export function AutomationRulesCard({
  accountId,
  rules,
}: AutomationRulesCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const disabled = !accountId || pending;

  function patch(key: keyof AccountRules, value: string) {
    if (!accountId) return;
    startTransition(async () => {
      await updateRule(accountId, key, value);
      router.refresh();
    });
  }

  return (
    <Card className={SETTINGS_CARD_CLASSNAME}>
      <CardHeader>
        <CardTitle>Automation Rules</CardTitle>
        <CardDescription>
          Control how rejections and unsubscribe cleanup behave.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!accountId && (
          <p className="text-sm text-muted-foreground">
            Connect an account to edit automation rules.
          </p>
        )}

        <div className="space-y-3">
          <Label>Rejection handling</Label>
          <RadioGroup
            value={rules.rejectionMode}
            disabled={disabled}
            onValueChange={(value) => patch("rejectionMode", value)}
            className="space-y-2"
          >
            <div className={cn("flex items-start gap-3", SETTINGS_ROW_CLASSNAME)}>
              <RadioGroupItem value="LABEL_ONLY" id="label-only" className="mt-0.5" />
              <div>
                <Label htmlFor="label-only" className="font-medium">
                  Apply label ({rules.rejectionLabelName})
                </Label>
                <p className="text-xs text-muted-foreground">
                  Tag rejections and archive them out of Inbox.
                </p>
              </div>
            </div>
            <div className={cn("flex items-start gap-3", SETTINGS_ROW_CLASSNAME)}>
              <RadioGroupItem value="AUTO_TRASH" id="auto-trash" className="mt-0.5" />
              <div>
                <Label htmlFor="auto-trash" className="font-medium">
                  Auto-trash immediately
                </Label>
                <p className="text-xs text-muted-foreground">
                  Move detected rejections straight to Trash.
                </p>
              </div>
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cleanup-default">Post-unsubscribe default</Label>
          <select
            id="cleanup-default"
            className={cn(SETTINGS_SELECT_CLASSNAME, "w-full")}
            disabled={disabled}
            value={rules.autoCleanAfterUnsub}
            onChange={(e) => patch("autoCleanAfterUnsub", e.target.value)}
          >
            <option value="NONE">Unsubscribe only</option>
            <option value="TRASH">Unsubscribe and trash past mail</option>
            <option value="ARCHIVE">Unsubscribe and archive past mail</option>
          </select>
        </div>
      </CardContent>
    </Card>
  );
}
