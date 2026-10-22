"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  Cloud,
  Cpu,
  KeyRound,
  Loader2,
  Redo2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  clearCustomLlmKey,
  saveCustomLlmKey,
  updateRule,
} from "@/app/actions/settings";
import {
  CLOUD_LLM_PROVIDERS,
  type CloudLlmProvider,
  PROVIDER_ENDPOINTS,
} from "@/lib/llm/provider.ssot";
import { SETTINGS_CARD_CLASSNAME } from "@/components/settings/settings-chrome";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  SettingsFeatureCard,
  SettingsSectionCard,
} from "@/components/ui/nested-settings-card";
import { WaveToggle } from "@/components/ui/wave-toggle";
import { PRIMARY_ACTION_BTN_CLASSNAME } from "@/components/ui/primary-action-btn";
import { SECONDARY_ACTION_BTN_CLASSNAME } from "@/components/ui/secondary-action-btn";
import { cn } from "@/lib/utils";

const PROVIDER_LABELS: Record<CloudLlmProvider, string> = {
  OPENROUTER: "OpenRouter (Recommended / Multi-Model)",
  OPENAI: "OpenAI (GPT-4o mini, GPT-4o)",
  GROQ: "Groq (Llama 3.3 70B)",
  DEEPSEEK: "DeepSeek (DeepSeek V3 / R1)",
  ANTHROPIC: "Anthropic (Claude 3.5 Haiku / Sonnet)",
  GEMINI: "Google Gemini (Gemini 2.5 Flash)",
};

function resolveScopedModelInput(
  provider: CloudLlmProvider,
  model: string | null | undefined,
  modelProvider: CloudLlmProvider | null | undefined
): string {
  const trimmed = model?.trim() ?? "";
  if (!trimmed) return "";
  if (modelProvider && modelProvider !== provider) return "";
  return trimmed;
}

export interface CloudProviderCardProps {
  accountId: string | null;
  allowCloudFallback?: boolean;
  cloudProvider?: CloudLlmProvider;
  cloudModel?: string | null;
  cloudModelProvider?: CloudLlmProvider | null;
  maskedApiKey?: string | null;
}

