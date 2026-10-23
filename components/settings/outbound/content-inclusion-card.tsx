"use client";

import { CheckSquare, ThumbsUp } from "lucide-react";
import { SettingsFeatureCard } from "@/components/ui/tactile/nested-settings-card";
import { WaveToggle } from "@/components/ui/tactile/wave-toggle";
import { OutboundStatusPill } from "./status-pill";
import { cn } from "@/lib/utils";

interface ContentInclusionCardProps {
  contentInclusionMode: "AI_OPTIMAL" | "MANUAL";
  disabled: boolean;
  isLocked: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onSelectMode: (mode: "AI_OPTIMAL" | "MANUAL") => void;
}

export function ContentInclusionCard({
  contentInclusionMode,
  disabled,
  isLocked,
  isExpanded,
  onToggle,
  onSelectMode,
}: ContentInclusionCardProps) {
  const isAi = contentInclusionMode === "AI_OPTIMAL";

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
            <CheckSquare
              className={cn(
                "size-5",
                isLocked ? "text-muted-foreground/60" : "text-muted-foreground"
              )}
            />
          </div>
        </div>
      }
      title="Content Selection"
      subtitle="Choose whether AI selects your most relevant roles and highlights, or follows your manual section blueprint."
      statusBadge={
        isLocked || isAi ? (
          <OutboundStatusPill isRecommended={true}>AI Highlights</OutboundStatusPill>
        ) : (
          <OutboundStatusPill isRecommended={false}>Manual Selection</OutboundStatusPill>
        )
      }
      isExpanded={!isLocked && isExpanded}
      onToggle={onToggle}
      disabled={isLocked}
      curvedDivider
    >
      <div className="space-y-3">
        {/* Option 1: AI Role-Targeted Highlights */}
        <div
          className={cn(
            "flex items-start justify-between gap-4 rounded-lg border p-3 transition-colors",
            isAi
              ? "border-border/60 bg-card hover:border-border"
              : "border-border/40 bg-card/60"
          )}
        >
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <p
                className={cn(
                  "text-[13px] font-semibold tracking-tight transition-colors duration-150",
                  isAi ? "text-foreground" : "text-muted-foreground"
                )}
              >
                Role-Targeted Highlights
              </p>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border border-[#1ab5af]/30 bg-[#1ab5af]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#139a94] dark:border-[#1ab5af]/40 dark:bg-[#1ab5af]/25 dark:text-[#2dd4bf] shrink-0 transition-opacity duration-150",
                  isAi ? "opacity-100" : "opacity-50"
                )}
              >
                <ThumbsUp className="size-3 shrink-0" aria-hidden="true" />
                Recommended
              </span>
            </div>
            <p
              className={cn(
                "text-xs leading-relaxed transition-colors duration-150",
                isAi ? "text-muted-foreground" : "text-muted-foreground/60"
              )}
            >
              Selects the roles that best apply to the target job, and highlights your top 3–5 achievements within each.
            </p>
          </div>
          <WaveToggle
            id="content-ai-toggle"
            checked={isAi}
            disabled={disabled || isLocked}
            onCheckedChange={(checked) =>
              onSelectMode(checked ? "AI_OPTIMAL" : "MANUAL")
            }
          />
        </div>

        {/* Option 2: Manual Content Selection */}
        <div
          className={cn(
            "flex items-start justify-between gap-4 rounded-lg border p-3 transition-colors",
            !isAi
              ? "border-border/60 bg-card hover:border-border"
              : "border-border/40 bg-card/60"
          )}
        >
          <div className="space-y-0.5 min-w-0">
            <p
              className={cn(
                "text-[13px] font-semibold tracking-tight transition-colors duration-150",
                !isAi ? "text-foreground" : "text-muted-foreground"
              )}
            >
              Manual Content Selection
            </p>
            <p
              className={cn(
                "text-xs leading-relaxed transition-colors duration-150",
                !isAi ? "text-muted-foreground" : "text-muted-foreground/60"
              )}
            >
              Guarantees your chosen blueprint sections appear, while AI tailors the content within them.
            </p>
          </div>
          <WaveToggle
            id="content-manual-toggle"
            checked={!isAi}
            disabled={disabled || isLocked}
            onCheckedChange={(checked) =>
              onSelectMode(checked ? "MANUAL" : "AI_OPTIMAL")
            }
          />
        </div>
      </div>
    </SettingsFeatureCard>
  );
}

export default ContentInclusionCard;
