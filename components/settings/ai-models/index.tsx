"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import {
  updateBridgeSecret,
  updateLlmProvider,
  updateOllamaModel,
  updateOllamaUrl,
} from "@/app/actions/settings";
import type { CloudLlmProvider } from "@/lib/llm/provider.ssot";
import { SETTINGS_CARD_CLASSNAME } from "@/components/settings/settings-chrome";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { WaveToggle } from "@/components/ui/tactile/wave-toggle";
import { SettingsSectionCard } from "@/components/ui/tactile/nested-settings-card";
import type { ScrapingAntUsage, HasDataUsage } from "@/lib/validations/rules";
import { OllamaBridgeCard } from "./ollama-bridge";
import type { ConnectionStatus } from "./ollama-bridge/connected-model-picker";
import { CloudProviderCard } from "./cloud-provider-card";
import { BotBypassCard } from "./bot-bypass-card";

export type AiModelsCardProps = {
  accountId: string | null;
  accountEmail: string | null;
  llmProvider: string;
  localOllamaUrl: string;
  ollamaModel: string;
  isDev?: boolean;
  bridgeSecret: string;
  availableModels?: string[];
  bridgeConnected?: boolean;
  allowCloudFallback?: boolean;
  cloudProvider?: CloudLlmProvider;
  cloudModel?: string | null;
  cloudModelProvider?: CloudLlmProvider | null;
  maskedApiKey?: string | null;
  maskedScrapingAntApiKey?: string | null;
  scrapingAntUsage?: ScrapingAntUsage | null;
  maskedHasDataApiKey?: string | null;
  hasDataUsage?: HasDataUsage | null;
  maskedJinaApiKey?: string | null;
  enableWebScrapingProxies?: boolean;
};

type VerifyResponse = {
  connected?: boolean;
  status?: ConnectionStatus;
  models?: string[];
  activeUrl?: string;
  error?: string;
  cleared?: boolean;
  trustedCli?: boolean;
};

function deriveConnectionStatus(
  bridgeConnected: boolean,
  storedUrl: string
): ConnectionStatus {
  if (bridgeConnected && storedUrl.trim()) return "connected";
  if (!storedUrl.trim()) return "waiting";
  return "offline";
}

function generateBridgeSecret(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

export const DEV_OLLAMA_MODEL_STORAGE_KEY = "mailpilot_dev_ollama_model";

export function getDevOllamaModelOverride(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const val = localStorage.getItem(DEV_OLLAMA_MODEL_STORAGE_KEY)?.trim();
    return val || null;
  } catch {
    return null;
  }
}

interface StoredOllamaAccordionState {
  ollamaSubOpen: boolean;
  step1Open: boolean;
  step2Open: boolean;
  step3Open: boolean;
}

function getOllamaAccordionStorageKey(accountId: string | null): string {
  return accountId
    ? `mailpilot_ollama_accordion_${accountId}`
    : "mailpilot_ollama_accordion_default";
}

function loadStoredAccordionState(
  accountId: string | null
): StoredOllamaAccordionState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(getOllamaAccordionStorageKey(accountId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredOllamaAccordionState>;
    if (typeof parsed !== "object" || parsed === null) return null;
    return {
      ollamaSubOpen:
        typeof parsed.ollamaSubOpen === "boolean" ? parsed.ollamaSubOpen : true,
      step1Open:
        typeof parsed.step1Open === "boolean" ? parsed.step1Open : true,
      step2Open:
        typeof parsed.step2Open === "boolean" ? parsed.step2Open : true,
      step3Open:
        typeof parsed.step3Open === "boolean" ? parsed.step3Open : true,
    };
  } catch {
    return null;
  }
}

function saveStoredAccordionState(
  accountId: string | null,
  state: StoredOllamaAccordionState
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      getOllamaAccordionStorageKey(accountId),
      JSON.stringify(state)
    );
  } catch {
    // ignore localStorage quota or permission error
  }
}

