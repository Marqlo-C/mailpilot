"use client";

import { Layers } from "lucide-react";
import { SETTINGS_CARD_CLASSNAME } from "@/components/settings/settings-chrome";
import { SettingsSectionCard } from "@/components/ui/tactile/nested-settings-card";
import { CanonicalSectionLayoutCard } from "./canonical-section-layout-card";

export interface ManualBlueprintCardProps {
  accountId: string | null;
  inventMetrics: boolean;
  sectionOrderingMode: "AI_OPTIMAL" | "MANUAL";
  contentInclusionMode: "AI_OPTIMAL" | "MANUAL";
  sections: string[];
  visibility: Record<string, boolean>;
  disabled: boolean;
  isLocked: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onReorder: (newOrder: string[]) => void;
  onToggleVisibility: (sectionKey: string, visible: boolean) => void;
}

export function ManualBlueprintCard({
  accountId,
  inventMetrics,
  sectionOrderingMode,
  contentInclusionMode,
  sections,
  visibility,
  disabled,
  isLocked,
  isExpanded,
  onToggle,
  onReorder,
  onToggleVisibility,
}: ManualBlueprintCardProps) {
  return (
    <SettingsSectionCard
      className={SETTINGS_CARD_CLASSNAME}
      icon={
        <Layers
          className="size-7 -translate-y-0.5 text-primary shrink-0"
          aria-hidden="true"
        />
      }
      title="Manual Section Blueprint"
      subtitle="Set your default section order and selection when using manual ordering or custom layout."
      collapsible={false}
      curvedDivider
    >
      <div className="space-y-3.5">
        {!accountId && (
          <p className="text-sm text-muted-foreground">
            Connect an account to customize your section blueprint.
          </p>
        )}

        <CanonicalSectionLayoutCard
          inventMetrics={inventMetrics}
          sectionOrderingMode={sectionOrderingMode}
          contentInclusionMode={contentInclusionMode}
          sections={sections}
          visibility={visibility}
          disabled={disabled}
          isLocked={isLocked}
          isExpanded={isExpanded}
          onToggle={onToggle}
          onReorder={onReorder}
          onToggleVisibility={onToggleVisibility}
        />
      </div>
    </SettingsSectionCard>
  );
}

export default ManualBlueprintCard;
