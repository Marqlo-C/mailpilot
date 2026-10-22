"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Cloud, KeyRound, Loader2, Shield, Sparkles, X } from "lucide-react";
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
import { Input } from "@/components/ui/input";
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

export interface CloudProviderCardProps {
  accountId: string | null;
  allowCloudFallback?: boolean;
  cloudProvider?: CloudLlmProvider;
  cloudModel?: string | null;
  maskedApiKey?: string | null;
}

export function CloudProviderCard({
  accountId,
  allowCloudFallback: initialAllowCloudFallback = false,
  cloudProvider: initialCloudProvider = "OPENROUTER",
  cloudModel: initialCloudModel = null,
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
  const [cloudModelOverride, setCloudModelOverride] = useState(
    initialCloudModel ?? ""
  );
  const [maskedApiKey, setMaskedApiKey] = useState<string | null>(
    initialMaskedApiKey ?? null
  );
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [isEditingKey, setIsEditingKey] = useState(!initialMaskedApiKey);

  const disabled = !accountId || pending;

  useEffect(() => {
    setAllowCloudFallback(initialAllowCloudFallback);
    if (!initialAllowCloudFallback) {
      setCloudSubOpen(false);
    }
  }, [initialAllowCloudFallback]);

  useEffect(() => {
    setCloudProvider(initialCloudProvider ?? "OPENROUTER");
  }, [initialCloudProvider]);

  useEffect(() => {
    setCloudModelOverride(initialCloudModel ?? "");
  }, [initialCloudModel]);

  useEffect(() => {
    setMaskedApiKey(initialMaskedApiKey ?? null);
    if (!initialMaskedApiKey) {
      setIsEditingKey(true);
    }
  }, [initialMaskedApiKey]);

  function handleSaveKey() {
    if (!accountId) return;
    const key = apiKeyInput.trim();
    if (!key) {
      toast.error("Please enter an API key");
      return;
    }

    startTransition(async () => {
      const result = await saveCustomLlmKey(accountId, {
        provider: cloudProvider,
        model: cloudModelOverride.trim() || null,
        apiKey: key,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

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
          <div className="space-y-4 px-1 py-1 sm:px-2">
            {/* Provider Selector */}
            <div className="space-y-1.5">
              <Label
                htmlFor="cloud-provider"
                className="text-xs font-semibold tracking-tight text-foreground cursor-pointer"
              >
                Cloud Provider
              </Label>
              <select
                id="cloud-provider"
                className="flex h-9.5 w-full appearance-none rounded-lg border border-border/80 bg-background px-3 py-2 text-xs font-medium shadow-2xs outline-none ring-offset-background focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={cloudProvider}
                disabled={disabled}
                onChange={(e) => {
                  const next = e.target.value as CloudLlmProvider;
                  setCloudProvider(next);
                  if (accountId) {
                    startTransition(async () => {
                      await updateRule(accountId, "cloudProvider", next);
                      router.refresh();
                    });
                  }
                }}
              >
                {CLOUD_LLM_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_LABELS[p] ?? p}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                Default endpoint:{" "}
                <code className="font-mono text-foreground">
                  {PROVIDER_ENDPOINTS[cloudProvider]?.baseUrl}
                </code>
              </p>
            </div>

            {/* Model Name Override */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="cloud-model"
                  className="text-xs font-semibold tracking-tight text-foreground cursor-pointer"
                >
                  Model Name Override (Optional)
                </Label>
                {accountId &&
                  cloudModelOverride.trim() !== (initialCloudModel ?? "") && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6.5 text-[11px] px-2"
                      disabled={disabled}
                      onClick={() => {
                        startTransition(async () => {
                          const result = await updateRule(
                            accountId,
                            "cloudModel",
                            cloudModelOverride.trim() || null
                          );
                          if (!result.ok) {
                            toast.error(result.error);
                            return;
                          }
                          toast.success("Model override updated");
                          router.refresh();
                        });
                      }}
                    >
                      Save Model
                    </Button>
                  )}
              </div>
              <Input
                id="cloud-model"
                placeholder={
                  PROVIDER_ENDPOINTS[cloudProvider]?.defaultModel ??
                  "default model"
                }
                value={cloudModelOverride}
                disabled={disabled}
                onChange={(e) => setCloudModelOverride(e.target.value)}
                className="h-9 border-border/80 bg-background font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Leave blank to use default model:{" "}
                <code className="font-mono text-foreground">
                  {PROVIDER_ENDPOINTS[cloudProvider]?.defaultModel}
                </code>
              </p>
            </div>

            {/* API Key Input */}
            <div className="space-y-1.5">
              <Label
                htmlFor="cloud-api-key"
                className="text-xs font-semibold tracking-tight text-foreground cursor-pointer"
              >
                API Key
              </Label>

              {maskedApiKey && !isEditingKey ? (
                <div className="flex flex-col gap-2 rounded-xl border border-border/80 bg-muted/15 p-2.5 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Shield className="size-3.5 shrink-0 text-muted-foreground" />
                    <Input
                      readOnly
                      type="text"
                      value={maskedApiKey}
                      className="h-8 border-border/80 bg-card/75 font-mono text-xs text-muted-foreground"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0 text-xs"
                      disabled={disabled}
                      onClick={() => {
                        setIsEditingKey(true);
                        setApiKeyInput("");
                      }}
                    >
                      Change Key
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 shrink-0 text-xs text-rose-500 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:bg-rose-500/20"
                      disabled={disabled}
                      onClick={handleClearKey}
                    >
                      Clear Key
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div className="flex h-8.5 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border/70 bg-card pl-3 pr-1.5 text-foreground/75 shadow-2xs transition-[box-shadow,border-color] focus-within:border-border focus-within:shadow">
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
                          className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-muted/70 text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <X className="size-3.5" aria-hidden />
                        </button>
                      ) : null}
                    </div>

                    {maskedApiKey && (
                      <button
                        type="button"
                        className={cn(
                          SECONDARY_ACTION_BTN_CLASSNAME,
                          "h-8.5 shrink-0 text-xs px-2.5"
                        )}
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
                      className={cn(
                        PRIMARY_ACTION_BTN_CLASSNAME,
                        "h-8.5 shrink-0 text-xs px-3"
                      )}
                      disabled={disabled || !apiKeyInput.trim()}
                      onClick={handleSaveKey}
                    >
                      {pending ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin mr-1" />
                          <span>Saving…</span>
                        </>
                      ) : (
                        "Save Key"
                      )}
                    </button>
                  </div>
                </div>
              )}

              <p className="text-[11px] text-muted-foreground pt-1">
                Keys are stored encrypted with AES-256-GCM. Plaintext values are
                never transmitted to the browser.
              </p>
            </div>
          </div>
      </SettingsFeatureCard>
    </SettingsSectionCard>
  );
}

export default CloudProviderCard;
