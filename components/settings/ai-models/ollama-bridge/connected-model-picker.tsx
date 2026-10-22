"use client";

import { ChevronDown, Cpu, Globe, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SettingsStatusCard } from "@/components/ui/nested-settings-card";
import { cn } from "@/lib/utils";

export type ConnectionStatus =
  | "connected"
  | "waiting"
  | "offline"
  | "error"
  | "checking";

export interface ConnectedModelPickerProps {
  mounted: boolean;
  isConnected: boolean;
  displayStatus: ConnectionStatus;
  url: string;
  statusMessage: string | null;
  models: string[];
  selectOptions: string[];
  selectedModel: string;
  useOllama: boolean;
  disabled: boolean;
  verifying: boolean;
  onRefreshModels: () => void;
  onSelectModel: (model: string) => void;
}

export function ConnectedModelPicker({
  mounted,
  isConnected,
  displayStatus,
  url,
  statusMessage,
  models,
  selectOptions,
  selectedModel,
  useOllama,
  disabled,
  verifying,
  onRefreshModels,
  onSelectModel,
}: ConnectedModelPickerProps) {
  return (
    <SettingsStatusCard
      className="mx-9"
      statusDot={
        <span
          className={cn(
            "relative flex h-2.5 w-2.5 rounded-full shrink-0",
            isConnected
              ? "bg-emerald-500"
              : displayStatus === "checking"
                ? "bg-teal-500"
                : "bg-amber-500"
          )}
        >
          <span
            className={cn(
              "absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping",
              isConnected
                ? "bg-emerald-400"
                : displayStatus === "checking"
                  ? "bg-teal-400"
                  : "bg-amber-400"
            )}
          />
        </span>
      }
      title={
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-foreground truncate">
            {isConnected
              ? "Local Ollama Connected & Active"
              : displayStatus === "checking"
                ? "Verifying Bridge Connection…"
                : "Waiting for bridge connection"}
          </span>
          {isConnected && (
            <Badge
              variant="outline"
              className="h-4.5 px-1.5 text-[10px] font-medium border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            >
              Active
            </Badge>
          )}
        </div>
      }
      subtitle={
        <div className="space-y-1">
          <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-1.5">
            {isConnected ? (
              <>
                <span>Tunnel registered and listening via</span>
                <code className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/70 bg-muted/50 px-2 py-0.5 font-mono text-[11px] font-normal text-foreground">
                  <Globe className="size-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{url.trim() || "local endpoint"}</span>
                </code>
              </>
            ) : (
              <span>Run either command above to connect your local GPU/CPU</span>
            )}
          </div>
          {statusMessage && !statusMessage.toLowerCase().includes("model") && (
            <p className="text-[11px] text-muted-foreground">{statusMessage}</p>
          )}
        </div>
      }
      badge={
        isConnected ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-foreground">
              <Cpu className="size-3 text-primary" />
              <span>
                {models.length > 0
                  ? `${models.length} model${models.length === 1 ? "" : "s"} available`
                  : statusMessage ||
                    `${selectOptions.length} model${selectOptions.length === 1 ? "" : "s"} available`}
              </span>
            </span>
          </div>
        ) : null
      }
      curvedDivider={Boolean(mounted && isConnected)}
    >
      {mounted && isConnected ? (
        <div className="space-y-3 transition-all animate-in fade-in-50 duration-200">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <Label
                htmlFor="ollama-model"
                className="text-xs font-semibold tracking-tight text-foreground cursor-pointer"
              >
                Active local model
              </Label>
              <p className="text-[11px] text-muted-foreground leading-normal">
                {useOllama
                  ? "Requests for this account run against this model."
                  : "Requests will run against this model when Local Ollama is enabled."}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 gap-1.5 text-xs border-border/80 hover:bg-background shadow-2xs"
              disabled={disabled || verifying}
              onClick={onRefreshModels}
            >
              {verifying ? (
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              ) : (
                <RefreshCw className="size-3.5 text-muted-foreground" />
              )}
              <span>Refresh</span>
            </Button>
          </div>

          {selectOptions.length > 0 ? (
            <div className="relative">
              <select
                id="ollama-model"
                className="flex h-9.5 w-full appearance-none rounded-lg border border-border/80 bg-background px-3 py-2 pr-9 text-xs font-mono font-medium shadow-2xs transition-colors outline-none ring-offset-background focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={
                  selectOptions.includes(selectedModel)
                    ? selectedModel
                    : selectOptions[0]
                }
                disabled={disabled}
                onChange={(e) => onSelectModel(e.target.value)}
              >
                {selectOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/70" />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No models returned. Click Refresh.
            </p>
          )}
        </div>
      ) : null}
    </SettingsStatusCard>
  );
}
