"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MailWarning } from "lucide-react";
import { toast } from "sonner";

import { updateRule } from "@/app/actions/settings";
import { SETTINGS_ROW_CLASSNAME } from "@/lib/utils/navigation/settings-chrome";
import { LogoFrameIcon } from "@/components/ui/logo-frame";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  SettingsFeatureCard,
  SettingsStatusPill,
} from "@/components/ui/tactile/nested-settings-card";
import type { AccountRules } from "@/lib/validations/rules.schema";
import { cn } from "@/lib/utils";

type LifecycleRulesCardProps = {
  accountId: string | null;
  rules: AccountRules;
  isExpanded: boolean;
  onToggle: () => void;
};

function rejectionLabel(mode: AccountRules["rejectionMode"]): string {
  return mode === "AUTO_TRASH" ? "Auto-trash" : "Label only";
}

/**
 * L2 — Rejection mail and post-unsubscribe cleanup.
 */
export function LifecycleRulesCard({
  accountId,
  rules,
  isExpanded,
  onToggle,
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
    <SettingsFeatureCard
      logo={<LogoFrameIcon icon={MailWarning} />}
      title="Rejection mail"
      subtitle="Choose what happens when MailPilot detects a job rejection email."
      statusBadge={
        <SettingsStatusPill showDot={false}>
          {rejectionLabel(rules.rejectionMode)}
        </SettingsStatusPill>
      }
      isExpanded={isExpanded}
      onToggle={onToggle}
      curvedDivider
    >
      <div className="space-y-2">
        {!accountId ? (
          <p className="text-sm text-muted-foreground">
            Connect an account to edit rejection handling.
          </p>
        ) : null}

        <Label className="text-xs font-semibold text-foreground">
          When a rejection email arrives
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
                className="cursor-pointer text-xs font-medium text-foreground"
              >
                Label and archive ({rules.rejectionLabelName})
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Keep the message out of your Inbox without deleting it.
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
                className="cursor-pointer text-xs font-medium text-foreground"
              >
                Move to Trash
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Send detected rejections straight to Gmail Trash.
              </p>
            </div>
          </div>
        </RadioGroup>
      </div>
    </SettingsFeatureCard>
  );
}
