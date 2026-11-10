import React from "react";
import { Loader2, RotateCcw, Sparkles, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CancelTaskButton } from "@/components/ui/composites/cancel-task-button";
import { cn } from "@/lib/utils";

export function RefinePanel({
  attachResume,
  effectiveRefineTarget,
  setRefineTarget,
  busy,
  refinePlaceholder,
  refinePrompt,
  setRefinePrompt,
  handleUnifiedRefine,
  handleUnifiedRegenerate,
  regeneratingTarget,
  refiningTarget,
  primaryActionLabel,
  primaryActionTitle,
  showGenerateResume,
  refineDisabled,
  onCancelRegenerate,
  onCancelRefine,
}: {
  attachResume: boolean;
  effectiveRefineTarget: "email" | "resume";
  setRefineTarget: (target: "email" | "resume") => void;
  busy: boolean;
  refinePlaceholder: string;
  refinePrompt: string;
  setRefinePrompt: (val: string) => void;
  handleUnifiedRefine: () => void;
  handleUnifiedRegenerate: () => void;
  regeneratingTarget: boolean;
  refiningTarget: boolean;
  primaryActionLabel: string;
  primaryActionTitle?: string;
  showGenerateResume: boolean;
  refineDisabled: boolean;
  onCancelRegenerate: () => void;
  onCancelRefine: () => void;
}) {
  return (
    <div className="flex flex-none items-center gap-3 border-t bg-muted/20 px-6 py-2">
      {attachResume ? (
        <div
          className="inline-flex h-8 shrink-0 items-center rounded-md border border-border/60 bg-card p-0.5"
          role="group"
          aria-label="Ace AI target"
        >
          <button
            type="button"
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              effectiveRefineTarget === "email"
                ? "bg-muted text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setRefineTarget("email")}
            disabled={busy}
          >
            Email
          </button>
          <button
            type="button"
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              effectiveRefineTarget === "resume"
                ? "bg-muted text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setRefineTarget("resume")}
            disabled={busy}
          >
            Resume
          </button>
        </div>
      ) : null}

      <Input
        id="opp-ace-refine"
        placeholder={refinePlaceholder}
        value={refinePrompt}
        onChange={(e) => setRefinePrompt(e.target.value)}
        disabled={busy}
        className="h-8 flex-1 bg-card text-xs"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleUnifiedRefine();
          }
        }}
      />

      {regeneratingTarget ? (
        <div className="inline-flex h-8 shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2.5 text-xs"
            disabled
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {primaryActionLabel}
          </Button>
          <CancelTaskButton
            title={
              showGenerateResume
                ? "Cancel generation"
                : "Cancel regeneration"
            }
            onCancel={onCancelRegenerate}
          />
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 gap-1 px-2.5 text-xs"
          disabled={busy}
          onClick={handleUnifiedRegenerate}
          title={primaryActionTitle}
        >
          {showGenerateResume ? (
            <Sparkles className="h-3.5 w-3.5" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          {primaryActionLabel}
        </Button>
      )}

      {refiningTarget ? (
        <div className="inline-flex h-8 shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-8 gap-1 px-2.5 text-xs"
            disabled
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Refine
          </Button>
          <CancelTaskButton
            title="Cancel refine"
            onCancel={onCancelRefine}
          />
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-8 shrink-0 gap-1 px-2.5 text-xs"
          disabled={refineDisabled}
          onClick={handleUnifiedRefine}
        >
          <WandSparkles className="h-3.5 w-3.5" />
          Refine
        </Button>
      )}
    </div>
  );
}