function getEffectiveRestoredAccordionState(
  accountId: string | null
): StoredOllamaAccordionState {
  const saved = loadStoredAccordionState(accountId);
  if (saved) {
    const allStepsClosed =
      !saved.step1Open && !saved.step2Open && !saved.step3Open;
    return {
      ollamaSubOpen: true,
      step1Open: allStepsClosed ? false : saved.step1Open,
      step2Open: allStepsClosed ? false : saved.step2Open,
      step3Open: allStepsClosed ? true : saved.step3Open,
    };
  }
  return {
    ollamaSubOpen: true,
    step1Open: true,
    step2Open: true,
    step3Open: true,
  };
}

export function AiModelsCard({
  accountId,
  accountEmail,
  llmProvider,
  localOllamaUrl,
  ollamaModel,
  isDev = false,
  bridgeSecret: initialBridgeSecret,
  availableModels: initialModels = [],
  bridgeConnected: initialConnected = false,
  allowCloudFallback = false,
  cloudProvider = "OPENROUTER",
  cloudModel = null,
  cloudModelProvider = null,
  maskedApiKey = null,
  maskedScrapingAntApiKey = null,
  scrapingAntUsage = null,
  maskedHasDataApiKey = null,
  hasDataUsage = null,
  maskedJinaApiKey = null,
  enableWebScrapingProxies = true,
}: AiModelsCardProps) {
  const router = useRouter();
  const [url, setUrl] = useState(localOllamaUrl);
  const [selectedModel, setSelectedModel] = useState(ollamaModel);
  const [devModels, setDevModels] = useState<string[]>([]);
  const [devSelectedModel, setDevSelectedModel] = useState("");
  const [devModelUrl, setDevModelUrl] = useState("");
  const [devModelMessage, setDevModelMessage] = useState<string | null>(null);
  const [checkingDevModels, setCheckingDevModels] = useState(false);
  const [models, setModels] = useState<string[]>(
    initialModels.length > 0
      ? initialModels
      : ollamaModel
        ? [ollamaModel]
        : []
  );
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    () => deriveConnectionStatus(initialConnected, localOllamaUrl)
  );
  const [bridgeSecret, setBridgeSecret] = useState(initialBridgeSecret);
  const [copiedOsCommand, setCopiedOsCommand] = useState<"mac" | "win" | null>(
    null
  );
  const [mounted, setMounted] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [pending, startTransition] = useTransition();

  const useOllama = llmProvider === "LOCAL_OLLAMA";
  const [ollamaSubOpen, setOllamaSubOpen] = useState<boolean>(useOllama);
  const [step1Open, setStep1Open] = useState<boolean>(useOllama);
  const [step2Open, setStep2Open] = useState<boolean>(useOllama);
  const [step3Open, setStep3Open] = useState<boolean>(useOllama);

  const accordionStateRef = useRef<StoredOllamaAccordionState>({
    ollamaSubOpen: useOllama,
    step1Open: useOllama,
    step2Open: useOllama,
    step3Open: useOllama,
  });

  const handleToggleOllamaSub = () => {
    if (!useOllama) return;
    setOllamaSubOpen((prev) => {
      const next = !prev;
      const nextState = {
        ...accordionStateRef.current,
        ollamaSubOpen: next,
      };
      accordionStateRef.current = nextState;
      saveStoredAccordionState(accountId, nextState);
      return next;
    });
  };

  const handleToggleStep1 = () => {
    if (!useOllama) return;
    setStep1Open((prev) => {
      const next = !prev;
      const nextState = {
        ...accordionStateRef.current,
        step1Open: next,
      };
      accordionStateRef.current = nextState;
      saveStoredAccordionState(accountId, nextState);
      return next;
    });
  };

  const handleToggleStep2 = () => {
    if (!useOllama) return;
    setStep2Open((prev) => {
      const next = !prev;
      const nextState = {
        ...accordionStateRef.current,
        step2Open: next,
      };
      accordionStateRef.current = nextState;
      saveStoredAccordionState(accountId, nextState);
      return next;
    });
  };

  const handleToggleStep3 = () => {
    if (!useOllama) return;
    setStep3Open((prev) => {
      const next = !prev;
      const nextState = {
        ...accordionStateRef.current,
        step3Open: next,
      };
      accordionStateRef.current = nextState;
      saveStoredAccordionState(accountId, nextState);
      return next;
    });
  };

  const disabled = !accountId || pending;
  const hasSecret = bridgeSecret.trim().length > 0;

  useEffect(() => {
    if (!useOllama) {
      setOllamaSubOpen(false);
      setStep1Open(false);
      setStep2Open(false);
      setStep3Open(false);
    }
  }, [useOllama]);

  useEffect(() => {
    setBridgeSecret(initialBridgeSecret);
  }, [initialBridgeSecret]);

  useEffect(() => {
    setUrl(localOllamaUrl);
    setConnectionStatus(
      deriveConnectionStatus(initialConnected, localOllamaUrl)
    );
    if (initialConnected && initialModels.length > 0) {
      setModels(initialModels);
    } else if (!initialConnected) {
      setModels([]);
    }
  }, [localOllamaUrl, initialConnected, initialModels]);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(DEV_OLLAMA_MODEL_STORAGE_KEY);
        if (stored) {
          setDevSelectedModel(stored);
        }
      } catch {
        // ignore localStorage error
      }

      const restored = getEffectiveRestoredAccordionState(accountId);
      accordionStateRef.current = restored;
      if (useOllama) {
        setOllamaSubOpen(restored.ollamaSubOpen);
        setStep1Open(restored.step1Open);
        setStep2Open(restored.step2Open);
        setStep3Open(restored.step3Open);
      }
    }
  }, [accountId, useOllama]);

  const origin =
    mounted && typeof window !== "undefined"
      ? window.location.origin
      : "https://mailpilot-prod.vercel.app";

  const selectOptions =
    models.length > 0 ? models : selectedModel ? [selectedModel] : [];
  const isConnected = connectionStatus === "connected";
  const displayStatus: ConnectionStatus = verifying
    ? "checking"
    : connectionStatus === "offline"
      ? "error"
      : connectionStatus;

  const emailForCommand = (accountEmail?.trim() ?? "").toLowerCase();
  const secretForCommand = bridgeSecret.trim();
  const macBridgeUrl =
    hasSecret && emailForCommand
      ? `${origin}/api/bridge/mac?email=${encodeURIComponent(emailForCommand)}&secret=${encodeURIComponent(secretForCommand)}`
      : null;
  const winBridgeUrl =
    hasSecret && emailForCommand
      ? `${origin}/api/bridge/win?email=${encodeURIComponent(emailForCommand)}&secret=${encodeURIComponent(secretForCommand)}`
      : null;
  const macBridgeCommand = macBridgeUrl
    ? `curl -sSL "${macBridgeUrl}" | bash`
    : "# Generate a bridge secret above to unlock your command";
  const winBridgeCommand = winBridgeUrl
    ? `irm "${winBridgeUrl}" | iex`
    : "# Generate a bridge secret above to unlock your command";

  async function handleVerifyConnection(
    overrideUrl?: string
  ): Promise<ConnectionStatus> {
    if (!accountId || verifying) return connectionStatus;

    setVerifying(true);
    try {
      const payload: { url?: string } = {};
      if (
        overrideUrl &&
        !overrideUrl.includes("localhost") &&
        !overrideUrl.includes("127.0.0.1")
      ) {
        payload.url = overrideUrl.trim();
      }

      const res = await fetch("/api/ollama/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as VerifyResponse;

      const status: ConnectionStatus =
        data.status ??
        (data.connected ? "connected" : data.error ? "error" : "waiting");

      if (status === "connected" && Array.isArray(data.models)) {
        setConnectionStatus("connected");
        setModels(data.models);
        if (data.activeUrl) setUrl(data.activeUrl);
        setStatusMessage(
          data.trustedCli
            ? `${data.models.length} model${data.models.length === 1 ? "" : "s"} via bridge CLI (cloud probe skipped)`
            : `${data.models.length} model${data.models.length === 1 ? "" : "s"} available`
        );

        if (
          data.models.length > 0 &&
          !data.models.includes(selectedModel) &&
          accountId
        ) {
          const next = data.models[0]!;
          setSelectedModel(next);
          const active = data.activeUrl ?? overrideUrl ?? url;
          if (active.trim()) {
            await updateOllamaUrl(accountId, active.trim(), next);
          }
        }

        router.refresh();
        return "connected";
      }

      setConnectionStatus(status);
      if (data.cleared) {
        setUrl("");
        setModels([]);
      } else if (status === "offline" || status === "error") {
        setModels([]);
      }
      setStatusMessage(
        data.error ??
          "Tunnel unreachable from the cloud. Keep the bridge terminal open, then try again."
      );

      router.refresh();
      return status;
    } catch {
      setConnectionStatus("offline");
      setModels([]);
      setStatusMessage(
        "Failed to reach tunnel endpoint. Is the bridge still running?"
      );
      return "offline";
    } finally {
      setVerifying(false);
    }
  }

  const [checkingLocalOllama, setCheckingLocalOllama] = useState(false);

  async function handleLaunchOrDownloadOllama() {
    if (checkingLocalOllama) return;
    setCheckingLocalOllama(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600);
      await fetch("http://127.0.0.1:11434/api/version", {
        mode: "no-cors",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      toast.success("Ollama is already running on your machine!");
      setCheckingLocalOllama(false);
      return;
    } catch {
      // Port 11434 is closed or not reachable, proceed to launch attempt
    }

    toast.info("Checking for local Ollama installation…");

    let appOpened = false;
    const handleBlur = () => {
      appOpened = true;
    };
    window.addEventListener("blur", handleBlur, { once: true });

    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let maxTimeout: ReturnType<typeof setTimeout> | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (pollInterval) clearInterval(pollInterval);
      if (maxTimeout) clearTimeout(maxTimeout);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      window.removeEventListener("blur", handleBlur);
      setCheckingLocalOllama(false);
    };

    pollInterval = setInterval(async () => {
      try {
        await fetch("http://127.0.0.1:11434/api/version", { mode: "no-cors" });
        cleanup();
        toast.success("Ollama desktop app launched and running!");
      } catch {
        // Still booting
      }
    }, 500);

    fallbackTimer = setTimeout(() => {
      if (!appOpened && document.hasFocus()) {
        cleanup();
        toast.info("Ollama not detected locally. Opening download page…");
        window.open("https://ollama.com/download", "_blank", "noreferrer");
      }
    }, 1800);

    maxTimeout = setTimeout(() => {
      cleanup();
    }, 8000);

    try {
      const link = document.createElement("a");
      link.href = "ollama://";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      cleanup();
      window.open("https://ollama.com/download", "_blank", "noreferrer");
    }
  }

  function persistSecret(next: string, successMessage: string) {
    if (!accountId) return;
    startTransition(async () => {
      const result = await updateBridgeSecret(accountId, next);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setBridgeSecret(result.data?.bridgeSecret ?? "");
      toast.success(successMessage);
      router.refresh();
    });
  }

  function handleGenerateSecret(isRegen: boolean) {
    const next = generateBridgeSecret();
    setBridgeSecret(next);
    persistSecret(
      next,
      isRegen ? "Bridge secret regenerated" : "Bridge secret generated"
    );
  }

  async function copyOsCommand(os: "mac" | "win") {
    const command = os === "mac" ? macBridgeCommand : winBridgeCommand;
    if (!hasSecret || !accountEmail) {
      toast.error("Generate a bridge secret first");
      return;
    }
    try {
      await navigator.clipboard.writeText(command);
      setCopiedOsCommand(os);
      window.setTimeout(() => setCopiedOsCommand(null), 1600);
      toast.success("Command copied");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  return (
    <div className="space-y-4">
      <SettingsSectionCard
        className={SETTINGS_CARD_CLASSNAME}
        icon={
          <Bot
            className="size-8 -translate-y-0.5 scale-[1.15] origin-center text-primary shrink-0"
            aria-hidden="true"
          />
        }
        title="Local AI & Ollama Bridge"
        subtitle="Run private inference locally on your machine via secure CLI bridge."
        toggle={
          <WaveToggle
            id="use-local-ollama"
            checked={useOllama}
            disabled={disabled}
            onCheckedChange={(checked) => {
              if (!accountId) return;
              if (checked) {
                const restored = getEffectiveRestoredAccordionState(accountId);
                accordionStateRef.current = restored;
                setOllamaSubOpen(restored.ollamaSubOpen);
                setStep1Open(restored.step1Open);
                setStep2Open(restored.step2Open);
                setStep3Open(restored.step3Open);
                saveStoredAccordionState(accountId, restored);
              } else {
                setOllamaSubOpen(false);
                setStep1Open(false);
                setStep2Open(false);
                setStep3Open(false);
              }
              startTransition(async () => {
                const result = await updateLlmProvider(
                  accountId,
                  checked ? "LOCAL_OLLAMA" : "OPENROUTER"
                );
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                if (!checked) {
                  toast.success("Local Ollama disabled (routed to Cloud AI)");
                } else {
                  toast.success("Local Ollama enabled");
                }
                router.refresh();
              });
            }}
          />
        }
        curvedDivider
      >
        {!accountId && (
          <p className="text-sm text-muted-foreground">
            Connect an account to configure AI routing.
          </p>
        )}

        <OllamaBridgeCard
          mounted={mounted}
          useOllama={useOllama}
          isConnected={isConnected}
          displayStatus={displayStatus}
          ollamaSubOpen={ollamaSubOpen}
          step1Open={step1Open}
          step2Open={step2Open}
          step3Open={step3Open}
          onToggleOllamaSub={handleToggleOllamaSub}
          onToggleStep1={handleToggleStep1}
          onToggleStep2={handleToggleStep2}
          onToggleStep3={handleToggleStep3}
          checkingLocalOllama={checkingLocalOllama}
          onLaunchOrDownloadOllama={() => void handleLaunchOrDownloadOllama()}
          disabled={disabled}
          pending={pending}
          hasSecret={hasSecret}
          accountEmail={accountEmail}
          macBridgeCommand={macBridgeCommand}
          winBridgeCommand={winBridgeCommand}
          copiedOsCommand={copiedOsCommand}
          onGenerateSecret={handleGenerateSecret}
          onCopyOsCommand={(os) => void copyOsCommand(os)}
          verifying={verifying}
          url={url}
          statusMessage={statusMessage}
          models={models}
          selectOptions={selectOptions}
          selectedModel={selectedModel}
          onCheckSignal={() => {
            void handleVerifyConnection().then((status) => {
              if (status === "connected") {
                toast.success("Ollama connected");
              } else {
                toast.error("Could not reach Ollama");
              }
            });
          }}
          onRefreshModels={() => {
            void handleVerifyConnection().then((status) => {
              if (status === "connected") {
                toast.success("Models refreshed");
              } else {
                toast.error("Could not refresh models");
              }
            });
          }}
          onSelectModel={(next) => {
            setSelectedModel(next);
            if (!accountId) return;
            startTransition(async () => {
              if (url.trim()) {
                await updateOllamaUrl(accountId, url, next);
              } else {
                await updateOllamaModel(accountId, next);
              }
              router.refresh();
            });
          }}
        />

        {useOllama && mounted && isDev ? (
          <div className="space-y-3 rounded-xl border border-dashed border-border/80 bg-muted/10 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium tracking-tight">
                  Development model check
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Lists models on the local Ollama host from OLLAMA_BASE_URL.
                  The saved Cloudflare tunnel is left unchanged.
                </p>
                {devModelUrl ? (
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {devModelUrl}
                  </p>
                ) : null}
                {devModelMessage ? (
                  <p className="text-xs text-muted-foreground">
                    {devModelMessage}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 shrink-0"
                disabled={disabled || checkingDevModels}
                onClick={() => {
                  if (!accountId) return;
                  setCheckingDevModels(true);
                  void (async () => {
                    try {
                      const res = await fetch("/api/ollama/dev-models", {
                        method: "POST",
                      });
                      const data = (await res.json()) as {
                        models?: string[];
                        url?: string;
                        error?: string;
                      };
                      const names = Array.isArray(data.models)
                        ? data.models
                        : [];
                      setDevModels(names);
                      setDevModelUrl(data.url ?? "");
                      if (!res.ok || data.error || names.length === 0) {
                        setDevModelMessage(
                          data.error ?? "No models returned from local Ollama."
                        );
                        toast.error("Could not list local models");
                        return;
                      }
                      setDevModelMessage(
                        `${names.length} model${names.length === 1 ? "" : "s"} on the local host`
                      );
                      toast.success("Local models loaded");

                      setDevSelectedModel((prev) => {
                        if (prev && names.includes(prev)) return prev;
                        let stored: string | null = null;
                        try {
                          stored = localStorage.getItem(
                            DEV_OLLAMA_MODEL_STORAGE_KEY
                          );
                        } catch {}
                        if (stored && names.includes(stored)) return stored;
                        const fallback = names[0] ?? "";
                        try {
                          if (fallback) {
                            localStorage.setItem(
                              DEV_OLLAMA_MODEL_STORAGE_KEY,
                              fallback
                            );
                          }
                        } catch {}
                        return fallback;
                      });
                    } catch {
                      setDevModels([]);
                      setDevModelMessage(
                        "Could not reach the local model check."
                      );
                      toast.error("Could not list local models");
                    } finally {
                      setCheckingDevModels(false);
                    }
                  })();
                }}
              >
                {checkingDevModels ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking…
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Check local models
                  </>
                )}
              </Button>
            </div>
            {devModels.length > 0 ? (
              <div className="space-y-1.5">
                <Label
                  htmlFor="dev-ollama-model"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Active dev model (client-only / localStorage)
                </Label>
                <select
                  id="dev-ollama-model"
                  className="flex h-10 w-full rounded-lg border border-border/80 bg-background px-3 py-2 text-sm shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={
                    devModels.includes(devSelectedModel)
                      ? devSelectedModel
                      : devModels[0]
                  }
                  disabled={disabled}
                  onChange={(event) => {
                    const next = event.target.value;
                    setDevSelectedModel(next);
                    try {
                      localStorage.setItem(DEV_OLLAMA_MODEL_STORAGE_KEY, next);
                    } catch {
                      // ignore localStorage error
                    }
                    toast.success(`Dev model set to ${next} (local only)`);
                  }}
                >
                  {devModels.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        ) : null}
      </SettingsSectionCard>

      {/* Cloud AI Provider & Credentials Card */}
      <CloudProviderCard
        accountId={accountId}
        allowCloudFallback={allowCloudFallback}
        cloudProvider={cloudProvider}
        cloudModel={cloudModel}
        cloudModelProvider={cloudModelProvider}
        maskedApiKey={maskedApiKey}
      />

      {/* Bot Bypass & Web Scraping Card (Level 1) */}
      <BotBypassCard
        accountId={accountId}
        enableWebScrapingProxies={enableWebScrapingProxies}
        maskedScrapingAntApiKey={maskedScrapingAntApiKey}
        scrapingAntUsage={scrapingAntUsage}
        maskedHasDataApiKey={maskedHasDataApiKey}
        hasDataUsage={hasDataUsage}
        maskedJinaApiKey={maskedJinaApiKey}
      />
    </div>
  );
}

export default AiModelsCard;
