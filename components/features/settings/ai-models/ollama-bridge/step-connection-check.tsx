"use client";

import { Loader2, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsStepCard } from "@/components/ui/tactile/nested-settings-card";
import {
  ConnectedModelPicker,
  type ConnectionStatus,
} from "./connected-model-picker";
import { STEP_CARD_CTA_CLASSNAME } from "./step-getting-started";

export interface StepConnectionCheckProps {
  isExpanded: boolean;
  onToggle: () => void;
  disabled: boolean;
  verifying: boolean;
  mounted: boolean;
  isConnected: boolean;
  displayStatus: ConnectionStatus;
  url: string;
  statusMessage: string | null;
  models: string[];
  selectOptions: string[];
  selectedModel: string;
  useOllama: boolean;
  onCheckSignal: () => void;
  onRefreshModels: () => void;
  onSelectModel: (model: string) => void;
}

export function StepConnectionCheck({
  isExpanded,
  onToggle,
  disabled,
  verifying,
  mounted,
  isConnected,
  displayStatus,
  url,
  statusMessage,
  models,
  selectOptions,
  selectedModel,
  useOllama,
  onCheckSignal,
  onRefreshModels,
  onSelectModel,
}: StepConnectionCheckProps) {
  return (
    <SettingsStepCard
      step={3}
      title="Checking Your Connection:"
      isExpanded={isExpanded}
      onToggle={onToggle}
      curvedDivider
      actionButton={
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={STEP_CARD_CTA_CLASSNAME}
          disabled={disabled || verifying}
          onClick={(e) => {
            e.stopPropagation();
            onCheckSignal();
          }}
        >
          {verifying ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : (
            <Wifi className="size-3.5 text-muted-foreground" />
          )}
          <span>{verifying ? "Checking..." : "Check Signal"}</span>
        </Button>
      }
    >
      <div className="space-y-3.5 px-4 sm:px-6">
        {/* Step 3.1 instruction */}
        <div className="flex items-center gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 border border-primary/20 text-[10px] font-semibold text-primary">
            3.1
          </span>
          <span className="text-xs text-muted-foreground leading-relaxed">
            With your bridge terminal running in the background, click Check
            Signal above. Once connected, your active model options will appear
            below.
          </span>
        </div>

        {/* Unified Bridge Status & Model Card (Level 4) */}
        <ConnectedModelPicker
          mounted={mounted}
          isConnected={isConnected}
          displayStatus={displayStatus}
          url={url}
          statusMessage={statusMessage}
          models={models}
          selectOptions={selectOptions}
          selectedModel={selectedModel}
          useOllama={useOllama}
          disabled={disabled}
          verifying={verifying}
          onRefreshModels={onRefreshModels}
          onSelectModel={onSelectModel}
        />
      </div>
    </SettingsStepCard>
  );
}
