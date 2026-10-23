"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { updateDismissedRetention } from "@/app/actions/settings";
import {
  SETTINGS_CARD_CLASSNAME,
  SETTINGS_SELECT_CLASSNAME,
} from "@/components/settings/settings-chrome";
import { SettingsSectionCard } from "@/components/ui/tactile/nested-settings-card";
import { DISMISSED_RETENTION_OPTIONS } from "@/lib/validations/rules";
import { cn } from "@/lib/utils";

type RetentionPolicyCardProps = {
  currentDays?: number;
};

export function RetentionPolicyCard({
  currentDays = 30,
}: RetentionPolicyCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <SettingsSectionCard
      className={SETTINGS_CARD_CLASSNAME}
      icon={
        <Trash2
          className="size-8 -translate-y-0.5 scale-[1.15] origin-center text-primary shrink-0"
          aria-hidden="true"
        />
      }
      title="Dismissed Items Auto-Delete"
      subtitle="Dismissed items in History are permanently purged after this retention window expires."
      curvedDivider
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-0.5">
          <label
            htmlFor="dismissed-retention"
            className="text-xs font-semibold text-foreground block"
          >
            Retention Window
          </label>
          <p className="text-[11px] text-muted-foreground">
            User-archived opportunities stay indefinitely until manually dismissed.
          </p>
        </div>
        <select
          id="dismissed-retention"
          value={currentDays}
          disabled={isPending}
          onChange={(e) => {
            const val = Number(e.target.value);
            startTransition(async () => {
              const result = await updateDismissedRetention(val);
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              toast.success(`Retention set to ${val} days`);
              router.refresh();
            });
          }}
          className={cn(
            SETTINGS_SELECT_CLASSNAME,
            "w-auto min-w-[120px] cursor-pointer text-xs"
          )}
        >
          {DISMISSED_RETENTION_OPTIONS.map((days) => (
            <option key={days} value={days}>
              {days} Days
            </option>
          ))}
        </select>
      </div>
    </SettingsSectionCard>
  );
}
