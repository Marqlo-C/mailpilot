"use client";

import { BookOpen, ThumbsUp } from "lucide-react";
import { SettingsFeatureCard } from "@/components/ui/tactile/nested-settings-card";
import { WaveToggle } from "@/components/ui/tactile/wave-toggle";
import { OutboundStatusPill } from "./status-pill";
import { cn } from "@/lib/utils";

interface PageBudgetingCardProps {
  targetPageBudget: "auto" | "1" | "2";
  disabled: boolean;
  isLocked: boolean;
  isManualInclusion?: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onSelectBudget: (budget: "auto" | "1" | "2") => void;
}

export function PageBudgetingCard({
  targetPageBudget,
  disabled,
  isLocked,
  isManualInclusion = false,
  isExpanded,
  onToggle,
  onSelectBudget,
}: PageBudgetingCardProps) {
  const isAuto = targetPageBudget === "auto";
  const isCardLocked = isLocked;

  return (
    <SettingsFeatureCard
      logo={
        <div
          className={cn(
            "relative flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-background/80 p-1 shadow-sm",
            isCardLocked && "opacity-50"
          )}
          aria-hidden="true"
        >
          <div className="flex size-full items-center justify-center rounded-[0.6rem] bg-muted/30">
            <BookOpen
              className={cn(
                "size-5",
                isCardLocked ? "text-muted-foreground/60" : "text-muted-foreground"
              )}
            />
          </div>
        </div>
      }
      title="Target Page Length"
      subtitle="Set your resume length dynamically based on your experience, or lock the output to 1 or 2 pages."
      statusBadge={
        isLocked || isAuto ? (
          <OutboundStatusPill isRecommended={true}>Auto Length</OutboundStatusPill>
        ) : (
          <OutboundStatusPill isRecommended={false}>
            {targetPageBudget === "1" ? "Strict 1 Page" : "Strict 2 Pages"}
          </OutboundStatusPill>
        )
      }
      isExpanded={!isCardLocked && isExpanded}
      onToggle={onToggle}
      disabled={isCardLocked}
      curvedDivider
    >
      <div className="space-y-3">
        {/* Option 1: Automatic by Experience */}
        <div
          className={cn(
            "flex items-start justify-between gap-4 rounded-lg border p-3 transition-colors",
            isAuto
              ? "border-border/60 bg-card hover:border-border"
              : "border-border/40 bg-card/60"
          )}
        >
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <p
                className={cn(
                  "text-[13px] font-semibold tracking-tight transition-colors duration-150",
                  isAuto ? "text-foreground" : "text-muted-foreground"
                )}
              >
                Automatic by Experience
              </p>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border border-[#1ab5af]/30 bg-[#1ab5af]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#139a94] dark:border-[#1ab5af]/40 dark:bg-[#1ab5af]/25 dark:text-[#2dd4bf] shrink-0 transition-opacity duration-150",
                  isAuto ? "opacity-100" : "opacity-50"
                )}
              >
                <ThumbsUp className="size-3 shrink-0" aria-hidden="true" />
                Recommended
              </span>
            </div>
            <p
              className={cn(
                "text-xs leading-relaxed transition-colors duration-150",
                isAuto ? "text-muted-foreground" : "text-muted-foreground/60"
              )}
            >
              Targets 1 page for careers under 7 years, and expands to 2 pages for senior tenures (7+ years in the same field).
            </p>
          </div>
          <WaveToggle
            id="budget-auto-toggle"
            checked={isAuto}
            disabled={disabled || isCardLocked}
            onCheckedChange={(checked) =>
              onSelectBudget(checked ? "auto" : "1")
            }
          />
        </div>

        {/* Option 2: Fixed Page Limit */}
        <div
          className={cn(
            "flex flex-col gap-3 rounded-lg border p-3 transition-colors",
            !isAuto
              ? "border-border/60 bg-card hover:border-border"
              : "border-border/40 bg-card/60"
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5 min-w-0">
              <p
                className={cn(
                  "text-[13px] font-semibold tracking-tight transition-colors duration-150",
                  !isAuto ? "text-foreground" : "text-muted-foreground"
                )}
              >
                Fixed Page Limit
              </p>
              <p
                className={cn(
                  "text-xs leading-relaxed transition-colors duration-150",
                  !isAuto ? "text-muted-foreground" : "text-muted-foreground/60"
                )}
              >
                Enforces a strict page limit regardless of experience level or number of positions.
              </p>
            </div>
            <WaveToggle
              id="budget-manual-toggle"
              checked={!isAuto}
              disabled={disabled || isCardLocked}
              onCheckedChange={(checked) =>
                onSelectBudget(checked ? "1" : "auto")
              }
            />
          </div>

          {!isAuto && (
            <div className="flex items-center gap-2 pt-1 border-t border-border/40">
              <button
                type="button"
                disabled={disabled || isCardLocked}
                onClick={() => onSelectBudget("1")}
                className={cn(
                  "flex-1 rounded-md py-1.5 text-xs font-medium transition-colors border",
                  targetPageBudget === "1"
                    ? "bg-primary text-primary-foreground border-primary shadow-xs"
                    : "bg-muted/40 text-muted-foreground border-border/50 hover:bg-muted hover:text-foreground"
                )}
              >
                Strict 1 Page
              </button>
              <button
                type="button"
                disabled={disabled || isCardLocked}
                onClick={() => onSelectBudget("2")}
                className={cn(
                  "flex-1 rounded-md py-1.5 text-xs font-medium transition-colors border",
                  targetPageBudget === "2"
                    ? "bg-primary text-primary-foreground border-primary shadow-xs"
                    : "bg-muted/40 text-muted-foreground border-border/50 hover:bg-muted hover:text-foreground"
                )}
              >
                Strict 2 Pages
              </button>
            </div>
          )}
        </div>
      </div>
    </SettingsFeatureCard>
  );
}

export default PageBudgetingCard;
