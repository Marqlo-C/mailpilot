"use client";

import { CompanyLogo } from "@/components/ui/company-logo";
import { SettingsFeatureCard } from "@/components/ui/tactile/nested-settings-card";
import type { ConnectionStatus } from "./connected-model-picker";
import { StepGettingStarted } from "./step-getting-started";
import { StepBridgeCommands } from "./step-bridge-commands";
import { StepConnectionCheck } from "./step-connection-check";

export interface OllamaBridgeCardProps {
  mounted: boolean;
  useOllama: boolean;
  isConnected: boolean;
  displayStatus: ConnectionStatus;
  ollamaSubOpen: boolean;
  step1Open: boolean;
  step2Open: boolean;
  step3Open: boolean;
  onToggleOllamaSub: () => void;
  onToggleStep1: () => void;
  onToggleStep2: () => void;
  onToggleStep3: () => void;
  checkingLocalOllama: boolean;
  onLaunchOrDownloadOllama: () => void;
  disabled: boolean;
  pending: boolean;
  hasSecret: boolean;
  accountEmail: string | null;
  macBridgeCommand: string;
  winBridgeCommand: string;
  copiedOsCommand: "mac" | "win" | null;
  onGenerateSecret: (isRegen: boolean) => void;
  onCopyOsCommand: (os: "mac" | "win") => void;
  verifying: boolean;
  url: string;
  statusMessage: string | null;
  models: string[];
  selectOptions: string[];
  selectedModel: string;
  onCheckSignal: () => void;
  onRefreshModels: () => void;
  onSelectModel: (model: string) => void;
}

export function OllamaBridgeCard({
  mounted,
  useOllama,
  isConnected,
  displayStatus,
  ollamaSubOpen,
  step1Open,
  step2Open,
  step3Open,
  onToggleOllamaSub,
  onToggleStep1,
  onToggleStep2,
  onToggleStep3,
  checkingLocalOllama,
  onLaunchOrDownloadOllama,
  disabled,
  pending,
  hasSecret,
  accountEmail,
  macBridgeCommand,
  winBridgeCommand,
  copiedOsCommand,
  onGenerateSecret,
  onCopyOsCommand,
  verifying,
  url,
  statusMessage,
  models,
  selectOptions,
  selectedModel,
  onCheckSignal,
  onRefreshModels,
  onSelectModel,
}: OllamaBridgeCardProps) {
  return (
    <SettingsFeatureCard
      logo={
        <CompanyLogo
          src="/icons/Ollama Lucide Icon.svg"
          name="Ollama"
          size="lg"
          imageClassName="object-contain p-1 opacity-70 dark:invert"
        />
      }
      title="Local Ollama Bridge"
      subtitle="Zero-token-cost processing powered by your local GPU or CPU."
      statusBadge={
        isConnected ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Connected
          </span>
        ) : useOllama ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400 shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Bridge Ready
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground shrink-0">
            Disabled
          </span>
        )
      }
      isExpanded={useOllama && ollamaSubOpen}
      onToggle={onToggleOllamaSub}
      disabled={!useOllama}
      curvedDivider
    >
      {!mounted ? (
        <div className="text-xs text-muted-foreground">
          Loading Ollama settings…
        </div>
      ) : (
        <>
          <StepGettingStarted
            isExpanded={step1Open}
            onToggle={onToggleStep1}
            checkingLocalOllama={checkingLocalOllama}
            onLaunchOrDownloadOllama={onLaunchOrDownloadOllama}
          />

          <StepBridgeCommands
            isExpanded={step2Open}
            onToggle={onToggleStep2}
            disabled={disabled}
            pending={pending}
            hasSecret={hasSecret}
            accountEmail={accountEmail}
            macBridgeCommand={macBridgeCommand}
            winBridgeCommand={winBridgeCommand}
            copiedOsCommand={copiedOsCommand}
            onGenerateSecret={onGenerateSecret}
            onCopyOsCommand={onCopyOsCommand}
          />

          <StepConnectionCheck
            isExpanded={step3Open}
            onToggle={onToggleStep3}
            disabled={disabled}
            verifying={verifying}
            mounted={mounted}
            isConnected={isConnected}
            displayStatus={displayStatus}
            url={url}
            statusMessage={statusMessage}
            models={models}
            selectOptions={selectOptions}
            selectedModel={selectedModel}
            useOllama={useOllama}
            onCheckSignal={onCheckSignal}
            onRefreshModels={onRefreshModels}
            onSelectModel={onSelectModel}
          />
        </>
      )}
    </SettingsFeatureCard>
  );
}
export default OllamaBridgeCard;