export function CloudProviderCard({
  accountId,
  allowCloudFallback: initialAllowCloudFallback = false,
  cloudProvider: initialCloudProvider = "OPENROUTER",
  cloudModel: initialCloudModel = null,
  cloudModelProvider: initialCloudModelProvider = null,
  maskedApiKey: initialMaskedApiKey = null,
}: CloudProviderCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [allowCloudFallback, setAllowCloudFallback] = useState(
    initialAllowCloudFallback
  );
  const [cloudSubOpen, setCloudSubOpen] = useState<boolean>(
    initialAllowCloudFallback
  );
  const [cloudProvider, setCloudProvider] = useState<CloudLlmProvider>(
    initialCloudProvider ?? "OPENROUTER"
  );
  const [savedCloudModel, setSavedCloudModel] = useState<string | null>(
    initialCloudModel ?? null
  );
  const [savedCloudModelProvider, setSavedCloudModelProvider] =
    useState<CloudLlmProvider | null>(
      initialCloudModelProvider ??
        (initialCloudModel ? (initialCloudProvider ?? "OPENROUTER") : null)
    );
  const [cloudModelOverride, setCloudModelOverride] = useState(() =>
    resolveScopedModelInput(
      initialCloudProvider ?? "OPENROUTER",
      initialCloudModel,
      initialCloudModelProvider ??
        (initialCloudModel ? (initialCloudProvider ?? "OPENROUTER") : null)
    )
  );
  const [maskedApiKey, setMaskedApiKey] = useState<string | null>(
    initialMaskedApiKey ?? null
  );
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [isEditingKey, setIsEditingKey] = useState(!initialMaskedApiKey);

  const disabled = !accountId || pending;
  const activeProviderSavedModel = resolveScopedModelInput(
    cloudProvider,
    savedCloudModel,
    savedCloudModelProvider
  );

  useEffect(() => {
    setAllowCloudFallback(initialAllowCloudFallback);
    if (!initialAllowCloudFallback) {
      setCloudSubOpen(false);
    }
  }, [initialAllowCloudFallback]);

  useEffect(() => {
    const nextProvider = initialCloudProvider ?? "OPENROUTER";
    const nextModel = initialCloudModel ?? null;
    const nextModelProvider =
      initialCloudModelProvider ?? (nextModel ? nextProvider : null);
    setCloudProvider(nextProvider);
    setSavedCloudModel(nextModel);
    setSavedCloudModelProvider(nextModelProvider);
    setCloudModelOverride(
      resolveScopedModelInput(nextProvider, nextModel, nextModelProvider)
    );
  }, [initialCloudProvider, initialCloudModel, initialCloudModelProvider]);

  useEffect(() => {
    setMaskedApiKey(initialMaskedApiKey ?? null);
    if (!initialMaskedApiKey) {
      setIsEditingKey(true);
    }
  }, [initialMaskedApiKey]);

  function handleSaveModelOverride() {
    if (!accountId) return;
    const nextModel = cloudModelOverride.trim() || null;
    const nextModelProvider = nextModel ? cloudProvider : null;
    startTransition(async () => {
      const result = await updateRule(accountId, "cloudModel", nextModel);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSavedCloudModel(nextModel);
      setSavedCloudModelProvider(nextModelProvider);
      toast.success("Model override updated");
      router.refresh();
    });
  }

  function handleSaveKey() {
    if (!accountId) return;
    const key = apiKeyInput.trim();
    if (!key) {
      toast.error("Please enter an API key");
      return;
    }

    const nextModel = cloudModelOverride.trim() || null;

    startTransition(async () => {
      const result = await saveCustomLlmKey(accountId, {
        provider: cloudProvider,
        model: nextModel,
        apiKey: key,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setSavedCloudModel(nextModel);
      setSavedCloudModelProvider(nextModel ? cloudProvider : null);
      setMaskedApiKey(result.data?.maskedApiKey ?? null);
      setApiKeyInput("");
      setIsEditingKey(false);
      toast.success(`${cloudProvider} API key encrypted and saved`);
      router.refresh();
    });
  }

  function handleClearKey() {
    if (!accountId) return;
    startTransition(async () => {
      const result = await clearCustomLlmKey(accountId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setMaskedApiKey(null);
      setSavedCloudModel(null);
      setSavedCloudModelProvider(null);
      setCloudModelOverride("");
      setApiKeyInput("");
      setIsEditingKey(true);
      toast.success("API key cleared");
      router.refresh();
    });
  }

  return (
    <SettingsSectionCard
      className={SETTINGS_CARD_CLASSNAME}
      icon={
        <Cloud
          className="size-8 -translate-y-0.5 scale-[1.15] origin-center text-primary shrink-0"
          aria-hidden="true"
        />
      }
      title="Cloud AI Provider & Credentials"
      subtitle="Connect your own cloud API key as an automatic backup if local Ollama times out or goes offline. Your keys are encrypted and stored securely."
      toggle={
        <WaveToggle
          id="allow-cloud-fallback"
          checked={allowCloudFallback}
          disabled={disabled}
          onCheckedChange={(checked) => {
            if (!accountId) return;
            setAllowCloudFallback(checked);
            setCloudSubOpen(checked);
            startTransition(async () => {
              const result = await updateRule(
                accountId,
                "allowCloudFallback",
                checked
              );
              if (!result.ok) {
                setAllowCloudFallback(!checked);
                setCloudSubOpen(!checked);
                toast.error(result.error);
                return;
              }
              toast.success(
                checked
                  ? "Cloud credentials enabled"
                  : "Cloud credentials disabled"
              );
              router.refresh();
            });
          }}
        />
      }
      curvedDivider
    >
      {!accountId && (
        <p className="text-sm text-muted-foreground">
          Connect an account to configure cloud credentials.
        </p>
      )}

      {/* Level 2 Feature Card: Main Cloud Providers (BYOK) */}
      <SettingsFeatureCard
        logo={
          <div
            className="relative flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-background/80 p-1 shadow-sm"
            aria-hidden="true"
          >
            <div className="flex size-full items-center justify-center rounded-[0.6rem] bg-muted/30">
              <Sparkles className="size-5 text-foreground" />
            </div>
          </div>
        }
        title="Main Cloud Providers (BYOK)"
        subtitle="Configure primary or failover API keys for OpenRouter, OpenAI, Groq, Anthropic, DeepSeek, or Gemini."
        statusBadge={
          !allowCloudFallback ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground shrink-0">
              Disabled
            </span>
          ) : maskedApiKey ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 shrink-0">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Key Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400 shrink-0">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Key Needed
            </span>
          )
        }
        isExpanded={allowCloudFallback && cloudSubOpen}
        onToggle={() => {
          if (!allowCloudFallback) return;
          setCloudSubOpen((prev) => !prev);
        }}
        disabled={!allowCloudFallback}
        curvedDivider
      >
        <div className="space-y-4">
          {/* Provider Selector */}
          <div className="space-y-1.5">
            <div className="space-y-0.5 pl-1">
              <Label
                htmlFor="cloud-provider"
                className="text-xs font-semibold tracking-tight text-foreground cursor-pointer"
              >
                Cloud Provider
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Default endpoint:{" "}
                <code className="font-mono text-foreground">
                  {PROVIDER_ENDPOINTS[cloudProvider]?.baseUrl}
                </code>
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  id="cloud-provider"
                  type="button"
                  disabled={disabled}
                  className="flex h-8 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-border/50 bg-card px-3 text-xs font-medium text-foreground shadow-sm transition-[box-shadow,border-color] outline-none hover:bg-card focus:border-border focus:shadow data-[state=open]:border-border data-[state=open]:shadow disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="truncate">
                    {PROVIDER_LABELS[cloudProvider] ?? cloudProvider}
                  </span>
                  <ChevronDown
                    className="size-4 shrink-0 text-muted-foreground/70"
                    aria-hidden="true"
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-[var(--radix-dropdown-menu-trigger-width)] rounded-lg border border-border/50 bg-card p-1 shadow-md"
              >
                {CLOUD_LLM_PROVIDERS.map((p) => {
                  const isSelected = p === cloudProvider;
                  return (
                    <DropdownMenuItem
                      key={p}
                      onSelect={() => {
                        if (p === cloudProvider) return;
                        const nextModelProvider =
                          savedCloudModel && !savedCloudModelProvider
                            ? cloudProvider
                            : savedCloudModelProvider;
                        setSavedCloudModelProvider(nextModelProvider);
                        setCloudProvider(p);
                        setCloudModelOverride(
                          resolveScopedModelInput(
                            p,
                            savedCloudModel,
                            nextModelProvider
                          )
                        );
                        if (accountId) {
                          startTransition(async () => {
                            await updateRule(accountId, "cloudProvider", p);
                            router.refresh();
                          });
                        }
                      }}
                      className="cursor-pointer justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium"
                    >
                      <span className="truncate">{PROVIDER_LABELS[p] ?? p}</span>
                      <Check
                        className={cn(
                          "size-3.5 shrink-0",
                          isSelected ? "opacity-100" : "opacity-0"
                        )}
                      />
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Model Name Override */}
          <div className="space-y-1.5">
            <div className="space-y-0.5 pl-1">
              <Label
                htmlFor="cloud-model"
                className="text-xs font-semibold tracking-tight text-foreground cursor-pointer"
              >
                Model Name Override (Optional)
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Leave blank to use default model:{" "}
                <code className="font-mono text-foreground">
                  {PROVIDER_ENDPOINTS[cloudProvider]?.defaultModel}
                </code>
              </p>
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border/50 bg-card pl-3 pr-1.5 text-foreground/75 shadow-sm transition-[box-shadow,border-color] focus-within:border-border focus-within:shadow">
                <Cpu
                  className="pointer-events-none size-4 shrink-0 text-foreground/45"
                  aria-hidden
                />
                <input
                  id="cloud-model"
                  type="text"
                  aria-label="Model Name Override"
                  placeholder={
                    PROVIDER_ENDPOINTS[cloudProvider]?.defaultModel ??
                    "default model"
                  }
                  value={cloudModelOverride}
                  disabled={disabled}
                  onChange={(e) => setCloudModelOverride(e.target.value)}
                  className="h-full min-w-0 flex-1 border-0 bg-transparent py-0 font-mono text-xs shadow-none placeholder:text-foreground/45 focus:outline-none focus:ring-0"
                  autoComplete="off"
                  spellCheck={false}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      cloudModelOverride.trim() !== activeProviderSavedModel
                    ) {
                      e.preventDefault();
                      handleSaveModelOverride();
                    }
                  }}
                />
                {cloudModelOverride ? (
                  <button
                    type="button"
                    aria-label="Clear model override input"
                    onClick={() => setCloudModelOverride("")}
                    className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-muted/70 text-[hsl(var(--sidebar))] shadow-none transition-colors hover:bg-[hsl(var(--sidebar))] hover:text-[hsl(var(--sidebar-foreground))]"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                className={cn(PRIMARY_ACTION_BTN_CLASSNAME, "shrink-0")}
                disabled={
                  disabled ||
                  cloudModelOverride.trim() === activeProviderSavedModel
                }
                onClick={handleSaveModelOverride}
              >
                {pending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Saving…</span>
                  </>
                ) : (
                  "Save"
                )}
              </button>
            </div>
          </div>

          {/* API Key Input */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2 pl-1">
              <Label
                htmlFor="cloud-api-key"
                className="text-xs font-semibold tracking-tight text-foreground cursor-pointer"
              >
                API Key
              </Label>

              {maskedApiKey ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 font-mono text-[11px] font-medium text-primary">
                    <KeyRound className="h-3 w-3 shrink-0" />
                    {maskedApiKey}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={disabled}
                      onClick={handleClearKey}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 shrink-0"
                      title="Delete active key"
                      aria-label="Delete active key"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={disabled}
                      onClick={() => {
                        setIsEditingKey((prev) => !prev);
                        setApiKeyInput("");
                      }}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
                      title="Replace active key"
                      aria-label="Replace active key"
                    >
                      <Redo2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            {(!maskedApiKey || isEditingKey) && (
              <div className="flex min-w-0 flex-1 items-center gap-2 animate-in fade-in-50 duration-150">
                <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border/50 bg-card pl-3 pr-1.5 text-foreground/75 shadow-sm transition-[box-shadow,border-color] focus-within:border-border focus-within:shadow">
                  <KeyRound
                    className="pointer-events-none size-4 shrink-0 text-foreground/45"
                    aria-hidden
                  />
                  <input
                    id="cloud-api-key"
                    type="password"
                    aria-label={
                      maskedApiKey
                        ? `Replace ${cloudProvider} API key`
                        : `${cloudProvider} API key`
                    }
                    placeholder={
                      maskedApiKey ??
                      `Enter ${cloudProvider} API key (e.g. sk-...)`
                    }
                    autoFocus={Boolean(maskedApiKey && isEditingKey)}
                    value={apiKeyInput}
                    disabled={disabled}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    className="h-full min-w-0 flex-1 border-0 bg-transparent py-0 font-mono text-xs shadow-none placeholder:text-foreground/45 focus:outline-none focus:ring-0"
                    autoComplete="off"
                    spellCheck={false}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSaveKey();
                      } else if (e.key === "Escape" && maskedApiKey) {
                        setIsEditingKey(false);
                        setApiKeyInput("");
                      }
                    }}
                  />
                  {apiKeyInput ? (
                    <button
                      type="button"
                      aria-label="Clear API key input"
                      onClick={() => setApiKeyInput("")}
                      className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-muted/70 text-[hsl(var(--sidebar))] shadow-none transition-colors hover:bg-[hsl(var(--sidebar))] hover:text-[hsl(var(--sidebar-foreground))]"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  ) : null}
                </div>

                {maskedApiKey && isEditingKey && (
                  <button
                    type="button"
                    className={cn(SECONDARY_ACTION_BTN_CLASSNAME, "shrink-0")}
                    disabled={disabled}
                    onClick={() => {
                      setIsEditingKey(false);
                      setApiKeyInput("");
                    }}
                  >
                    Cancel
                  </button>
                )}

                <button
                  type="button"
                  className={cn(PRIMARY_ACTION_BTN_CLASSNAME, "shrink-0")}
                  disabled={disabled || !apiKeyInput.trim()}
                  onClick={handleSaveKey}
                >
                  {pending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Saving…</span>
                    </>
                  ) : (
                    "Save"
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </SettingsFeatureCard>
    </SettingsSectionCard>
  );
}

export default CloudProviderCard;
