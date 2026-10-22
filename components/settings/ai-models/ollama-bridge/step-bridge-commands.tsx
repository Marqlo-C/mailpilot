"use client";

import { Check, Copy, KeyRound, Loader2, ShieldUser } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SettingsStepCard } from "@/components/ui/nested-settings-card";
import { STEP_CARD_CTA_CLASSNAME } from "./step-getting-started";

export interface StepBridgeCommandsProps {
  isExpanded: boolean;
  onToggle: () => void;
  disabled: boolean;
  pending: boolean;
  hasSecret: boolean;
  accountEmail: string | null;
  macBridgeCommand: string;
  winBridgeCommand: string;
  copiedOsCommand: "mac" | "win" | null;
  onGenerateSecret: (isRegen: boolean) => void;
  onCopyOsCommand: (os: "mac" | "win") => void;
}

export function StepBridgeCommands({
  isExpanded,
  onToggle,
  disabled,
  pending,
  hasSecret,
  accountEmail,
  macBridgeCommand,
  winBridgeCommand,
  copiedOsCommand,
  onGenerateSecret,
  onCopyOsCommand,
}: StepBridgeCommandsProps) {
  return (
    <SettingsStepCard
      step={2}
      title="One-Click Bridge Commands:"
      isExpanded={isExpanded}
      onToggle={onToggle}
      curvedDivider
      actionButton={
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={STEP_CARD_CTA_CLASSNAME}
          disabled={disabled || pending}
          onClick={(e) => {
            e.stopPropagation();
            onGenerateSecret(hasSecret);
          }}
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : (
            <KeyRound className="size-3.5 text-muted-foreground" />
          )}
          <span>{hasSecret ? "Rotate Secret" : "Generate Secret"}</span>
        </Button>
      }
      footer={
        <div className="space-y-1">
          <p className="font-medium text-xs text-foreground flex items-center gap-1.5">
            <ShieldUser className="size-3.5 text-muted-foreground" />
            <span>Why rotating your secret matters</span>
          </p>
          <p className="text-[11px] text-muted-foreground leading-normal">
            Your secret acts like a private handshake between your personal
            machine and your Mail Pilot account. If you ever switch Wi-Fi
            networks, run Mail Pilot in a public workspace, or suspect your
            terminal was exposed, click Rotate Secret above to instantly revoke
            old tunnel tokens and lock down your connection.
          </p>
        </div>
      }
    >
      <div className="space-y-3.5 px-4 sm:px-6">
        {/* Step 2.1 instruction */}
        <div className="flex items-center gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 border border-primary/20 text-[10px] font-semibold text-primary">
            2.1
          </span>
          <span className="text-xs text-muted-foreground leading-relaxed">
            Copy the command for your operating system below, paste it into your
            terminal, and leave that window running in the background.
          </span>
        </div>

        {/* Side-by-side CLI command blocks */}
        <div className="mx-9 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* macOS / Linux Box */}
          <div className="rounded-lg border border-border bg-slate-950 p-3.5 text-slate-100 flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
              <span className="font-medium text-slate-300">macOS / Linux</span>
              <div className="flex items-center gap-1.5">
                <Badge
                  variant="outline"
                  className="text-[10px] text-slate-400 border-slate-700 bg-slate-900"
                >
                  bash / zsh
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={!hasSecret || !accountEmail}
                  onClick={() => onCopyOsCommand("mac")}
                  className="size-6 text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
                  aria-label="Copy macOS command"
                >
                  {copiedOsCommand === "mac" ? (
                    <Check className="size-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </Button>
              </div>
            </div>
            <code className="text-xs font-mono break-all text-teal-300 leading-relaxed select-all">
              {macBridgeCommand}
            </code>
          </div>

          {/* Windows Box */}
          <div className="rounded-lg border border-border bg-slate-950 p-3.5 text-slate-100 flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
              <span className="font-medium text-slate-300">Windows</span>
              <div className="flex items-center gap-1.5">
                <Badge
                  variant="outline"
                  className="text-[10px] text-slate-400 border-slate-700 bg-slate-900"
                >
                  PowerShell
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={!hasSecret || !accountEmail}
                  onClick={() => onCopyOsCommand("win")}
                  className="size-6 text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
                  aria-label="Copy Windows command"
                >
                  {copiedOsCommand === "win" ? (
                    <Check className="size-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </Button>
              </div>
            </div>
            <code className="text-xs font-mono break-all text-teal-300 leading-relaxed select-all">
              {winBridgeCommand}
            </code>
          </div>
        </div>
      </div>
    </SettingsStepCard>
  );
}
