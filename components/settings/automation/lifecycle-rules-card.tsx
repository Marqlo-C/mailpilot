"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { toast } from "sonner";

import { updateRule } from "@/app/actions/settings";
import {
  SETTINGS_CARD_CLASSNAME,
  SETTINGS_ROW_CLASSNAME,
  SETTINGS_SELECT_CLASSNAME,
} from "@/components/settings/settings-chrome";
import { SettingsSectionCard } from "@/components/ui/tactile/nested-settings-card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { AccountRules } from "@/lib/validations/rules";
import { cn } from "@/lib/utils";

type LifecycleRulesCardProps = {
  accountId: string | null;
  rules: AccountRules;
};

export function LifecycleRulesCard({
  accountId,
  rules,
}: LifecycleRulesCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const disabled = !accountId || pending;

  function patch(key: keyof AccountRules, value: string) {
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

  return (
    <SettingsSectionCard
      className={SETTINGS_CARD_CLASSNAME}
      icon={
        <Zap
          className="size-8 -translate-y-0.5 scale-[1.15] origin-center text-primary shrink-0"
          aria-hidden="true"
        />
      }
      title="Rejection & Lifecycle Automation"
      subtitle="Control how detected application rejections and post-unsubscribe correspondence behave."
      curvedDivider
    >
      <div className="space-y-5">
        {!accountId && (
          <p className="text-sm text-muted-foreground">
            Connect an account to edit automation rules.
          </p>
        )}

        <div className="space-y-2">
          <Label className="text-xs font-semibold text-foreground">
            Rejection Handling
          </Label>
          <RadioGroup
            value={rules.rejectionMode}
            disabled={disabled}
            onValueChange={(value) => {
              patch("rejectionMode", value);
              toast.success("Rejection handling updated");
            }}
            className="space-y-2"
          >
            <div
              className={cn(
                "flex items-start gap-3 rounded-lg border border-border/50 p-3",
                SETTINGS_ROW_CLASSNAME
              )}
            >
              <RadioGroupItem
                value="LABEL_ONLY"
                id="label-only"
                className="mt-0.5"
              />
              <div>
                <Label
                  htmlFor="label-only"
                  className="font-medium text-xs text-foreground cursor-pointer"
                >
                  Apply label ({rules.rejectionLabelName})
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Tag rejections and archive them out of the Inbox without deleting.
                </p>
              </div>
            </div>
            <div
              className={cn(
                "flex items-start gap-3 rounded-lg border border-border/50 p-3",
                SETTINGS_ROW_CLASSNAME
              )}
            >
              <RadioGroupItem
                value="AUTO_TRASH"
                id="auto-trash"
                className="mt-0.5"
              />
              <div>
                <Label
                  htmlFor="auto-trash"
                  className="font-medium text-xs text-foreground cursor-pointer"
                >
                  Auto-trash immediately
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Move detected rejections straight to Gmail Trash.
                </p>
              </div>
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="cleanup-default"
            className="text-xs font-semibold text-foreground"
          >
            Post-Unsubscribe Default Action
          </Label>
          <select
            id="cleanup-default"
            className={cn(
              SETTINGS_SELECT_CLASSNAME,
              "w-full cursor-pointer text-xs"
            )}
            disabled={disabled}
            value={rules.autoCleanAfterUnsub}
            onChange={(e) => {
              patch("autoCleanAfterUnsub", e.target.value);
              toast.success("Post-unsubscribe action saved");
            }}
          >
            <option value="NONE">Unsubscribe only</option>
            <option value="TRASH">Unsubscribe and trash past mail</option>
            <option value="ARCHIVE">Unsubscribe and archive past mail</option>
          </select>
        </div>
      </div>
    </SettingsSectionCard>
  );
}
