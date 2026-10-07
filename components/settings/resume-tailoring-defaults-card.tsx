"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_RESUME_PREFERENCES,
  type AccountRules,
  type ResumePreferences,
} from "@/lib/validations/rules";
import { cn } from "@/lib/utils";

type ResumeTailoringDefaultsCardProps = {
  accountId: string | null;
  rules: AccountRules;
};

/**
 * Account-level defaults for tailored resume generation and outbound attach.
 */
export function ResumeTailoringDefaultsCard({
  accountId,
  rules,
}: ResumeTailoringDefaultsCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [prefs, setPrefs] = useState<ResumePreferences>(
    rules.resumePreferences ?? DEFAULT_RESUME_PREFERENCES
  );
  const disabled = !accountId || pending;

  useEffect(() => {
    setPrefs(rules.resumePreferences ?? DEFAULT_RESUME_PREFERENCES);
  }, [rules.resumePreferences]);

  function persist(next: ResumePreferences) {
    if (!accountId) return;
    setPrefs(next);
    startTransition(async () => {
      const result = await updateRule(accountId, "resumePreferences", next);
      if (!result.ok) {
        toast.error(result.error);
        setPrefs(rules.resumePreferences ?? DEFAULT_RESUME_PREFERENCES);
        return;
      }
      toast.success("Resume defaults saved");
      router.refresh();
    });
  }

  return (
    <Card className={SETTINGS_CARD_CLASSNAME}>
      <CardHeader>
        <CardTitle>Resume & Dispatch Defaults</CardTitle>
        <CardDescription>
          Global defaults for tailored resumes and whether they attach to
          outbound opportunity emails. You can still override per draft.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!accountId ? (
          <p className="text-sm text-muted-foreground">
            Connect an account to configure resume defaults.
          </p>
        ) : null}

        <div
          className={cn(
            "flex items-start justify-between gap-4",
            SETTINGS_ROW_CLASSNAME
          )}
        >
          <div className="min-w-0 space-y-0.5">
            <Label
              htmlFor="resume-attach-pdf-default"
              className="text-sm font-medium"
            >
              Attach Tailored Resume to Outbound Drafts by Default
            </Label>
            <p className="text-xs text-muted-foreground">
              Automatically attach the generated PDF when sending responses to
              opportunities.
            </p>
          </div>
          <Switch
            id="resume-attach-pdf-default"
            checked={prefs.attachPdfByDefault}
            disabled={disabled}
            onCheckedChange={(checked) =>
              persist({ ...prefs, attachPdfByDefault: checked })
            }
          />
        </div>

        <div
          className={cn(
            "flex items-start justify-between gap-4",
            SETTINGS_ROW_CLASSNAME
          )}
        >
          <div className="min-w-0 space-y-0.5">
            <Label
              htmlFor="resume-include-summary-default"
              className="text-sm font-medium"
            >
              Include Professional Summary by Default
            </Label>
            <p className="text-xs text-muted-foreground">
              Omit by default to free up vertical space for technical projects
              and experience.
            </p>
          </div>
          <Switch
            id="resume-include-summary-default"
            checked={prefs.includeSummary}
            disabled={disabled}
            onCheckedChange={(checked) =>
              persist({ ...prefs, includeSummary: checked })
            }
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-0.5">
            <Label htmlFor="resume-page-budget" className="text-sm font-medium">
              Page budget
            </Label>
            <p className="text-xs text-muted-foreground">
              Soft target for resume length when generating.
            </p>
          </div>
          <select
            id="resume-page-budget"
            value={String(prefs.maxPages)}
            disabled={disabled}
            onChange={(e) => {
              const raw = e.target.value;
              const maxPages =
                raw === "1" ? 1 : raw === "2" ? 2 : ("auto" as const);
              persist({ ...prefs, maxPages });
            }}
            className={SETTINGS_SELECT_CLASSNAME}
          >
            <option value="auto">Auto</option>
            <option value="1">1 page</option>
            <option value="2">2 pages</option>
          </select>
        </div>
      </CardContent>
    </Card>
  );
}
