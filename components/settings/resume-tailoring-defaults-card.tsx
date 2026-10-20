"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  Layers,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";

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
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  DEFAULT_RESUME_PREFERENCES,
  type AccountRules,
  type ResumePreferences,
} from "@/lib/validations/rules";
import {
  RESUME_SECTION_KEYS,
  type ResumeSectionKey,
} from "@/lib/resume-draft/schema.ssot";
import { cn } from "@/lib/utils";

type ResumeTailoringDefaultsCardProps = {
  accountId: string | null;
  rules: AccountRules;
};

const SECTION_METADATA: Record<
  ResumeSectionKey,
  { label: string; description: string }
> = {
  summary: {
    label: "Professional Summary",
    description: "High-level career trajectory and target domain positioning",
  },
  skills: {
    label: "Skills & Proficiencies",
    description: "Grouped technical, architectural, and tool proficiencies",
  },
  experience: {
    label: "Professional Experience",
    description: "Chronological roles with achievement and responsibility bullets",
  },
  projects: {
    label: "Projects & Practical Portfolio",
    description: "Technical systems, key deliverables, and code links",
  },
  education: {
    label: "Education & Degrees",
    description: "Academic credentials, institutions, and coursework",
  },
  certifications: {
    label: "Certifications & Licenses",
    description: "Industry credentials, vendor certificates, and licenses",
  },
  awards: {
    label: "Honors & Awards",
    description: "Distinctions, scholarships, and recognized achievements",
  },
  interests: {
    label: "Interests & Activities",
    description: "Personal interests, community leadership, and activities",
  },
};

