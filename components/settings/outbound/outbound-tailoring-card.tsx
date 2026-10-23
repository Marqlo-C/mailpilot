"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { updateRule } from "@/app/actions/settings";
import { SETTINGS_CARD_CLASSNAME } from "@/components/settings/settings-chrome";
import { SettingsSectionCard } from "@/components/ui/tactile/nested-settings-card";
import { WaveToggle } from "@/components/ui/tactile/wave-toggle";
import type { AccountRules } from "@/lib/validations/rules";

import { MetricSynthesisCard } from "./metric-synthesis-card";
import { SectionOrderingStrategyCard } from "./section-ordering-strategy-card";
import { ContentInclusionCard } from "./content-inclusion-card";
import { PageBudgetingCard } from "./page-budgeting-card";
import { ManualBlueprintCard } from "./manual-blueprint-card";

export interface StoredOutboundAccordionState {
  metricOpen: boolean;
  orderingOpen: boolean;
  inclusionOpen: boolean;
  budgetOpen: boolean;
  layoutOpen: boolean;
}

const DEFAULT_ACCORDION_STATE: StoredOutboundAccordionState = {
  metricOpen: true,
  orderingOpen: true,
  inclusionOpen: true,
  budgetOpen: true,
  layoutOpen: true,
};

function getOutboundAccordionStorageKey(accountId: string | null): string {
  return accountId
    ? `mailpilot_outbound_accordion_${accountId}`
    : "mailpilot_outbound_accordion_default";
}

function loadStoredAccordionState(
  accountId: string | null
): StoredOutboundAccordionState {
  if (typeof window === "undefined") return DEFAULT_ACCORDION_STATE;
  try {
    const raw = localStorage.getItem(getOutboundAccordionStorageKey(accountId));
    if (!raw) return DEFAULT_ACCORDION_STATE;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return DEFAULT_ACCORDION_STATE;
    }
    return {
      metricOpen:
        typeof parsed.metricOpen === "boolean" ? parsed.metricOpen : true,
      orderingOpen:
        typeof parsed.orderingOpen === "boolean" ? parsed.orderingOpen : true,
      inclusionOpen:
        typeof parsed.inclusionOpen === "boolean" ? parsed.inclusionOpen : true,
      budgetOpen:
        typeof parsed.budgetOpen === "boolean" ? parsed.budgetOpen : true,
      layoutOpen:
        typeof parsed.layoutOpen === "boolean" ? parsed.layoutOpen : true,
    };
  } catch {
    return DEFAULT_ACCORDION_STATE;
  }
}

function saveStoredAccordionState(
  accountId: string | null,
  state: StoredOutboundAccordionState
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      getOutboundAccordionStorageKey(accountId),
      JSON.stringify(state)
    );
  } catch {
    // ignore quota/permission errors
  }
}

interface OutboundTailoringCardProps {
  accountId: string | null;
  rules: AccountRules;
}

