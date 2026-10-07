"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateDismissedRetention } from "@/app/actions/settings";
import {
  SETTINGS_CARD_CLASSNAME,
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
import { DISMISSED_RETENTION_OPTIONS } from "@/lib/validations/rules";

type DismissedRetentionSettingProps = {
  currentDays?: number;
};

/**
 * Settings control for how long DISMISSED History items are retained
 * before automatic permanent purge.
 */
export function DismissedRetentionSetting({
  currentDays = 30,
}: DismissedRetentionSettingProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Card className={SETTINGS_CARD_CLASSNAME}>
      <CardHeader>
        <CardTitle>Dismissed Items Auto-Delete</CardTitle>
        <CardDescription>
          Dismissed items in History are permanently purged after this window.
          User-archived items stay until you dismiss or restore them.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Label htmlFor="dismissed-retention" className="text-sm font-medium">
            Retention window
          </Label>
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
            className={SETTINGS_SELECT_CLASSNAME}
          >
            {DISMISSED_RETENTION_OPTIONS.map((days) => (
              <option key={days} value={days}>
                {days} Days
              </option>
            ))}
          </select>
        </div>
      </CardContent>
    </Card>
  );
}
