"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  Check,
  ChevronDown,
  Cloud,
  Copy,
  KeyRound,
  Loader2,
  Redo2,
  RefreshCw,
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
import { SECONDARY_DESTRUCTIVE_ACTION_BTN_CLASSNAME } from "@/components/ui/secondary-action-btn";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrapingAntControlPanel } from "@/components/settings/scrapingant-control-panel";
import { HasDataControlPanel } from "@/components/settings/hasdata-control-panel";
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

  const [hasDataApiKeyInput, setHasDataApiKeyInput] = useState("");
  const [maskedHasDataKey, setMaskedHasDataKey] = useState<string | null>(
    initialMaskedHasDataApiKey
  );
  const [isSavingHasDataKey, setIsSavingHasDataKey] = useState(false);
  const [isClearingHasDataKey, setIsClearingHasDataKey] = useState(false);

  const useOllama = llmProvider === "LOCAL_OLLAMA";
  const disabled = !accountId || pending;
  const hasSecret = bridgeSecret.trim().length > 0;



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
    }
  }, []);

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
      <Card className={cn(SETTINGS_CARD_CLASSNAME, "overflow-hidden")}>
        <CardHeader className="flex flex-row items-center gap-3 border-b border-border/50 p-3.5 space-y-0">
          <Bot
            className="h-8 w-8 -translate-y-0.5 scale-[1.15] origin-center text-primary shrink-0"
            aria-hidden="true"
          />
          <div className="space-y-0.5 min-w-0">
            <CardTitle>Local AI & Ollama Bridge</CardTitle>
            <CardDescription className="text-xs">
              Run private inference locally on your machine via secure CLI bridge.
            </CardDescription>
          </div>
        </CardHeader>
      <CardContent className="space-y-6 pt-4">
        {!accountId && (
          <p className="text-sm text-muted-foreground">
            Connect an account to configure AI routing.
          </p>
        )}

        <div className="flex items-center justify-between gap-4 rounded-xl border border-border/80 bg-card/60 px-4 py-3.5 shadow-xs">
          <div className="space-y-0.5">
            <p className="text-sm font-medium tracking-tight">Use Local Ollama</p>
            <p className="text-xs text-muted-foreground">
              Disabling clears the bridge secret and stored tunnel URL.
            </p>
          </div>
          <WaveToggle
            id="use-local-ollama"
            checked={useOllama}
            disabled={disabled}
            onCheckedChange={(checked) => {
              if (!accountId) return;
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
                  setBridgeSecret("");
                  setUrl("");
                  setRevealSecret(false);
                  setConnectionStatus("waiting");
                  setModels([]);
                  setStatusMessage(null);
                  toast.success("Local Ollama disabled");
                }
                router.refresh();
              });
            }}
          />
        </div>

        {useOllama && !mounted && (
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-xs text-muted-foreground">
            Loading Ollama settings…
          </div>
        )}

        {useOllama && mounted && (
          <div className="space-y-5">
            {/* Secondary Card Wrapper */}
            <div className="rounded-xl border border-border/80 bg-card/50 dark:bg-card/40 p-5 shadow-sm space-y-5">
              <Tabs defaultValue="automated" className="w-full space-y-5">
                {/* Single Top Tab Rail */}
                <div className="flex border-b border-border/60 pb-3">
                  <TabsList className="grid h-10 w-full sm:w-auto grid-cols-2 rounded-lg bg-muted/60 p-1">
                    <TabsTrigger
                      value="automated"
                      className="rounded-md px-4 text-xs font-medium data-[state=active]:shadow-sm sm:text-sm"
                    >
                      Automated Bridge (Recommended)
                    </TabsTrigger>
                    <TabsTrigger
                      value="manual"
                      className="rounded-md px-4 text-xs font-medium data-[state=active]:shadow-sm sm:text-sm"
                    >
                      Manual Setup
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* Automated Bridge Tab Content */}
                <TabsContent value="automated" className="mt-0 space-y-5 focus-visible:outline-none">
                  {/* Header row with inline Rotate Secret on the right */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">
                        One-Click Bridge Commands
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Select your operating system and paste into your terminal.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-xs border-border/80 self-start sm:self-auto hover:bg-muted/60"
                      disabled={disabled || pending}
                      onClick={() => handleGenerateSecret(hasSecret)}
                    >
                      {pending ? (
                        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                      ) : (
                        <KeyRound className="size-3.5 text-muted-foreground" />
                      )}
                      <span>{hasSecret ? "Rotate Secret" : "Generate Secret"}</span>
                    </Button>
                  </div>

                  {/* Side-by-side CLI command blocks */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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

                  {/* Comprehensive Chat-Friendly Setup & Security Guide */}
                  <div className="rounded-lg border border-border/70 bg-muted/40 p-4 space-y-3 text-xs leading-relaxed">
                    <div className="font-medium text-foreground text-sm">
                      Getting Started with Local Ollama
                    </div>

                    <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground pl-0.5">
                      <li>
                        Install and launch the official{" "}
                        <a
                          href="https://ollama.com/download"
                          target="_blank"
                          rel="noreferrer"
                          className="text-teal-600 dark:text-teal-400 underline underline-offset-2 hover:text-teal-500"
                        >
                          Ollama desktop app
                        </a>.
                      </li>
                      <li>
                        Open your terminal and run{" "}
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
                          ollama run llama3.1:8b
                        </code>
                        . Mail Pilot is calibrated for llama3.1:8b so it can reliably parse and organize your emails without errors.
                      </li>
                      <li>
                        Copy the command for your operating system above, paste it into your terminal, and leave that window running in the background.
                      </li>
                    </ol>

                    <div className="mt-3 rounded-md border border-dashed border-border/80 bg-card/40 p-3 space-y-1">
                      <p className="font-medium text-xs text-foreground flex items-center gap-1.5">
                        <ShieldUser className="size-3.5 text-muted-foreground" />
                        <span>Why rotating your secret matters</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-normal">
                        Your secret acts like a private handshake between your personal machine and your Mail Pilot account. If you ever switch Wi-Fi networks, run Mail Pilot in a public workspace, or suspect your terminal was exposed, click Rotate Secret above to instantly revoke old tunnel tokens and lock down your connection.
                      </p>
                    </div>
                  </div>
                </TabsContent>

                {/* Manual Setup Tab Content */}
                <TabsContent value="manual" className="mt-0 space-y-5 focus-visible:outline-none">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Run Ollama with an open bind, start a Quick Tunnel, then paste
                    the public URL below.
                  </p>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        macOS / Linux
                      </p>
                      <TerminalBlock
                        title="1 · serve"
                        code={macosServe}
                        copied={copiedSnippet === "mac-serve"}
                        onCopy={() => void copySnippet("mac-serve", macosServe)}
                      />
                      <TerminalBlock
                        title="2 · tunnel"
                        code={cloudflaredMac}
                        copied={copiedSnippet === "mac-tun"}
                        onCopy={() =>
                          void copySnippet("mac-tun", cloudflaredMac)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Windows
                      </p>
                      <TerminalBlock
                        title="1 · serve"
                        code={windowsServe}
                        copied={copiedSnippet === "win-serve"}
                        onCopy={() =>
                          void copySnippet("win-serve", windowsServe)
                        }
                      />
                      <TerminalBlock
                        title="2 · tunnel"
                        code={cloudflaredWin}
                        copied={copiedSnippet === "win-tun"}
                        onCopy={() =>
                          void copySnippet("win-tun", cloudflaredWin)
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-2 rounded-xl border border-border/80 bg-card/70 p-4 shadow-xs">
                    <Label
                      htmlFor="ollama-url"
                      className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
                    >
                      Tunnel URL
                    </Label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        id="ollama-url"
                        value={url}
                        disabled={disabled}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://xxxx.trycloudflare.com"
                        className="h-9 border-border/80 bg-background font-mono text-xs"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 shrink-0"
                        disabled={disabled || verifying || !url.trim()}
                        onClick={() => {
                          if (!accountId) return;
                          startTransition(async () => {
                            const result = await updateOllamaUrl(
                              accountId,
                              url,
                              selectedModel
                            );
                            if (!result.ok) {
                              toast.error(result.error);
                              return;
                            }
                            const ok =
                              (await handleVerifyConnection(url)) ===
                              "connected";
                            if (ok) {
                              toast.success("Tunnel saved and verified");
                            } else {
                              toast.success("Tunnel URL saved");
                              toast.error("Could not reach Ollama");
                            }
                          });
                        }}
                      >
                        {pending || verifying ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : null}
                        Save URL
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                {/* Bridge Status Bar with Primary Wifi CTA */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border border-border/80 bg-card p-4 shadow-xs">
                  <div className="flex items-center gap-2.5">
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
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-xs font-semibold text-foreground">
                        {isConnected
                          ? "Local Ollama Connected & Active"
                          : displayStatus === "checking"
                            ? "Verifying Bridge Connection…"
                            : "Waiting for bridge connection"}
                      </p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                        {isConnected
                          ? `Tunnel registered and listening via ${url.trim() || "local endpoint"}`
                          : "Run either command above to connect your local GPU/CPU"}
                      </p>
                      {statusMessage && (
                        <p className="text-xs text-muted-foreground">{statusMessage}</p>
                      )}
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="w-full sm:w-auto h-9 gap-2 text-xs font-medium shadow-sm"
                    disabled={disabled || verifying}
                    onClick={() => {
                      void handleVerifyConnection().then((status) => {
                        if (status === "connected") {
                          toast.success("Ollama connected");
                        } else {
                          toast.error("Could not reach Ollama");
                        }
                      });
                    }}
                  >
                    <Wifi
                      className={cn(
                        "size-4 shrink-0",
                        verifying && "animate-pulse text-teal-300"
                      )}
                      aria-hidden="true"
                    />
                    <span>{verifying ? "Verifying Bridge..." : "Check Connection"}</span>
                  </Button>
                </div>
              </Tabs>
            </div>

            {isDev ? (
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

            {/* Gated model picker */}
            {isConnected && (
              <div className="space-y-3 rounded-xl border border-border/80 bg-muted/10 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="ollama-model"
                      className="text-sm font-medium tracking-tight"
                    >
                      Active local model
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      Requests for this account run against this model.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8"
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
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Refresh
                  </Button>
                </div>

                {selectOptions.length > 0 ? (
                  <select
                    id="ollama-model"
                    className="flex h-10 w-full rounded-lg border border-border/80 bg-background px-3 py-2 text-sm shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No models returned. Click Refresh.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>

    {/* Cloud AI Provider & Credentials Card */}
    <Card className={cn(SETTINGS_CARD_CLASSNAME, "overflow-hidden")}>
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/50 p-3.5 space-y-0">
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
        <CardContent className="space-y-3.5 border-t border-border/50 p-4 animate-in fade-in-50 duration-200">
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
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/icons/ScrapingAnt Lucide Icon.png"
                      alt="ScrapingAnt"
                      className="size-[26px] shrink-0 object-contain dark:invert"
                      width={26}
                      height={26}
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
                  <div className="space-y-4 border-t border-border/50 bg-muted/10 p-3.5 animate-in fade-in-50 duration-200">
                    {/* ScrapingAnt API Key Field */}
                    <div className="space-y-2 rounded-xl border border-border/70 bg-card/75 p-3.5">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border/50 bg-card/75 pl-3 pr-1.5 text-foreground/75 shadow-sm transition-[box-shadow,border-color] focus-within:border-border focus-within:shadow">
                          <KeyRound
                            className="pointer-events-none size-4 shrink-0 text-foreground/45"
                            aria-hidden
                          />
                          <input
                            id="scrapingant-api-key"
                            type="password"
                            aria-label="ScrapingAnt API key"
                            placeholder={
                              maskedScrapingAntKey
                                ? `Current: ${maskedScrapingAntKey}, enter a new key to replace...`
                                : "ant-..."
                            }
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
                        {maskedScrapingAntKey ? (
                          <button
                            type="button"
                            className={cn(SECONDARY_DESTRUCTIVE_ACTION_BTN_CLASSNAME, "shrink-0")}
                            disabled={disabled || isClearingScrapingAntKey}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClearScrapingAntKey();
                            }}
                          >
                            {isClearingScrapingAntKey ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                <span>Deleting…</span>
                              </>
                            ) : (
                              <>
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>Delete</span>
                              </>
                            )}
                          </button>
                        ) : null}
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
                          ) : maskedScrapingAntKey ? (
                            <>
                              <Redo2 className="h-3.5 w-3.5" />
                              <span>Replace</span>
                            </>
                          ) : (
                            "Save"
                          )}
                        </button>
                      </div>

                      {!maskedScrapingAntKey ? (
                        <p className="text-[11px] text-muted-foreground">
                          Get a free key from{" "}
                          <a
                            href="https://scrapingant.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-foreground"
                          >
                            scrapingant.com
                          </a>
                          .
                        </p>
                      ) : null}
                    </div>

                    {/* ScrapingAnt Usage & Plan Control Panel */}
                    {maskedScrapingAntKey ? (
                      <ScrapingAntControlPanel
                        accountId={accountId}
                        initialUsage={scrapingAntUsage}
                        maskedApiKey={maskedScrapingAntKey}
                        disabled={disabled}
                      />
                    ) : null}
                  </div>
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
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/icons/HasData Lucide Icon.png"
                      alt="HasData"
                      className="size-[26px] shrink-0 object-contain dark:invert"
                      width={26}
                      height={26}
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
                  <div className="space-y-4 border-t border-border/50 bg-muted/10 p-3.5 animate-in fade-in-50 duration-200">
                    {/* HasData API Key Field */}
                    <div className="space-y-2 rounded-xl border border-border/70 bg-card/75 p-3.5">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border/50 bg-card/75 pl-3 pr-1.5 text-foreground/75 shadow-sm transition-[box-shadow,border-color] focus-within:border-border focus-within:shadow">
                          <KeyRound
                            className="pointer-events-none size-4 shrink-0 text-foreground/45"
                            aria-hidden
                          />
                          <input
                            id="hasdata-api-key"
                            type="password"
                            aria-label="HasData API key"
                            placeholder={
                              maskedHasDataKey
                                ? `Current: ${maskedHasDataKey}, enter a new key to replace...`
                                : "hd-..."
                            }
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
                        {maskedHasDataKey ? (
                          <button
                            type="button"
                            className={cn(SECONDARY_DESTRUCTIVE_ACTION_BTN_CLASSNAME, "shrink-0")}
                            disabled={disabled || isClearingHasDataKey}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClearHasDataKey();
                            }}
                          >
                            {isClearingHasDataKey ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                <span>Deleting…</span>
                              </>
                            ) : (
                              <>
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>Delete</span>
                              </>
                            )}
                          </button>
                        ) : null}
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
                          ) : maskedHasDataKey ? (
                            <>
                              <Redo2 className="h-3.5 w-3.5" />
                              <span>Replace</span>
                            </>
                          ) : (
                            "Save"
                          )}
                        </button>
                      </div>

                      {!maskedHasDataKey ? (
                        <p className="text-[11px] text-muted-foreground">
                          Get a free key from{" "}
                          <a
                            href="https://hasdata.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-foreground"
                          >
                            hasdata.com
                          </a>
                          .
                        </p>
                      ) : null}
                    </div>

                    {/* HasData Usage & Plan Control Panel */}
                    {maskedHasDataKey ? (
                      <HasDataControlPanel
                        accountId={accountId}
                        initialUsage={hasDataUsage}
                        maskedApiKey={maskedHasDataKey}
                        disabled={disabled}
                      />
                    ) : null}
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  </div>
  );
}
