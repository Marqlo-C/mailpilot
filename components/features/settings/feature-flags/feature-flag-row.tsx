"use client";

import * as React from "react";
import { AlertTriangle, Lock, ShieldAlert, Sparkles } from "lucide-react";
import { WaveToggle } from "@/components/ui/tactile/wave-toggle";
import {
  type FeatureFlagDefinition,
  type FeatureFlagKey,
  type FeatureFlagRiskTier,
} from "@/lib/validations/feature-flags.schema";
import { LabelTooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface FeatureFlagRowProps {
  definition: FeatureFlagDefinition;
  enabled: boolean;
  isLockedByKillSwitch?: boolean;
  disabled?: boolean;
  onToggle: (key: FeatureFlagKey, value: boolean) => void;
  className?: string;
}

const RISK_BADGE_CONFIG: Record<
  FeatureFlagRiskTier,
  {
    label: string;
    className: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  LOW: {
    label: "Low Risk",
    className: "border-border/60 bg-muted/60 text-muted-foreground",
    icon: Sparkles,
  },
  MEDIUM: {
    label: "Medium Risk",
    className:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    icon: AlertTriangle,
  },
  HIGH: {
    label: "High Risk · Caution",
    className:
      "border-rose-500/30 bg-rose-500/15 text-rose-700 dark:text-rose-400 font-semibold shadow-xs",
    icon: ShieldAlert,
  },
};

export function FeatureFlagRow({
  definition,
  enabled,
  isLockedByKillSwitch = false,
  disabled = false,
  onToggle,
  className,
}: FeatureFlagRowProps) {
  const riskConfig = RISK_BADGE_CONFIG[definition.risk];
  const RiskIcon = riskConfig.icon;
  const isToggleDisabled = disabled || isLockedByKillSwitch;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-3.5 transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-4",
        enabled
          ? "border-border/80 bg-card hover:border-border"
          : "border-border/40 bg-card/60 hover:border-border/60",
        isLockedByKillSwitch && "opacity-85 bg-muted/20 border-border/50",
        className
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold tracking-tight text-foreground">
            {definition.label}
          </span>

          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] leading-tight",
              riskConfig.className
            )}
          >
            <RiskIcon className="size-3 shrink-0" aria-hidden="true" />
            <span>{riskConfig.label}</span>
          </span>

          {isLockedByKillSwitch ? (
            <LabelTooltip
              label={
                definition.killSwitchEnvVar
                  ? `Disabled globally via emergency system kill-switch (${definition.killSwitchEnvVar}). Account override is locked.`
                  : "Disabled globally via emergency system kill-switch. Account override is locked."
              }
              side="top"
            >
              <span className="inline-flex items-center gap-1 rounded-md border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                <Lock className="size-3 shrink-0" aria-hidden="true" />
                <span>System Locked</span>
              </span>
            </LabelTooltip>
          ) : null}
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          {definition.description}
        </p>
      </div>

      <div className="flex shrink-0 items-center justify-between sm:justify-end gap-3 pt-1 sm:pt-0">
        <span className="text-[11px] font-medium text-muted-foreground sm:hidden">
          {enabled ? "Active" : "Disabled"}
        </span>
        <WaveToggle
          id={`feature-flag-${definition.id}`}
          checked={enabled}
          disabled={isToggleDisabled}
          aria-label={`Toggle ${definition.label}`}
          onCheckedChange={(next) => onToggle(definition.id, next)}
        />
      </div>
    </div>
  );
}
