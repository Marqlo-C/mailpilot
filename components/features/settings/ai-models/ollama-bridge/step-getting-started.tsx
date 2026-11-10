"use client";

import { Loader2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsStepCard } from "@/components/ui/tactile/nested-settings-card";

export const STEP_CARD_CTA_CLASSNAME =
  "h-8 w-[132px] shrink-0 gap-1.5 px-2.5 text-xs border-border/80 hover:bg-muted/60";

export interface StepGettingStartedProps {
  isExpanded: boolean;
  onToggle: () => void;
  checkingLocalOllama: boolean;
  onLaunchOrDownloadOllama: () => void;
}

export function StepGettingStarted({
  isExpanded,
  onToggle,
  checkingLocalOllama,
  onLaunchOrDownloadOllama,
}: StepGettingStartedProps) {
  return (
    <SettingsStepCard
      step={1}
      title="Getting Started with Ollama Bridge:"
      isExpanded={isExpanded}
      onToggle={onToggle}
      curvedDivider
      actionButton={
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={checkingLocalOllama}
          className={STEP_CARD_CTA_CLASSNAME}
          onClick={(e) => {
            e.stopPropagation();
            onLaunchOrDownloadOllama();
          }}
        >
          {checkingLocalOllama ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : (
            <Rocket className="size-3.5 text-muted-foreground" />
          )}
          <span>{checkingLocalOllama ? "Launching…" : "Launch Ollama"}</span>
        </Button>
      }
    >
      <ol className="space-y-3 px-4 sm:px-6">
        <li className="flex items-center gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 border border-primary/20 text-[10px] font-semibold text-primary">
            1.1
          </span>
          <span className="text-xs text-muted-foreground leading-relaxed">
            Install and launch the official{" "}
            <button
              type="button"
              disabled={checkingLocalOllama}
              onClick={() => onLaunchOrDownloadOllama()}
              className="inline text-teal-600 dark:text-teal-400 underline underline-offset-2 hover:text-teal-500 font-normal cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Ollama desktop app
            </button>{" "}
            (you can install this on any machine and use it remotely from another
            computer).
          </span>
        </li>
        <li className="flex items-center gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 border border-primary/20 text-[10px] font-semibold text-primary">
            1.2
          </span>
          <span className="text-xs text-muted-foreground leading-relaxed">
            Open your terminal and run{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
              ollama run llama3.1:8b
            </code>
            . Mail Pilot is calibrated for Llama 3.1 (8B) to reliably parse and
            organize your emails, though other capable open models like{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
              gemma2:27b
            </code>{" "}
            also work smoothly if you prefer.
          </span>
        </li>
      </ol>
    </SettingsStepCard>
  );
}
