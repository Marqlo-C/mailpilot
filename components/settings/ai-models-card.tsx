"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  Check,
  ChevronDown,
  Cloud,
  Copy,
  Cpu,
  Globe,
  KeyRound,
  Loader2,
  RefreshCw,
  Rocket,
  Shield,
  ShieldUser,
  Terminal,
  Trash2,
  Wifi,
  Worm,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  clearCustomLlmKey,
  clearHasDataApiKey,
  clearScrapingAntApiKey,
  saveCustomLlmKey,
  saveHasDataApiKey,
  saveScrapingAntApiKey,
  updateBridgeSecret,
  updateLlmProvider,
  updateOllamaModel,
  updateOllamaUrl,
  updateRule,
} from "@/app/actions/settings";
import {
  CLOUD_LLM_PROVIDERS,
  type CloudLlmProvider,
  PROVIDER_ENDPOINTS,
} from "@/lib/llm/provider.ssot";
import {
  SETTINGS_CARD_CLASSNAME,
  SETTINGS_ROW_CLASSNAME,
} from "@/components/settings/settings-chrome";
import { PRIMARY_ACTION_BTN_CLASSNAME } from "@/components/ui/primary-action-btn";
import {
  SECONDARY_ACTION_BTN_CLASSNAME,
  SECONDARY_DESTRUCTIVE_ACTION_BTN_CLASSNAME,
} from "@/components/ui/secondary-action-btn";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WaveToggle } from "@/components/ui/wave-toggle";
import {
  NestedSettingsCard,
  CurvedCardDivider,
} from "@/components/ui/nested-settings-card";
import { ScrapingAntControlPanel } from "@/components/settings/scrapingant-control-panel";
import { HasDataControlPanel } from "@/components/settings/hasdata-control-panel";
import { CompanyLogo } from "@/components/ui/company-logo";
import type { ScrapingAntUsage, HasDataUsage } from "@/lib/validations/rules";
import { cn } from "@/lib/utils";

const PROVIDER_LABELS: Record<CloudLlmProvider, string> = {
  OPENROUTER: "OpenRouter (Recommended / Multi-Model)",
  OPENAI: "OpenAI (GPT-4o mini, GPT-4o)",
  GROQ: "Groq (Llama 3.3 70B)",
  DEEPSEEK: "DeepSeek (DeepSeek V3 / R1)",
  ANTHROPIC: "Anthropic (Claude 3.5 Haiku / Sonnet)",
  GEMINI: "Google Gemini (Gemini 2.5 Flash)",
};

const STEP_CARD_CTA_CLASSNAME =
  "h-8 w-[132px] shrink-0 gap-1.5 px-2.5 text-xs border-border/80 hover:bg-muted/60";

type AiModelsCardProps = {
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
  maskedApiKey?: string | null;
  maskedScrapingAntApiKey?: string | null;
  scrapingAntUsage?: ScrapingAntUsage | null;
  maskedHasDataApiKey?: string | null;
  hasDataUsage?: HasDataUsage | null;
  maskedJinaApiKey?: string | null;
};

type ConnectionStatus =
  | "connected"
  | "waiting"
  | "offline"
  | "error"
  | "checking";

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
      ollamaSubOpen: typeof parsed.ollamaSubOpen === "boolean" ? parsed.ollamaSubOpen : true,
      step1Open: typeof parsed.step1Open === "boolean" ? parsed.step1Open : true,
      step2Open: typeof parsed.step2Open === "boolean" ? parsed.step2Open : true,
      step3Open: typeof parsed.step3Open === "boolean" ? parsed.step3Open : true,
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
    // If all steps were recorded as closed (e.g. from a prior run where programmatic
    // collapse on disable was stored), heal it by reopening Step 3 as the active view.
    const allStepsClosed = !saved.step1Open && !saved.step2Open && !saved.step3Open;
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


