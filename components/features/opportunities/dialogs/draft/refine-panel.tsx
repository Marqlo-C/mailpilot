import React from "react";
import {
  BotMessageSquare,
  RotateCcw,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CancelTaskButton } from "@/components/ui/composites/cancel-task-button";
import { FieldTrailingButton } from "@/components/ui/tactile/text-field";
import { SegmentedControl } from "@/components/ui/tactile/segmented-tabs";

const ACE_TARGET_OPTIONS = [
  { value: "email" as const, label: "Email" },
  { value: "resume" as const, label: "Resume" },
];

export function RefinePanel({
  attachResume,
  effectiveRefineTarget,
  setRefineTarget,
  aceBusy,
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
  /** True while any Ace email/resume generation is running. */
  aceBusy: boolean;
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
    <div className="flex flex-none flex-wrap items-center gap-2 bg-muted/20 px-5 py-1.5 sm:flex-nowrap">
      {attachResume ? (
        <SegmentedControl
          size="sm"
          label="Ace AI target"
          value={effectiveRefineTarget}
          onChange={setRefineTarget}
          options={ACE_TARGET_OPTIONS}
          disabled={aceBusy}
          className="shrink-0"
        />
      ) : null}

      <Input
        id="opp-ace-refine"
        leadingIcon={BotMessageSquare}
        // Optical match to Search — glyph reads smaller in the same size-4 box.
        leadingIconClassName="size-[18px]"
        clearable={!refiningTarget}
        onClear={() => setRefinePrompt("")}
        placeholder={refinePlaceholder}
        value={refinePrompt}
        onChange={(e) => setRefinePrompt(e.target.value)}
        disabled={aceBusy}
        className="min-w-[12rem] flex-1"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleUnifiedRefine();
          }
        }}
        trailing={
          refiningTarget ? (
            <CancelTaskButton
              tone="light"
              title="Cancel refine"
              onCancel={onCancelRefine}
            />
          ) : (
            <FieldTrailingButton
              aria-label="Refine"
              disabled={refineDisabled}
              onClick={handleUnifiedRefine}
            >
              <WandSparkles className="size-3.5" aria-hidden />
            </FieldTrailingButton>
          )
        }
      />

      {regeneratingTarget ? (
        <div className="inline-flex h-8 shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 gap-1.5 px-2.5"
            disabled
          >
            {showGenerateResume ? (
              <Sparkles className="h-3.5 w-3.5" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            {primaryActionLabel}
          </Button>
          <CancelTaskButton
            tone="light"
            title={
              showGenerateResume ? "Stop Creating" : "Stop Rewriting"
            }
            onCancel={onCancelRegenerate}
          />
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1.5 px-2.5"
          disabled={aceBusy}
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
    </div>
  );
}