/**
 * Account-level defaults for tailored resume generation, dispatch,
 * section ordering, and metric synthesis.
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

  // Derive canonical section order list ensuring all canonical keys are present
  const rawOrder =
    prefs.sectionOrder && prefs.sectionOrder.length > 0
      ? prefs.sectionOrder
      : DEFAULT_RESUME_PREFERENCES.sectionOrder;

  const currentOrder: ResumeSectionKey[] = [];
  for (const item of rawOrder) {
    const key = item.toLowerCase() as ResumeSectionKey;
    if (RESUME_SECTION_KEYS.includes(key) && !currentOrder.includes(key)) {
      currentOrder.push(key);
    }
  }
  for (const key of RESUME_SECTION_KEYS) {
    if (!currentOrder.includes(key)) {
      currentOrder.push(key);
    }
  }

  const disabledSet = new Set(
    (prefs.disabledSections ?? []).map((s) => s.toLowerCase())
  );

  function moveSection(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentOrder.length) return;
    const nextOrder = [...currentOrder];
    const [moved] = nextOrder.splice(index, 1);
    nextOrder.splice(targetIndex, 0, moved);
    persist({ ...prefs, sectionOrder: nextOrder });
  }

  function toggleSection(key: ResumeSectionKey, shouldEnable: boolean) {
    const nextDisabled = shouldEnable
      ? (prefs.disabledSections ?? []).filter(
          (s) => s.toLowerCase() !== key.toLowerCase()
        )
      : [
          ...(prefs.disabledSections ?? []).filter(
            (s) => s.toLowerCase() !== key.toLowerCase()
          ),
          key,
        ];
    persist({ ...prefs, disabledSections: nextDisabled });
  }

  return (
    <Card className={SETTINGS_CARD_CLASSNAME}>
      <CardHeader className="flex flex-row items-center gap-3 border-b border-border/50 p-3.5 space-y-0">
        <FileText
          className="h-8 w-8 -translate-y-0.5 text-primary shrink-0"
          aria-hidden="true"
        />
        <div className="space-y-0.5 min-w-0">
          <CardTitle>Resume & Dispatch Defaults</CardTitle>
          <CardDescription className="text-xs">
            Global defaults for resume tailoring, section layout, and outbound
            opportunity dispatch. Individual drafts inherit these settings with
            per-draft overrides available in the workspace.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-4">
        {!accountId ? (
          <p className="text-sm text-muted-foreground">
            Connect an account to configure resume defaults.
          </p>
        ) : null}

        {/* 1. Outbound Dispatch Controls */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Outbound Dispatch & Length
          </h3>

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
                Automatically generate and attach the tailored PDF when sending
                opportunity replies.
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
                and work experiences.
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

          <div
            className={cn(
              "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
              SETTINGS_ROW_CLASSNAME
            )}
          >
            <div className="min-w-0 space-y-0.5">
              <Label
                htmlFor="resume-page-budget"
                className="text-sm font-medium"
              >
                Target Page Budget
              </Label>
              <p className="text-xs text-muted-foreground">
                Soft page limit calibrated against profile density (auto
                selects 1 or 2 pages based on career length).
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
              <option value="auto">Auto (Elastic)</option>
              <option value="1">1 page</option>
              <option value="2">2 pages</option>
            </select>
          </div>
        </div>

        {/* 2. AI Tailoring & Optimization Strategy */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            AI Tailoring Strategy
          </h3>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Section Ordering Mode</Label>
            <RadioGroup
              value={prefs.orderingMode}
              disabled={disabled}
              onValueChange={(val) =>
                persist({
                  ...prefs,
                  orderingMode: val as "AI_OPTIMAL" | "MANUAL",
                })
              }
              className="space-y-2"
            >
              <div
                className={cn(
                  "flex items-start gap-3",
                  SETTINGS_ROW_CLASSNAME
                )}
              >
                <RadioGroupItem
                  value="AI_OPTIMAL"
                  id="order-ai-optimal"
                  className="mt-0.5"
                />
                <div>
                  <Label
                    htmlFor="order-ai-optimal"
                    className="font-medium cursor-pointer"
                  >
                    AI Optimal (Recommended)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Dynamically prioritizes demonstrated target-discipline
                    sections (like Projects / Portfolio) ahead of legacy
                    experience for career switchers and early-tenure profiles.
                  </p>
                </div>
              </div>

              <div
                className={cn(
                  "flex items-start gap-3",
                  SETTINGS_ROW_CLASSNAME
                )}
              >
                <RadioGroupItem
                  value="MANUAL"
                  id="order-manual"
                  className="mt-0.5"
                />
                <div>
                  <Label
                    htmlFor="order-manual"
                    className="font-medium cursor-pointer"
                  >
                    Manual Section Order
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Strictly follow the canonical section sequence defined
                    below for all tailored resumes.
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Content Inclusion Mode</Label>
            <RadioGroup
              value={prefs.inclusionMode}
              disabled={disabled}
              onValueChange={(val) =>
                persist({
                  ...prefs,
                  inclusionMode: val as "AI_OPTIMAL" | "MANUAL",
                })
              }
              className="space-y-2"
            >
              <div
                className={cn(
                  "flex items-start gap-3",
                  SETTINGS_ROW_CLASSNAME
                )}
              >
                <RadioGroupItem
                  value="AI_OPTIMAL"
                  id="inclusion-ai-optimal"
                  className="mt-0.5"
                />
                <div>
                  <Label
                    htmlFor="inclusion-ai-optimal"
                    className="font-medium cursor-pointer"
                  >
                    AI Optimal Selection (Recommended)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    The tailoring engine adaptively selects 3–5 high-impact
                    bullets per role matching target job requirements.
                  </p>
                </div>
              </div>

              <div
                className={cn(
                  "flex items-start gap-3",
                  SETTINGS_ROW_CLASSNAME
                )}
              >
                <RadioGroupItem
                  value="MANUAL"
                  id="inclusion-manual"
                  className="mt-0.5"
                />
                <div>
                  <Label
                    htmlFor="inclusion-manual"
                    className="font-medium cursor-pointer"
                  >
                    Manual Baseline Selection
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Selects all active profile entries by default, leaving
                    pruning to human review.
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>

          <div
            className={cn(
              "flex items-start justify-between gap-4",
              SETTINGS_ROW_CLASSNAME
            )}
          >
            <div className="min-w-0 space-y-0.5">
              <Label
                htmlFor="resume-invent-metrics"
                className="text-sm font-medium flex items-center gap-1.5"
              >
                <Sparkles className="h-4 w-4 text-primary" />
                Plausible Metric Synthesis
              </Label>
              <p className="text-xs text-muted-foreground">
                When enabled, the Google XYZ engine synthesizes modest,
                realistic metrics calibrated to verified candidate leveling
                (e.g., runtime reductions, daily volumes) when source bullets
                lack numbers. When disabled, metric invention is strictly
                prohibited.
              </p>
            </div>
            <Switch
              id="resume-invent-metrics"
              checked={prefs.inventMetrics}
              disabled={disabled}
              onCheckedChange={(checked) =>
                persist({ ...prefs, inventMetrics: checked })
              }
            />
          </div>
        </div>

        {/* 3. Section Layout & Visibility Controls */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Canonical Section Layout & Visibility
              </h3>
              <p className="text-xs text-muted-foreground">
                Reorder sections using the arrows or toggle sections off to omit
                them by default.
              </p>
            </div>
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          </div>

          <div className="space-y-2">
            {currentOrder.map((sectionKey, index) => {
              const meta = SECTION_METADATA[sectionKey] ?? {
                label: sectionKey,
                description: "",
              };
              const isOmitted = disabledSet.has(sectionKey);
              const isFirst = index === 0;
              const isLast = index === currentOrder.length - 1;

              return (
                <div
                  key={sectionKey}
                  className={cn(
                    "flex flex-col gap-3 p-3 transition-colors sm:flex-row sm:items-center sm:justify-between",
                    SETTINGS_ROW_CLASSNAME,
                    isOmitted && "opacity-60 bg-muted/30"
                  )}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                      {index + 1}
                    </span>
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {meta.label}
                        </span>
                        {isOmitted ? (
                          <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                            Omitted
                          </span>
                        ) : (
                          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {meta.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 shrink-0">
                    <div className="flex items-center gap-1 mr-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={disabled || isFirst}
                        aria-label={`Move ${meta.label} up`}
                        onClick={() => moveSection(index, "up")}
                        className="h-7 w-7"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={disabled || isLast}
                        aria-label={`Move ${meta.label} down`}
                        onClick={() => moveSection(index, "down")}
                        className="h-7 w-7"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <Switch
                      checked={!isOmitted}
                      disabled={disabled}
                      aria-label={`Include ${meta.label} section`}
                      onCheckedChange={(checked) =>
                        toggleSection(sectionKey, checked)
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
