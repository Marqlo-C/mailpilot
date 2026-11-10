"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { History } from "lucide-react";
import { toast } from "sonner";

import { updateDismissedRetention } from "@/app/actions/settings";
import { LogoFrameIcon } from "@/components/ui/logo-frame";
import { AppMenuSelect } from "@/components/ui/app-menu";
import {
  SettingsFeatureCard,
  SettingsStatusPill,
} from "@/components/ui/tactile/nested-settings-card";
import { DISMISSED_RETENTION_OPTIONS } from "@/lib/validations/rules.schema";

type RetentionPolicyCardProps = {
  currentDays?: number;
  isExpanded: boolean;
  onToggle: () => void;
};

/**
 * L2 — How long dismissed History items stay before auto-delete.
 */
export function RetentionPolicyCard({
  currentDays = 30,
  isExpanded,
  onToggle,
}: RetentionPolicyCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <SettingsFeatureCard
      logo={<LogoFrameIcon icon={History} />}
      title="Dismissed history"
      subtitle="Dismissed jobs in History are permanently deleted after this window."
      statusBadge={
        <SettingsStatusPill showDot={false}>{currentDays} days</SettingsStatusPill>
      }
      isExpanded={isExpanded}
      onToggle={onToggle}
      curvedDivider
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-0.5">
          <label
            htmlFor="dismissed-retention"
            className="block text-xs font-semibold text-foreground"
          >
            Keep dismissed jobs for
          </label>
          <p className="text-[11px] text-muted-foreground">
            Archived jobs you want to keep stay until you dismiss them yourself.
          </p>
        </div>
        <AppMenuSelect
          id="dismissed-retention"
          surface="light"
          value={String(currentDays)}
          disabled={isPending}
          className="w-auto min-w-[120px]"
          matchTriggerWidth={false}
          options={DISMISSED_RETENTION_OPTIONS.map((days) => ({
            value: String(days),
            label: `${days} days`,
          }))}
          onChange={(next) => {
            const val = Number(next);
            startTransition(async () => {
              const result = await updateDismissedRetention(val);
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              toast.success(`Dismissed jobs kept for ${val} days`);
              router.refresh();
            });
          }}
        />
      </div>
    </SettingsFeatureCard>
  );
}
