"use client";

import { CircleGauge, FlaskConical, Lock, ThumbsUp } from "lucide-react";
import { LogoFrameIcon } from "@/components/ui/logo-frame";
import { SettingsFeatureCard } from "@/components/ui/tactile/nested-settings-card";
import { WaveToggle } from "@/components/ui/tactile/wave-toggle";
import { OutboundStatusPill } from "./status-pill";
import { cn } from "@/lib/utils";

interface MetricSynthesisCardProps {
  inventMetrics: boolean;
  disabled: boolean;
  isLocked: boolean;
  isExpanded: boolean;
  isKillSwitched?: boolean;
  onToggle: () => void;
  onSelectMode: (inventMetrics: boolean) => void;
}

export function MetricSynthesisCard({
  inventMetrics,
  disabled,
  isLocked,
  isExpanded,
  isKillSwitched = false,
  onToggle,
  onSelectMode,
}: MetricSynthesisCardProps) {
  const effectiveInventMetrics = inventMetrics;

  return (
    <SettingsFeatureCard
      logo={
        <LogoFrameIcon
          icon={CircleGauge}
          className={cn(isLocked && "opacity-50")}
          iconClassName={isLocked ? "text-muted-foreground/60" : undefined}
        />
      }
      title="Impact Metrics"
      subtitle="Decide whether AI adds realistic metric estimates when your original bullets don't include numbers."
      statusBadge={
        isLocked || effectiveInventMetrics ? (
          <OutboundStatusPill isRecommended={false}>AI Estimates</OutboundStatusPill>
        ) : (
          <OutboundStatusPill isRecommended={true}>Verified Facts</OutboundStatusPill>
        )
      }
      isExpanded={!isLocked && isExpanded}
      onToggle={onToggle}
      disabled={isLocked}
      curvedDivider
    >
      <div className="space-y-3">
        {isKillSwitched ? (
          <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <Lock className="size-3.5 shrink-0" aria-hidden="true" />
            <span>
              Mode B Metric Synthesis is temporarily suspended by a platform kill-switch. Your preference is preserved and will take effect once restored.
            </span>
          </div>
        ) : null}

        {/* Toggle Option 1: AI Metric Estimates */}
        <div
          className={cn(
            "flex items-start justify-between gap-4 rounded-lg border p-3 transition-colors",
            effectiveInventMetrics
              ? "border-border/60 bg-card hover:border-border"
              : "border-border/40 bg-card/60"
          )}
        >
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <p
                className={cn(
                  "text-[13px] font-semibold tracking-tight transition-colors duration-150",
                  effectiveInventMetrics ? "text-foreground" : "text-muted-foreground"
                )}
              >
                Smart Metric Estimates
              </p>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border border-[#78486c]/20 bg-[#78486c]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#78486c] dark:border-[#78486c]/40 dark:bg-[#78486c]/20 dark:text-[#e49ecb] shrink-0 transition-opacity duration-150",
                  effectiveInventMetrics ? "opacity-100" : "opacity-50"
                )}
              >
                <FlaskConical className="size-3 shrink-0" aria-hidden="true" />
                Experimental
              </span>
            </div>
            <p
              className={cn(
                "text-xs leading-relaxed transition-colors duration-150",
                effectiveInventMetrics
                  ? "text-muted-foreground"
                  : "text-muted-foreground/60"
              )}
            >
              Adds realistic numbers for scale, efficiency, and impact based on your role and seniority.
            </p>
          </div>
          <WaveToggle
            id="metric-ai-toggle"
            checked={effectiveInventMetrics}
            disabled={disabled || isLocked}
            onCheckedChange={(checked) => {
              onSelectMode(checked);
            }}
          />
        </div>

        {/* Toggle Option 2: Verified Facts */}
        <div
          className={cn(
            "flex items-start justify-between gap-4 rounded-lg border p-3 transition-colors",
            !effectiveInventMetrics
              ? "border-border/60 bg-card hover:border-border"
              : "border-border/40 bg-card/60"
          )}
        >
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <p
                className={cn(
                  "text-[13px] font-semibold tracking-tight transition-colors duration-150",
                  !effectiveInventMetrics ? "text-foreground" : "text-muted-foreground"
                )}
              >
                Verified Facts
              </p>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border border-[#1ab5af]/30 bg-[#1ab5af]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#139a94] dark:border-[#1ab5af]/40 dark:bg-[#1ab5af]/25 dark:text-[#2dd4bf] shrink-0 transition-opacity duration-150",
                  !effectiveInventMetrics ? "opacity-100" : "opacity-50"
                )}
              >
                <ThumbsUp className="size-3 shrink-0" aria-hidden="true" />
                Recommended
              </span>
            </div>
            <p
              className={cn(
                "text-xs leading-relaxed transition-colors duration-150",
                !effectiveInventMetrics
                  ? "text-muted-foreground"
                  : "text-muted-foreground/60"
              )}
            >
              Never adds estimated numbers. Keeps your original wording focused on what you accomplished and the tools you used.
            </p>
          </div>
          <WaveToggle
            id="metric-strict-toggle"
            checked={!effectiveInventMetrics}
            disabled={disabled || isLocked}
            onCheckedChange={(checked) => {
              onSelectMode(!checked);
            }}
          />
        </div>
      </div>
    </SettingsFeatureCard>
  );
}

export default MetricSynthesisCard;