function TerminalBlock({
  title,
  code,
  onCopy,
  copied,
  disabled,
}: {
  title: string;
  code: string;
  onCopy?: () => void;
  copied?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 bg-zinc-900/50 px-3 py-2">
        <div className="flex items-center gap-2 text-[11px] font-medium tracking-wide text-zinc-400">
          <Terminal className="h-3.5 w-3.5" />
          {title}
        </div>
        {onCopy ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            disabled={disabled}
            onClick={onCopy}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
        ) : null}
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all p-3.5 font-mono text-[12px] leading-relaxed text-zinc-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function StatusDot({ status }: { status: ConnectionStatus }) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 shrink-0 rounded-full",
        status === "connected" && "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.55)]",
        status === "checking" && "animate-pulse bg-sky-500",
        (status === "waiting" || status === "offline") && "bg-amber-400",
        status === "error" && "bg-rose-500"
      )}
    />
  );
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
  allowCloudFallback: initialAllowCloudFallback = false,
  cloudProvider: initialCloudProvider = "OPENROUTER",
  cloudModel: initialCloudModel = null,
  maskedApiKey: initialMaskedApiKey = null,
  maskedScrapingAntApiKey: initialMaskedScrapingAntApiKey = null,
  scrapingAntUsage: initialScrapingAntUsage = null,
  maskedHasDataApiKey: initialMaskedHasDataApiKey = null,
  hasDataUsage: initialHasDataUsage = null,
  maskedJinaApiKey: initialMaskedJinaApiKey = null,
}: AiModelsCardProps) {
  const router = useRouter();
  const effectiveMaskedScrapingAntKey =
    initialMaskedScrapingAntApiKey ?? initialMaskedJinaApiKey ?? null;
  const [scrapingAntUsage, setScrapingAntUsage] = useState<ScrapingAntUsage | null>(
    initialScrapingAntUsage
  );
  const [hasDataUsage, setHasDataUsage] = useState<HasDataUsage | null>(
    initialHasDataUsage
  );
  const [url, setUrl] = useState(localOllamaUrl);
  const [selectedModel, setSelectedModel] = useState(ollamaModel);
  const [devModels, setDevModels] = useState<string[]>([]);
  const [devSelectedModel, setDevSelectedModel] = useState("");
  const [devModelUrl, setDevModelUrl] = useState("");
  const [devModelMessage, setDevModelMessage] = useState<string | null>(null);
  const [checkingDevModels, setCheckingDevModels] = useState(false);
  const [allowCloudFallback, setAllowCloudFallback] = useState(
    initialAllowCloudFallback
  );
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
  const [revealSecret, setRevealSecret] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedOsCommand, setCopiedOsCommand] = useState<"mac" | "win" | null>(
    null
  );
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
  const [bridgeOs, setBridgeOs] = useState<"mac" | "win">("mac");
  const [mounted, setMounted] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [pending, startTransition] = useTransition();

  // Cloud BYOK state
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
  const [scrapingApisAccordionOpen, setScrapingApisAccordionOpen] = useState<boolean>(
    Boolean(effectiveMaskedScrapingAntKey || initialMaskedHasDataApiKey)
  );
  const [scrapingAntSubOpen, setScrapingAntSubOpen] = useState<boolean>(
    Boolean(effectiveMaskedScrapingAntKey)
  );
  const [hasDataSubOpen, setHasDataSubOpen] = useState<boolean>(
    Boolean(initialMaskedHasDataApiKey)
  );
  const [scrapingAntApiKeyInput, setScrapingAntApiKeyInput] = useState("");
  const [maskedScrapingAntKey, setMaskedScrapingAntKey] = useState<string | null>(
    effectiveMaskedScrapingAntKey
  );
  const [isSavingScrapingAntKey, setIsSavingScrapingAntKey] = useState(false);
  const [isClearingScrapingAntKey, setIsClearingScrapingAntKey] = useState(false);
  const [isReplacingScrapingAntKey, setIsReplacingScrapingAntKey] = useState(false);

  const [hasDataApiKeyInput, setHasDataApiKeyInput] = useState("");
  const [maskedHasDataKey, setMaskedHasDataKey] = useState<string | null>(
    initialMaskedHasDataApiKey
  );
  const [isSavingHasDataKey, setIsSavingHasDataKey] = useState(false);
  const [isClearingHasDataKey, setIsClearingHasDataKey] = useState(false);
  const [isReplacingHasDataKey, setIsReplacingHasDataKey] = useState(false);

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
    setAllowCloudFallback(initialAllowCloudFallback);
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

  useEffect(() => {
    setMaskedScrapingAntKey(
      initialMaskedScrapingAntApiKey ?? initialMaskedJinaApiKey ?? null
    );
  }, [initialMaskedScrapingAntApiKey, initialMaskedJinaApiKey]);

  useEffect(() => {
    setScrapingAntUsage(initialScrapingAntUsage);
  }, [initialScrapingAntUsage]);

  useEffect(() => {
    setMaskedHasDataKey(initialMaskedHasDataApiKey);
  }, [initialMaskedHasDataApiKey]);

  useEffect(() => {
    setHasDataUsage(initialHasDataUsage);
  }, [initialHasDataUsage]);

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

  // Stable production origin on SSR + first client paint (hydration-safe)
  const origin =
    mounted && typeof window !== "undefined"
      ? window.location.origin
      : "https://mailpilot-prod.vercel.app";

  const selectOptions =
    models.length > 0
      ? models
      : selectedModel
        ? [selectedModel]
        : [];
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
  const activeBridgeCommand =
    bridgeOs === "mac" ? macBridgeCommand : winBridgeCommand;

  /** On-demand only — omit localhost placeholders so API uses DB tunnel. */
  async function handleVerifyConnection(
    overrideUrl?: string
  ): Promise<ConnectionStatus> {
    if (!accountId || verifying) return connectionStatus;

    setVerifying(true);
    try {
      const payload: { url?: string } = {};
      // Send empty body in automated mode so server reads active tunnel directly from DB.
      // In manual mode (explicit overrideUrl supplied), send it if not localhost.
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
      // Keep the tunnel URL visible on failure — clearing it made re-checks harder.
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

    // 1. Fast probe to check if Ollama is ALREADY running locally
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

    // Poll port 11434 to see if Ollama starts up
    pollInterval = setInterval(async () => {
      try {
        await fetch("http://127.0.0.1:11434/api/version", { mode: "no-cors" });
        cleanup();
        toast.success("Ollama desktop app launched and running!");
      } catch {
        // Still booting
      }
    }, 500);

    // Initial check: after 1.8s, if window never lost focus and document is focused,
    // conclude Ollama is not installed and open the download page.
    fallbackTimer = setTimeout(() => {
      if (!appOpened && document.hasFocus()) {
        cleanup();
        toast.info("Ollama not detected locally. Opening download page…");
        window.open("https://ollama.com/download", "_blank", "noreferrer");
      }
    }, 1800);

    // Safety timeout: stop polling after 8s
    maxTimeout = setTimeout(() => {
      cleanup();
    }, 8000);

    // Trigger registered OS protocol handler
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
    setRevealSecret(true);
    persistSecret(
      next,
      isRegen ? "Bridge secret regenerated" : "Bridge secret generated"
    );
  }

  async function copySecret() {
    if (!hasSecret) return;
    try {
      await navigator.clipboard.writeText(bridgeSecret.trim());
      setCopiedSecret(true);
      window.setTimeout(() => setCopiedSecret(false), 1600);
      toast.success("Secret copied");
    } catch {
      toast.error("Could not copy to clipboard");
    }
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

  async function copySnippet(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSnippet(id);
      window.setTimeout(() => setCopiedSnippet(null), 1600);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  const macosServe =
    'OLLAMA_HOST=0.0.0.0:11434 OLLAMA_ORIGINS="*" ollama serve';
  const windowsServe =
    '$env:OLLAMA_HOST="0.0.0.0:11434"; $env:OLLAMA_ORIGINS="*"; ollama serve';
  const cloudflaredMac =
    'CF=/tmp/cloudflared; if command -v cloudflared >/dev/null 2>&1; then CF="$(command -v cloudflared)"; elif [ ! -x "$CF" ]; then curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz" | tar -xz -C /tmp && chmod +x "$CF" && xattr -d com.apple.quarantine "$CF" 2>/dev/null || true; fi; "$CF" tunnel --url http://127.0.0.1:11434 --http-host-header localhost:11434';
  const cloudflaredWin =
    '$cf="$env:TEMP\\cloudflared.exe"; if (-not (Test-Path $cf)) { Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cf -UseBasicParsing }; & $cf tunnel --url http://127.0.0.1:11434 --http-host-header localhost:11434';

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
      if (!allowCloudFallback) {
        setAllowCloudFallback(true);
        await updateRule(accountId, "allowCloudFallback", true);
      }
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
      if (allowCloudFallback) {
        setAllowCloudFallback(false);
        await updateRule(accountId, "allowCloudFallback", false);
      }
      toast.success("API key cleared");
      router.refresh();
    });
  }

  function handleSaveScrapingAntKey() {
    if (!accountId) return;
    const key = scrapingAntApiKeyInput.trim();
    if (!key) {
      toast.error("Please enter a ScrapingAnt API key");
      return;
    }

    setIsSavingScrapingAntKey(true);
    startTransition(async () => {
      try {
        const result = await saveScrapingAntApiKey(accountId, key);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setMaskedScrapingAntKey(result.data?.maskedScrapingAntApiKey ?? null);
        if (result.data?.scrapingAntUsage) {
          setScrapingAntUsage(result.data.scrapingAntUsage);
        }
        setScrapingAntApiKeyInput("");
        setIsReplacingScrapingAntKey(false);
        toast.success("ScrapingAnt API key encrypted and saved");
        router.refresh();
      } catch {
        toast.error("Failed to save ScrapingAnt API key");
      } finally {
        setIsSavingScrapingAntKey(false);
      }
    });
  }

  function handleClearScrapingAntKey() {
    if (!accountId) return;
    setIsClearingScrapingAntKey(true);
    startTransition(async () => {
      try {
        const result = await clearScrapingAntApiKey(accountId);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setMaskedScrapingAntKey(null);
        setScrapingAntUsage(null);
        setScrapingAntApiKeyInput("");
        setIsReplacingScrapingAntKey(false);
        toast.success("ScrapingAnt API key cleared; direct fetching only");
        router.refresh();
      } catch {
        toast.error("Failed to clear ScrapingAnt API key");
      } finally {
        setIsClearingScrapingAntKey(false);
      }
    });
  }

  function handleSaveHasDataKey() {
    if (!accountId) return;
    const key = hasDataApiKeyInput.trim();
    if (!key) {
      toast.error("Please enter a HasData API key");
      return;
    }

    setIsSavingHasDataKey(true);
    startTransition(async () => {
      try {
        const result = await saveHasDataApiKey(accountId, key);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setMaskedHasDataKey(result.data?.maskedHasDataApiKey ?? null);
        if (result.data?.hasDataUsage) {
          setHasDataUsage(result.data.hasDataUsage);
        }
        setHasDataApiKeyInput("");
        setIsReplacingHasDataKey(false);
        toast.success("HasData API key encrypted and saved");
        router.refresh();
      } catch {
        toast.error("Failed to save HasData API key");
      } finally {
        setIsSavingHasDataKey(false);
      }
    });
  }

  function handleClearHasDataKey() {
    if (!accountId) return;
    setIsClearingHasDataKey(true);
    startTransition(async () => {
      try {
        const result = await clearHasDataApiKey(accountId);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setMaskedHasDataKey(null);
        setHasDataUsage(null);
        setHasDataApiKeyInput("");
        setIsReplacingHasDataKey(false);
        toast.success("HasData API key cleared; direct fetching only");
        router.refresh();
      } catch {
        toast.error("Failed to clear HasData API key");
      } finally {
        setIsClearingHasDataKey(false);
      }
    });
  }

  return (
    <div className="space-y-4">
      <NestedSettingsCard
        level={1}
        className={SETTINGS_CARD_CLASSNAME}
        leading={
          <Bot
            className="size-8 -translate-y-0.5 scale-[1.15] origin-center text-primary shrink-0"
            aria-hidden="true"
          />
        }
        title="Local AI & Ollama Bridge"
        subtitle="Run private inference locally on your machine via secure CLI bridge."
        trailing={
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

        {/* Ollama Bridge Sub Dropdown Card (Level 2) */}
        <NestedSettingsCard
          level={2}
          leading={
            <CompanyLogo
              src="/icons/Ollama Lucide Icon.svg"
              name="Ollama"
              size="lg"
              imageClassName="object-contain p-1 dark:invert"
            />
          }
          title="Local Ollama Bridge"
          subtitle="Zero-token-cost processing powered by your local GPU or CPU."
          trailing={
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
          collapsible
          isExpanded={useOllama && ollamaSubOpen}
          onToggle={handleToggleOllamaSub}
          disabled={!useOllama}
          curvedDivider
        >
          {!mounted ? (
            <div className="text-xs text-muted-foreground">
              Loading Ollama settings…
            </div>
          ) : (
            <>
                  {/* Nested Card: Getting Started with Ollama Bridge (Level 3) */}
                  <NestedSettingsCard
                    level={3}
                    leading={
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 border border-primary/20 text-[11px] font-semibold text-primary">
                        1
                      </span>
                    }
                    title="Getting Started with Ollama Bridge:"
                    trailing={
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={checkingLocalOllama}
                        className={STEP_CARD_CTA_CLASSNAME}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleLaunchOrDownloadOllama();
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
                    collapsible
                    isExpanded={step1Open}
                    onToggle={handleToggleStep1}
                    curvedDivider
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
                            onClick={() => void handleLaunchOrDownloadOllama()}
                            className="inline text-teal-600 dark:text-teal-400 underline underline-offset-2 hover:text-teal-500 font-normal cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Ollama desktop app
                          </button>
                          {" "}(you can install this on any machine and use it remotely from another computer).
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
                          . Mail Pilot is calibrated for Llama 3.1 (8B) to reliably parse and organize your emails, though other capable open models like <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">gemma2:27b</code> also work smoothly if you prefer.
                        </span>
                      </li>
                    </ol>
                  </NestedSettingsCard>

                  {/* Card 2: One-Click Bridge Commands (Level 3) */}
                  <NestedSettingsCard
                    level={3}
                    leading={
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 border border-primary/20 text-[11px] font-semibold text-primary">
                        2
                      </span>
                    }
                    title="One-Click Bridge Commands:"
                    trailing={
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={STEP_CARD_CTA_CLASSNAME}
                        disabled={disabled || pending}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleGenerateSecret(hasSecret);
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
                    collapsible
                    isExpanded={step2Open}
                    onToggle={handleToggleStep2}
                    curvedDivider
                    footer={
                      <div className="space-y-1">
                        <p className="font-medium text-xs text-foreground flex items-center gap-1.5">
                          <ShieldUser className="size-3.5 text-muted-foreground" />
                          <span>Why rotating your secret matters</span>
                        </p>
                        <p className="text-[11px] text-muted-foreground leading-normal">
                          Your secret acts like a private handshake between your personal machine and your Mail Pilot account. If you ever switch Wi-Fi networks, run Mail Pilot in a public workspace, or suspect your terminal was exposed, click Rotate Secret above to instantly revoke old tunnel tokens and lock down your connection.
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
                          Copy the command for your operating system below, paste it into your terminal, and leave that window running in the background.
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
                                onClick={() => void copyOsCommand("mac")}
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
                                onClick={() => void copyOsCommand("win")}
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
                  </NestedSettingsCard>

                {/* Card 3: Checking Your Connection (Level 3) */}
                <NestedSettingsCard
                  level={3}
                  leading={
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 border border-primary/20 text-[11px] font-semibold text-primary">
                      3
                    </span>
                  }
                  title="Checking Your Connection:"
                  trailing={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={STEP_CARD_CTA_CLASSNAME}
                      disabled={disabled || verifying}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleVerifyConnection().then((status) => {
                          if (status === "connected") {
                            toast.success("Ollama connected");
                          } else {
                            toast.error("Could not reach Ollama");
                          }
                        });
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
                  collapsible
                  isExpanded={step3Open}
                  onToggle={handleToggleStep3}
                  curvedDivider
                >
                  <div className="space-y-3.5 px-4 sm:px-6">
                    {/* Step 3.1 instruction */}
                    <div className="flex items-center gap-3">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 border border-primary/20 text-[10px] font-semibold text-primary">
                        3.1
                      </span>
                      <span className="text-xs text-muted-foreground leading-relaxed">
                        With your bridge terminal running in the background, click Check Signal above. Once connected, your active model options will appear below.
                      </span>
                    </div>

                    {/* Unified Bridge Status & Model Card (Level 4) */}
                    <NestedSettingsCard
                      level={4}
                      className="mx-9"
                      leading={
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
                      trailing={
                        isConnected ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-foreground">
                              <Cpu className="size-3 text-primary" />
                              <span>
                                {models.length > 0
                                  ? `${models.length} model${models.length === 1 ? "" : "s"} available`
                                  : statusMessage || `${selectOptions.length} model${selectOptions.length === 1 ? "" : "s"} available`}
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
                              onClick={() => {
                                void handleVerifyConnection().then((status) => {
                                  if (status === "connected") {
                                    toast.success("Models refreshed");
                                  } else {
                                    toast.error("Could not refresh models");
                                  }
                                });
                              }}
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
                                onChange={(e) => {
                                  const next = e.target.value;
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
                    </NestedSettingsCard>
                  </div>
                </NestedSettingsCard>
              </>
            )}
        </NestedSettingsCard>

        {/* Retained for posterity: Manual Tunnel Setup (Replaced by Automated Bridge)
        {/*
          Run Ollama with an open bind, start a Quick Tunnel, then paste the public URL below.
          macOS/Linux:
            1. serve: OLLAMA_HOST=0.0.0.0:11434 OLLAMA_ORIGINS="*" ollama serve
            2. tunnel: cloudflared tunnel --url http://127.0.0.1:11434 --http-host-header localhost:11434
          Windows:
            1. serve: $env:OLLAMA_HOST="0.0.0.0:11434"; $env:OLLAMA_ORIGINS="*"; ollama serve
            2. tunnel: $cf="$env:TEMP\\cloudflared.exe"; ... & $cf tunnel --url http://127.0.0.1:11434 --http-host-header localhost:11434
          Manual Tunnel URL Input:
            <Input id="ollama-url" value={url} onChange={(e) => setUrl(e.target.value)} ... />
        */}

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
                      <p className="text-xs text-muted-foreground">{devModelMessage}</p>
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
                          const names = Array.isArray(data.models) ? data.models : [];
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
                          setDevModelMessage("Could not reach the local model check.");
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
                          localStorage.setItem(
                            DEV_OLLAMA_MODEL_STORAGE_KEY,
                            next
                          );
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

      </NestedSettingsCard>

    {/* Cloud AI Provider & Credentials Card */}
    <Card className={cn(SETTINGS_CARD_CLASSNAME, "overflow-hidden")}>
      <CardHeader className="flex flex-row items-center justify-between gap-3 p-3.5 space-y-0">
        <div className="flex items-center gap-3 min-w-0">
          <Cloud
            className="h-8 w-8 -translate-y-0.5 text-primary shrink-0"
            aria-hidden="true"
          />
          <div className="space-y-0.5 min-w-0">
            <CardTitle>Cloud AI Provider & Credentials</CardTitle>
            <CardDescription className="text-xs">
              Account-scoped Bring-Your-Own-Key (BYOK). Keys are encrypted with AES-256-GCM.
            </CardDescription>
          </div>
        </div>
        {maskedApiKey ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Key Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400 shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            No Key Configured
          </span>
        )}
      </CardHeader>
      <CurvedCardDivider />
      <CardContent className="space-y-5 pt-4">
        {!accountId && (
          <p className="text-sm text-muted-foreground">
            Connect an account to configure cloud credentials.
          </p>
        )}

        {/* Top-Level BYOK Toggle */}
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border/80 bg-background px-4 py-3.5">
          <div className="space-y-0.5">
            <p className="text-sm font-medium tracking-tight">
              Enable Custom Cloud API Key (BYOK)
            </p>
            <p className="text-xs text-muted-foreground">
              Use your own API key (OpenRouter, OpenAI, Anthropic, Gemini, Groq). When Local Ollama is active, this will only be used as a secondary fallback if Ollama is unreachable or times out.
            </p>
          </div>
          <WaveToggle
            id="allow-cloud-fallback"
            checked={allowCloudFallback}
            disabled={disabled}
            onCheckedChange={(checked) => {
              if (!accountId) return;
              setAllowCloudFallback(checked);
              startTransition(async () => {
                const result = await updateRule(
                  accountId,
                  "allowCloudFallback",
                  checked
                );
                if (!result.ok) {
                  setAllowCloudFallback(!checked);
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
        </div>

        {allowCloudFallback && (
          <div className="space-y-5 border-t border-border/60 pt-5 animate-in fade-in-50 duration-200">
            {/* Provider Selector */}
            <div className="space-y-1.5">
              <Label htmlFor="cloud-provider" className="text-sm font-medium tracking-tight">
                Cloud Provider
              </Label>
              <select
                id="cloud-provider"
                className="flex h-10 w-full rounded-lg border border-border/80 bg-background px-3 py-2 text-sm shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
                Default endpoint: <code className="font-mono text-foreground">{PROVIDER_ENDPOINTS[cloudProvider]?.baseUrl}</code>
              </p>
            </div>

            {/* Model Name Override */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="cloud-model" className="text-sm font-medium tracking-tight">
                  Model Name Override (Optional)
                </Label>
                {accountId &&
                  cloudModelOverride.trim() !== (initialCloudModel ?? "") && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
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
                  PROVIDER_ENDPOINTS[cloudProvider]?.defaultModel ?? "default model"
                }
                value={cloudModelOverride}
                disabled={disabled}
                onChange={(e) => setCloudModelOverride(e.target.value)}
                className="h-10 border-border/80 bg-background font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Leave blank to use default model:{" "}
                <code className="font-mono text-foreground">
                  {PROVIDER_ENDPOINTS[cloudProvider]?.defaultModel}
                </code>
              </p>
            </div>

            {/* API Key Input */}
            <div className="space-y-2">
              <Label
                htmlFor="cloud-api-key"
                className="text-sm font-medium tracking-tight"
              >
                API Key
              </Label>

              {maskedApiKey && !isEditingKey ? (
                <div className="flex flex-col gap-2 rounded-xl border border-border/80 bg-muted/15 p-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Shield className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <Input
                      readOnly
                      type="text"
                      value={maskedApiKey}
                      className="h-9 border-border/80 bg-card/75 font-mono text-xs text-muted-foreground"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 shrink-0 text-xs"
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
                      className="h-9 shrink-0 text-xs text-rose-500 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:bg-rose-500/20"
                      disabled={disabled}
                      onClick={handleClearKey}
                    >
                      Clear Key
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative">
                    <Input
                      id="cloud-api-key"
                      type="password"
                      placeholder={
                        maskedApiKey ??
                        `Enter ${cloudProvider} API key (e.g. sk-...)`
                      }
                      value={apiKeyInput}
                      disabled={disabled}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      className="h-10 border-border/80 bg-card/75 font-mono text-xs transition-[box-shadow,border-color] focus-visible:border-border focus-visible:ring-0 focus-visible:shadow"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="h-9 text-xs"
                      disabled={disabled || !apiKeyInput.trim()}
                      onClick={handleSaveKey}
                    >
                      {pending ? (
                        <>
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          Saving…
                        </>
                      ) : (
                        "Save API Key"
                      )}
                    </Button>
                    {maskedApiKey ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 text-xs"
                        disabled={disabled}
                        onClick={() => {
                          setIsEditingKey(false);
                          setApiKeyInput("");
                        }}
                      >
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </div>
              )}

              <p className="text-[11px] text-muted-foreground">
                Keys are encrypted at rest with AES-256-GCM and scoped solely to your account. Plaintext keys are never logged or returned to client components.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>

    {/* Bot Bypass & Web Scraping Card */}
    <Card className={cn(SETTINGS_CARD_CLASSNAME, "overflow-hidden")}>
      <CardHeader
        className="cursor-pointer select-none transition-colors hover:bg-muted/10 p-3.5 space-y-0"
        onClick={() => setScrapingApisAccordionOpen((prev) => !prev)}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Worm
              className="h-8 w-8 -translate-y-0.5 text-primary shrink-0"
              aria-hidden="true"
            />
            <div className="space-y-0.5 min-w-0">
              <CardTitle>
                Bot Bypass & Web Scraping
              </CardTitle>
              <CardDescription className="text-xs">
                Configure failover and on-demand proxies for rich job spec hydration and ATS block bypass.
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            {!scrapingApisAccordionOpen ? (
              maskedScrapingAntKey || maskedHasDataKey ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 shrink-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground shrink-0">
                  Direct Fetch (No Proxy)
                </span>
              )
            ) : null}
            <ChevronDown
              className={cn(
                "h-5 w-5 text-muted-foreground transition-transform duration-200 shrink-0",
                scrapingApisAccordionOpen && "rotate-180"
              )}
            />
          </div>
        </div>
      </CardHeader>

      {scrapingApisAccordionOpen && (
        <>
          <CurvedCardDivider />
          <CardContent className="space-y-3.5 p-4 animate-in fade-in-50 duration-200">
          {!accountId ? (
            <p className="text-sm text-muted-foreground">
              Connect an account to configure scraping API settings.
            </p>
          ) : (
            <>
              {/* ScrapingAnt Sub Dropdown Card */}
              <div className="overflow-hidden rounded-xl border border-border/70 bg-card/60 shadow-xs transition-colors">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setScrapingAntSubOpen((prev) => !prev)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setScrapingAntSubOpen((prev) => !prev);
                    }
                  }}
                  className="flex cursor-pointer select-none items-start justify-between gap-3 p-3.5 transition-colors hover:bg-muted/20"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <CompanyLogo
                      src="/icons/ScrapingAnt Lucide Icon.png"
                      name="ScrapingAnt"
                      size="lg"
                      imageClassName="object-contain p-1 dark:invert"
                    />
                    <div className="space-y-0.5 min-w-0">
                      <h3 className="text-sm font-semibold tracking-tight text-foreground">
                        ScrapingAnt Proxy
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Used as a fast 1-credit failover to hydrate single-page job boards (like JobLeads) when direct fetching is blocked. Free tier includes 10,000 monthly credits.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0 pt-0.5">
                    {maskedScrapingAntKey ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground shrink-0">
                        Direct Fetch (No Proxy)
                      </span>
                    )}
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0",
                        scrapingAntSubOpen && "rotate-180"
                      )}
                    />
                  </div>
                </div>

                {scrapingAntSubOpen && (
                  <>
                    <CurvedCardDivider />
                    <div className="space-y-4 bg-muted/10 p-3.5 animate-in fade-in-50 duration-200">
                    {/* ScrapingAnt API Key Field: show when no key is set OR when replacing active key */}
                    {(!maskedScrapingAntKey || isReplacingScrapingAntKey) && (
                      <div className="space-y-1.5 animate-in fade-in-50 duration-150">
                        <p className="text-[11px] text-muted-foreground pl-1">
                          Insert your proxy key or get one free from{" "}
                          <a
                            href="https://scrapingant.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-foreground"
                          >
                            scrapingant.com
                          </a>
                          :
                        </p>

                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border/50 bg-card pl-3 pr-1.5 text-foreground/75 shadow-sm transition-[box-shadow,border-color] focus-within:border-border focus-within:shadow">
                            <KeyRound
                              className="pointer-events-none size-4 shrink-0 text-foreground/45"
                              aria-hidden
                            />
                            <input
                              id="scrapingant-api-key"
                              type="password"
                              aria-label={
                                maskedScrapingAntKey
                                  ? "Replace ScrapingAnt API key"
                                  : "ScrapingAnt API key"
                              }
                              placeholder="ant-..."
                              autoFocus={Boolean(maskedScrapingAntKey && isReplacingScrapingAntKey)}
                              value={scrapingAntApiKeyInput}
                              disabled={disabled || isSavingScrapingAntKey}
                              onChange={(e) => setScrapingAntApiKeyInput(e.target.value)}
                              className="h-full min-w-0 flex-1 border-0 bg-transparent py-0 font-mono text-xs shadow-none placeholder:text-foreground/45 focus:outline-none focus:ring-0"
                              autoComplete="off"
                              spellCheck={false}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleSaveScrapingAntKey();
                                } else if (e.key === "Escape" && isReplacingScrapingAntKey) {
                                  setIsReplacingScrapingAntKey(false);
                                  setScrapingAntApiKeyInput("");
                                }
                              }}
                            />
                            {scrapingAntApiKeyInput ? (
                              <button
                                type="button"
                                aria-label="Clear API key input"
                                onClick={() => setScrapingAntApiKeyInput("")}
                                className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-muted/70 text-[hsl(var(--sidebar))] shadow-none transition-colors hover:bg-[hsl(var(--sidebar))] hover:text-[hsl(var(--sidebar-foreground))]"
                              >
                                <X className="size-4" aria-hidden />
                              </button>
                            ) : null}
                          </div>
                          {maskedScrapingAntKey && isReplacingScrapingAntKey && (
                            <button
                              type="button"
                              className={cn(SECONDARY_ACTION_BTN_CLASSNAME, "shrink-0")}
                              disabled={disabled || isSavingScrapingAntKey}
                              onClick={() => {
                                setIsReplacingScrapingAntKey(false);
                                setScrapingAntApiKeyInput("");
                              }}
                            >
                              Cancel
                            </button>
                          )}
                          <button
                            type="button"
                            className={cn(PRIMARY_ACTION_BTN_CLASSNAME, "shrink-0")}
                            disabled={
                              disabled ||
                              isSavingScrapingAntKey ||
                              !scrapingAntApiKeyInput.trim()
                            }
                            onClick={handleSaveScrapingAntKey}
                          >
                            {isSavingScrapingAntKey ? (
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
                    )}

                    {/* ScrapingAnt Usage & Plan Control Panel */}
                    {maskedScrapingAntKey ? (
                      <ScrapingAntControlPanel
                        accountId={accountId}
                        initialUsage={scrapingAntUsage}
                        maskedApiKey={maskedScrapingAntKey}
                        disabled={disabled}
                        onReplaceKey={() => {
                          setIsReplacingScrapingAntKey((prev) => !prev);
                          setScrapingAntApiKeyInput("");
                        }}
                        onDeleteKey={handleClearScrapingAntKey}
                        isDeletingKey={isClearingScrapingAntKey}
                      />
                    ) : null}
                  </div>
                </>
              )}
              </div>

              {/* HasData Sub Dropdown Card */}
              <div className="overflow-hidden rounded-xl border border-border/70 bg-card/60 shadow-xs transition-colors">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setHasDataSubOpen((prev) => !prev)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setHasDataSubOpen((prev) => !prev);
                    }
                  }}
                  className="flex cursor-pointer select-none items-start justify-between gap-3 p-3.5 transition-colors hover:bg-muted/20"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <CompanyLogo
                      src="/icons/HasData Lucide Icon.png"
                      name="HasData"
                      size="lg"
                      imageClassName="object-contain p-1 dark:invert"
                    />
                    <div className="space-y-0.5 min-w-0">
                      <h3 className="text-sm font-semibold tracking-tight text-foreground">
                        HasData Web Scraping
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Used for on-demand extraction of Glassdoor and Indeed postings when tailoring resumes or hydrating job specs. Never consumed during background sync.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0 pt-0.5">
                    {maskedHasDataKey ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground shrink-0">
                        On-Demand Direct Only
                      </span>
                    )}
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0",
                        hasDataSubOpen && "rotate-180"
                      )}
                    />
                  </div>
                </div>

                {hasDataSubOpen && (
                  <>
                    <CurvedCardDivider />
                    <div className="space-y-4 bg-muted/10 p-3.5 animate-in fade-in-50 duration-200">
                    {/* HasData API Key Field: show when no key is set OR when replacing active key */}
                    {(!maskedHasDataKey || isReplacingHasDataKey) && (
                      <div className="space-y-1.5 animate-in fade-in-50 duration-150">
                        <p className="text-[11px] text-muted-foreground pl-1">
                          Insert your API key or get one free from{" "}
                          <a
                            href="https://hasdata.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-foreground"
                          >
                            hasdata.com
                          </a>
                          :
                        </p>

                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border/50 bg-card pl-3 pr-1.5 text-foreground/75 shadow-sm transition-[box-shadow,border-color] focus-within:border-border focus-within:shadow">
                            <KeyRound
                              className="pointer-events-none size-4 shrink-0 text-foreground/45"
                              aria-hidden
                            />
                            <input
                              id="hasdata-api-key"
                              type="password"
                              aria-label={
                                maskedHasDataKey
                                  ? "Replace HasData API key"
                                  : "HasData API key"
                              }
                              placeholder="hd-..."
                              autoFocus={Boolean(maskedHasDataKey && isReplacingHasDataKey)}
                              value={hasDataApiKeyInput}
                              disabled={disabled || isSavingHasDataKey}
                              onChange={(e) => setHasDataApiKeyInput(e.target.value)}
                              className="h-full min-w-0 flex-1 border-0 bg-transparent py-0 font-mono text-xs shadow-none placeholder:text-foreground/45 focus:outline-none focus:ring-0"
                              autoComplete="off"
                              spellCheck={false}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleSaveHasDataKey();
                                } else if (e.key === "Escape" && isReplacingHasDataKey) {
                                  setIsReplacingHasDataKey(false);
                                  setHasDataApiKeyInput("");
                                }
                              }}
                            />
                            {hasDataApiKeyInput ? (
                              <button
                                type="button"
                                aria-label="Clear API key input"
                                onClick={() => setHasDataApiKeyInput("")}
                                className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-muted/70 text-[hsl(var(--sidebar))] shadow-none transition-colors hover:bg-[hsl(var(--sidebar))] hover:text-[hsl(var(--sidebar-foreground))]"
                              >
                                <X className="size-4" aria-hidden />
                              </button>
                            ) : null}
                          </div>
                          {maskedHasDataKey && isReplacingHasDataKey && (
                            <button
                              type="button"
                              className={cn(SECONDARY_ACTION_BTN_CLASSNAME, "shrink-0")}
                              disabled={disabled || isSavingHasDataKey}
                              onClick={() => {
                                setIsReplacingHasDataKey(false);
                                setHasDataApiKeyInput("");
                              }}
                            >
                              Cancel
                            </button>
                          )}
                          <button
                            type="button"
                            className={cn(PRIMARY_ACTION_BTN_CLASSNAME, "shrink-0")}
                            disabled={
                              disabled ||
                              isSavingHasDataKey ||
                              !hasDataApiKeyInput.trim()
                            }
                            onClick={handleSaveHasDataKey}
                          >
                            {isSavingHasDataKey ? (
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
                    )}

                    {/* HasData Usage & Plan Control Panel */}
                    {maskedHasDataKey ? (
                      <HasDataControlPanel
                        accountId={accountId}
                        initialUsage={hasDataUsage}
                        maskedApiKey={maskedHasDataKey}
                        disabled={disabled}
                        onReplaceKey={() => {
                          setIsReplacingHasDataKey((prev) => !prev);
                          setHasDataApiKeyInput("");
                        }}
                        onDeleteKey={handleClearHasDataKey}
                        isDeletingKey={isClearingHasDataKey}
                      />
                    ) : null}
                  </div>
                </>
              )}
              </div>
            </>
          )}
        </CardContent>
      </>
    )}
    </Card>
  </div>
  );
}