export function OutboundTailoringCard({
  accountId,
  rules,
}: OutboundTailoringCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [accordionState, setAccordionState] =
    useState<StoredOutboundAccordionState>(DEFAULT_ACCORDION_STATE);

  useEffect(() => {
    setAccordionState(loadStoredAccordionState(accountId));
  }, [accountId]);

  const [enableAiTailoringDefaults, setEnableAiTailoringDefaults] = useState(
    rules.enableAiTailoringDefaults ?? true
  );
  const [inventMetrics, setInventMetrics] = useState(
    rules.inventMetrics ?? false
  );
  const [sectionOrderingMode, setSectionOrderingMode] = useState<
    "AI_OPTIMAL" | "MANUAL"
  >(rules.sectionOrderingMode ?? "AI_OPTIMAL");
  const [contentInclusionMode, setContentInclusionMode] = useState<
    "AI_OPTIMAL" | "MANUAL"
  >(rules.contentInclusionMode ?? "AI_OPTIMAL");
  const [targetPageBudget, setTargetPageBudget] = useState<
    "auto" | "1" | "2"
  >(rules.targetPageBudget ?? "auto");
  const [sections, setSections] = useState<string[]>(
    rules.canonicalSectionOrder ?? [
      "summary",
      "skills",
      "experience",
      "projects",
      "education",
      "certifications",
      "awards",
      "interests",
    ]
  );
  const [visibility, setVisibility] = useState<Record<string, boolean>>(
    rules.canonicalSectionVisibility ?? {
      summary: true,
      skills: true,
      experience: true,
      projects: true,
      education: true,
      certifications: true,
      awards: true,
      interests: true,
    }
  );

  useEffect(() => {
    setEnableAiTailoringDefaults(rules.enableAiTailoringDefaults ?? true);
    setInventMetrics(rules.inventMetrics ?? false);
    setSectionOrderingMode(rules.sectionOrderingMode ?? "AI_OPTIMAL");
    setContentInclusionMode(rules.contentInclusionMode ?? "AI_OPTIMAL");
    setTargetPageBudget(rules.targetPageBudget ?? "auto");
    if (rules.canonicalSectionOrder) setSections(rules.canonicalSectionOrder);
    if (rules.canonicalSectionVisibility) {
      setVisibility(rules.canonicalSectionVisibility);
    }
  }, [rules]);

  // Notice: pending is ONLY used to disable interactive inputs to prevent duplicate submissions;
  // it is NEVER passed to collapse the cards, eliminating the jarring collapse/expand glitch!
  const isInputDisabled = !accountId || pending;

  // Master AI lock: forces all sub-cards into collapsed, grayed-out AI Mode.
  const isMasterAiLocked = enableAiTailoringDefaults;

  const effectiveOrdering = isMasterAiLocked
    ? "AI_OPTIMAL"
    : sectionOrderingMode;
  const effectiveInclusion = isMasterAiLocked
    ? "AI_OPTIMAL"
    : contentInclusionMode;
  const effectiveBudget = isMasterAiLocked ? "auto" : targetPageBudget;
  const effectiveInventMetrics = isMasterAiLocked ? true : inventMetrics;

  const isLayoutLocked =
    isMasterAiLocked ||
    (effectiveOrdering === "AI_OPTIMAL" && effectiveInclusion === "AI_OPTIMAL");

  const isManualInclusion =
    !isMasterAiLocked && effectiveInclusion === "MANUAL";

  function patchRule(key: keyof AccountRules, val: unknown) {
    if (!accountId) return;
    startTransition(async () => {
      const res = await updateRule(accountId, key, val);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  function handleMasterToggle(checked: boolean) {
    setEnableAiTailoringDefaults(checked);
    patchRule("enableAiTailoringDefaults", checked);
    toast.success(
      checked
        ? "AI Resume Tailoring enabled"
        : "Custom tailoring controls restored"
    );
  }

  function toggleAccordion(key: keyof StoredOutboundAccordionState) {
    if (isMasterAiLocked) return;
    setAccordionState((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveStoredAccordionState(accountId, next);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* Level 1 Master Card 1: AI Resume Tailoring */}
      <SettingsSectionCard
        className={SETTINGS_CARD_CLASSNAME}
        icon={
          <Sparkles
            className="size-7 -translate-y-0.5 text-primary shrink-0"
            aria-hidden="true"
          />
        }
        title="AI Resume Tailoring"
        subtitle="Automatically customize your bullets, section order, and page length for every job application."
        toggle={
          <WaveToggle
            id="master-ai-tailoring"
            checked={enableAiTailoringDefaults}
            disabled={!accountId || pending}
            onCheckedChange={handleMasterToggle}
          />
        }
        curvedDivider
      >
        <div className="space-y-3.5">
          {!accountId && (
            <p className="text-sm text-muted-foreground">
              Connect an account to configure resume tailoring defaults.
            </p>
          )}

          {/* Level 2 Card 1: Impact Metrics */}
          <MetricSynthesisCard
            inventMetrics={effectiveInventMetrics}
            disabled={isInputDisabled}
            isLocked={isMasterAiLocked}
            isExpanded={accordionState.metricOpen}
            onToggle={() => toggleAccordion("metricOpen")}
            onSelectMode={(val) => {
              setInventMetrics(val);
              patchRule("inventMetrics", val);
              toast.success(
                val
                  ? "Smart metric estimates enabled"
                  : "Verified facts enabled"
              );
            }}
          />

          {/* Level 2 Card 2: Content Selection */}
          <ContentInclusionCard
            contentInclusionMode={effectiveInclusion}
            disabled={isInputDisabled}
            isLocked={isMasterAiLocked}
            isExpanded={accordionState.inclusionOpen}
            onToggle={() => toggleAccordion("inclusionOpen")}
            onSelectMode={(mode) => {
              setContentInclusionMode(mode);
              patchRule("contentInclusionMode", mode);
              toast.success(
                mode === "AI_OPTIMAL"
                  ? "Role-targeted highlights enabled"
                  : "Manual content selection enabled"
              );
            }}
          />

          {/* Level 2 Card 3: Section Ordering */}
          <SectionOrderingStrategyCard
            sectionOrderingMode={effectiveOrdering}
            disabled={isInputDisabled}
            isLocked={isMasterAiLocked}
            isExpanded={accordionState.orderingOpen}
            onToggle={() => toggleAccordion("orderingOpen")}
            onSelectMode={(mode) => {
              setSectionOrderingMode(mode);
              patchRule("sectionOrderingMode", mode);
              toast.success(
                mode === "AI_OPTIMAL"
                  ? "Dynamic section ordering enabled"
                  : "Manual ordering enabled"
              );
            }}
          />

          {/* Level 2 Card 4: Target Page Length */}
          <PageBudgetingCard
            targetPageBudget={effectiveBudget}
            disabled={isInputDisabled}
            isLocked={isMasterAiLocked}
            isExpanded={accordionState.budgetOpen}
            onToggle={() => toggleAccordion("budgetOpen")}
            onSelectBudget={(budget) => {
              setTargetPageBudget(budget);
              patchRule("targetPageBudget", budget);
              toast.success(
                budget === "auto"
                  ? "Automatic page length enabled"
                  : budget === "1"
                    ? "Strict 1-page limit set"
                    : "Strict 2-page limit set"
              );
            }}
          />
        </div>
      </SettingsSectionCard>

      {/* Level 1 Master Card 2: Manual Section Blueprint (Non-collapsible) */}
      <ManualBlueprintCard
        accountId={accountId}
        inventMetrics={effectiveInventMetrics}
        sectionOrderingMode={effectiveOrdering}
        contentInclusionMode={effectiveInclusion}
        sections={sections}
        visibility={visibility}
        disabled={isInputDisabled}
        isLocked={isLayoutLocked}
        isExpanded={accordionState.layoutOpen}
        onToggle={() => {
          if (isLayoutLocked) return;
          toggleAccordion("layoutOpen");
        }}
        onReorder={(newOrder) => {
          setSections(newOrder);
          patchRule("canonicalSectionOrder", newOrder);
          toast.success("Section order saved");
        }}
        onToggleVisibility={(key, val) => {
          const next = { ...visibility, [key]: val };
          setVisibility(next);
          patchRule("canonicalSectionVisibility", next);
          toast.success(`Updated selection for ${key}`);
        }}
      />
    </div>
  );
}

export default OutboundTailoringCard;
