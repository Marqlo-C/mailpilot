"use client";

import { CircleGauge, FlaskConical, ThumbsUp } from "lucide-react";
import { SettingsFeatureCard } from "@/components/ui/tactile/nested-settings-card";
import { WaveToggle } from "@/components/ui/tactile/wave-toggle";
import { OutboundStatusPill } from "./status-pill";
import { cn } from "@/lib/utils";

interface MetricSynthesisCardProps {
  inventMetrics: boolean;
  disabled: boolean;
  isLocked: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onSelectMode: (inventMetrics: boolean) => void;
}

export function MetricSynthesisCard({
  inventMetrics,
  disabled,
  isLocked,
  isExpanded,
  onToggle,
  onSelectMode,
}: MetricSynthesisCardProps) {
  return (
    <SettingsFeatureCard
      logo={
        <div
          className={cn(
            "relative flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-background/80 p-1 shadow-sm",
            isLocked && "opacity-50"
          )}
          aria-hidden="true"
        >
          <div className="flex size-full items-center justify-center rounded-[0.6rem] bg-muted/30">
            <CircleGauge
              className={cn(
                "size-5",
                isLocked ? "text-muted-foreground/60" : "text-muted-foreground"
              )}
            />
          </div>
        </div>
      }
      title="Impact Metrics"
      subtitle="Decide whether AI adds realistic metric estimates when your original bullets don't include numbers."
      statusBadge={
        isLocked || inventMetrics ? (
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
        {/* Toggle Option 1: AI Metric Estimates */}
        <div
          className={cn(
            "flex items-start justify-between gap-4 rounded-lg border p-3 transition-colors",
            inventMetrics
              ? "border-border/60 bg-card hover:border-border"
              : "border-border/40 bg-card/60"
          )}
        >
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <p
                className={cn(
                  "text-[13px] font-semibold tracking-tight transition-colors duration-150",
                  inventMetrics ? "text-foreground" : "text-muted-foreground"
                )}
              >
                Smart Metric Estimates
              </p>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border border-[#78486c]/20 bg-[#78486c]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#78486c] dark:border-[#78486c]/40 dark:bg-[#78486c]/20 dark:text-[#e49ecb] shrink-0 transition-opacity duration-150",
                  inventMetrics ? "opacity-100" : "opacity-50"
                )}
              >
                <FlaskConical className="size-3 shrink-0" aria-hidden="true" />
                Experimental
              </span>
            </div>
            <p
              className={cn(
                "text-xs leading-relaxed transition-colors duration-150",
                inventMetrics
                  ? "text-muted-foreground"
                  : "text-muted-foreground/60"
              )}
            >
              Adds realistic numbers for scale, efficiency, and impact based on your role and seniority.
            </p>
          </div>
          <WaveToggle
            id="metric-ai-toggle"
            checked={inventMetrics}
            disabled={disabled || isLocked}
            onCheckedChange={(checked) => onSelectMode(checked)}
          />
        </div>

        {/* Toggle Option 2: Verified Facts */}
        <div
          className={cn(
            "flex items-start justify-between gap-4 rounded-lg border p-3 transition-colors",
            !inventMetrics
              ? "border-border/60 bg-card hover:border-border"
              : "border-border/40 bg-card/60"
          )}
        >
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <p
                className={cn(
                  "text-[13px] font-semibold tracking-tight transition-colors duration-150",
                  !inventMetrics ? "text-foreground" : "text-muted-foreground"
                )}
              >
                Verified Facts
              </p>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border border-[#1ab5af]/30 bg-[#1ab5af]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#139a94] dark:border-[#1ab5af]/40 dark:bg-[#1ab5af]/25 dark:text-[#2dd4bf] shrink-0 transition-opacity duration-150",
                  !inventMetrics ? "opacity-100" : "opacity-50"
                )}
              >
                <ThumbsUp className="size-3 shrink-0" aria-hidden="true" />
                Recommended
              </span>
            </div>
            <p
              className={cn(
                "text-xs leading-relaxed transition-colors duration-150",
                !inventMetrics
                  ? "text-muted-foreground"
                  : "text-muted-foreground/60"
              )}
            >
              Never adds estimated numbers. Keeps your original wording focused on what you accomplished and the tools you used.
            </p>
          </div>
          <WaveToggle
            id="metric-strict-toggle"
            checked={!inventMetrics}
            disabled={disabled || isLocked}
            onCheckedChange={(checked) => onSelectMode(!checked)}
          />
        </div>
      </div>
    </SettingsFeatureCard>
  );
}

export default MetricSynthesisCard;
