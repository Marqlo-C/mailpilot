"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import {
  updateBridgeSecret,
  updateLlmProvider,
  updateOllamaUrl,
} from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type AiModelsCardProps = {
  accountId: string | null;
  accountEmail: string | null;
  llmProvider: string;
  localOllamaUrl: string;
  ollamaModel: string;
  bridgeSecret: string;
  availableModels?: string[];
  bridgeConnected?: boolean;
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

function CopySnippetButton({
  text,
  label = "Copy",
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 shrink-0 px-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
          toast.success("Copied");
        } catch {
          toast.error("Could not copy to clipboard");
        }
      }}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {label}
    </Button>
  );
}

function CodeBlock({
  title,
  code,
  copyDisabled,
}: {
  title?: string;
  code: string;
  copyDisabled?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-zinc-950 text-zinc-100">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
          {title ?? "Command"}
        </span>
        {!copyDisabled ? <CopySnippetButton text={code} label="Copy" /> : null}
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function AiModelsCard({
  accountId,
  accountEmail,
  llmProvider,
  localOllamaUrl,
  ollamaModel,
  bridgeSecret: initialBridgeSecret,
  availableModels: initialModels = [],
  bridgeConnected: initialConnected = false,
}: AiModelsCardProps) {
  const router = useRouter();
  const [url, setUrl] = useState(localOllamaUrl);
  const [selectedModel, setSelectedModel] = useState(ollamaModel);
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
  const connectionStatusRef = useRef(connectionStatus);
  const [bridgeSecret, setBridgeSecret] = useState(initialBridgeSecret);
  const [revealSecret, setRevealSecret] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedOsCommand, setCopiedOsCommand] = useState<"mac" | "win" | null>(
    null
  );
  const [bridgeOs, setBridgeOs] = useState<"mac" | "win">("mac");
  const [origin, setOrigin] = useState("https://mailpilot-prod.vercel.app");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [pending, startTransition] = useTransition();
  const useOllama = llmProvider === "LOCAL_OLLAMA";
  const disabled = !accountId || pending;
  const hasSecret = bridgeSecret.trim().length > 0;

  useEffect(() => {
    setBridgeSecret(initialBridgeSecret);
  }, [initialBridgeSecret]);

  useEffect(() => {
    connectionStatusRef.current = connectionStatus;
  }, [connectionStatus]);

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
    if (typeof window !== "undefined" && window.location?.origin) {
      setOrigin(window.location.origin);
    }
  }, []);

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

  const emailForCommand = accountEmail?.trim() ?? "";
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

  const runVerify = useCallback(
    async (opts?: {
      overrideUrl?: string;
      heartbeat?: boolean;
      silent?: boolean;
    }): Promise<ConnectionStatus> => {
      if (!accountId) return "waiting";
      if (!opts?.silent) setVerifying(true);

      const previous = connectionStatusRef.current;

      try {
        const payload: { url?: string; heartbeat?: boolean } = {};
        if (opts?.heartbeat) {
          payload.heartbeat = true;
        } else {
          const candidate = (opts?.overrideUrl ?? url).trim();
          if (candidate) payload.url = candidate;
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
            `Connected — ${data.models.length} model${data.models.length === 1 ? "" : "s"} available`
          );

          if (
            data.models.length > 0 &&
            !data.models.includes(selectedModel) &&
            accountId
          ) {
            const next = data.models[0]!;
            setSelectedModel(next);
            const active = data.activeUrl ?? opts?.overrideUrl ?? url;
            if (active.trim()) {
              await updateOllamaUrl(accountId, active.trim(), next);
            }
          }

          if (previous !== "connected") {
            router.refresh();
          }
          return "connected";
        }

        setConnectionStatus(status);
        if (data.cleared || status === "offline") {
          setUrl("");
          setModels([]);
          setStatusMessage(
            data.error ??
              "Tunnel closed or unreachable. Re-run the bridge command or save a new URL."
          );
        } else if (status === "waiting") {
          setStatusMessage(null);
        } else {
          setStatusMessage(
            data.error ?? "Could not reach Ollama. Is the bridge running?"
          );
        }

        if (previous === "connected" && status !== "connected") {
          router.refresh();
        }

        return status;
      } catch {
        setConnectionStatus("offline");
        setUrl("");
        setModels([]);
        setStatusMessage(
          "Tunnel closed or unreachable. Re-run the bridge command or save a new URL."
        );
        if (previous === "connected") {
          router.refresh();
        }
        return "offline";
      } finally {
        if (!opts?.silent) setVerifying(false);
      }
    },
    [accountId, router, selectedModel, url]
  );

  // Heartbeat every 3s while Local Ollama is enabled
  useEffect(() => {
    if (!useOllama || !accountId) return;

    void runVerify({ heartbeat: true, silent: true });
    const intervalId = window.setInterval(() => {
      void runVerify({ heartbeat: true, silent: true });
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [useOllama, accountId, runVerify]);

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

  const macosServe =
    'OLLAMA_HOST=0.0.0.0:11434 OLLAMA_ORIGINS="*" ollama serve';
  const windowsServe =
    '$env:OLLAMA_HOST="0.0.0.0:11434"; $env:OLLAMA_ORIGINS="*"; ollama serve';
  const cloudflaredMac =
    "curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64 -o /tmp/cloudflared && chmod +x /tmp/cloudflared && /tmp/cloudflared tunnel --url http://127.0.0.1:11434";
  const cloudflaredWin =
    '$cf="$env:TEMP\\cloudflared.exe"; if (-not (Test-Path $cf)) { Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cf -UseBasicParsing }; & $cf tunnel --url http://127.0.0.1:11434';

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI & Models</CardTitle>
        <CardDescription>
          Prefer local Ollama when available; otherwise use OpenRouter free-tier
          fallbacks.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!accountId && (
          <p className="text-sm text-muted-foreground">
            Connect an account to configure AI routing.
          </p>
        )}

        <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
          <div>
            <p className="text-sm font-medium">Use Local Ollama</p>
            <p className="text-xs text-muted-foreground">
              Falls back to OpenRouter if Ollama is unreachable. Turning off
              clears your bridge secret and tunnel URL.
            </p>
          </div>
          <Switch
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
                  toast.success("Local Ollama disabled — bridge secret cleared");
                }
                router.refresh();
              });
            }}
          />
        </div>

        {useOllama && (
          <div className="space-y-6">
            {/* SECTION 1: SETUP METHODS TABS */}
            <Tabs defaultValue="automated" className="w-full">
              <TabsList className="grid h-auto w-full grid-cols-2">
                <TabsTrigger value="automated" className="text-xs sm:text-sm">
                  Automated Bridge
                </TabsTrigger>
                <TabsTrigger value="manual" className="text-xs sm:text-sm">
                  Manual Setup
                </TabsTrigger>
              </TabsList>

              <TabsContent value="automated" className="mt-4 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Recommended — one command tunnels your local Ollama to
                  production with a personal CLI secret. Prerequisite: only the
                  Ollama desktop app is required (no Node.js).
                </p>

                <div className="space-y-2">
                  <Label>Bridge CLI Secret</Label>
                  <p className="text-xs text-muted-foreground">
                    Required for the automated bridge. Authenticates your
                    terminal against this account.
                  </p>

                  {!hasSecret ? (
                    <Button
                      type="button"
                      disabled={disabled}
                      onClick={() => handleGenerateSecret(false)}
                    >
                      {pending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      Generate Bridge Secret
                    </Button>
                  ) : (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Input
                        readOnly
                        type={revealSecret ? "text" : "password"}
                        value={bridgeSecret}
                        className="font-mono text-xs"
                        onFocus={() => setRevealSecret(true)}
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={disabled}
                          onClick={() => void copySecret()}
                        >
                          {copiedSecret ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          Copy
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={disabled}
                          onClick={() => handleGenerateSecret(true)}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Regenerate Secret
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label>One-click bridge command</Label>
                    <div className="inline-flex rounded-md border border-border bg-background p-0.5">
                      <button
                        type="button"
                        className={`rounded px-2.5 py-1 text-[11px] font-medium transition ${
                          bridgeOs === "mac"
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                        onClick={() => setBridgeOs("mac")}
                      >
                        macOS / Linux
                      </button>
                      <button
                        type="button"
                        className={`rounded px-2.5 py-1 text-[11px] font-medium transition ${
                          bridgeOs === "win"
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                        onClick={() => setBridgeOs("win")}
                      >
                        Windows
                      </button>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-md border border-border bg-zinc-950 text-zinc-100">
                    <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                        {bridgeOs === "mac"
                          ? "Bash (macOS / Linux)"
                          : "PowerShell (Windows)"}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                        disabled={!hasSecret || !accountEmail}
                        onClick={() => void copyOsCommand(bridgeOs)}
                      >
                        {copiedOsCommand === bridgeOs ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        Copy Command
                      </Button>
                    </div>
                    <pre className="overflow-x-auto whitespace-pre-wrap break-all p-3 font-mono text-xs leading-relaxed">
                      <code>{activeBridgeCommand}</code>
                    </pre>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Run this from any terminal window. No repo cloning or Node.js
                    required — only the Ollama desktop app.
                  </p>
                </div>

                <ol className="list-decimal space-y-1.5 pl-5 text-xs text-muted-foreground">
                  <li>Open the Ollama desktop app (or ensure it is running).</li>
                  <li>
                    Click{" "}
                    <strong className="text-foreground">
                      Generate Bridge Secret
                    </strong>{" "}
                    above.
                  </li>
                  <li>
                    Copy and run the{" "}
                    {bridgeOs === "mac" ? "macOS / Linux" : "Windows"} command
                    in your terminal.
                  </li>
                  <li>
                    Keep the terminal open — connection status updates
                    automatically below.
                  </li>
                </ol>

                <div className="flex gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-950 dark:text-amber-100">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="space-y-1.5">
                    <p>
                      <span className="font-medium">Why secrets matter:</span>{" "}
                      Your bridge secret authenticates your terminal against
                      your MailPilot account so nobody else can hijack your LLM
                      pipeline or alter where your requests route.
                    </p>
                    <p>
                      <span className="font-medium">Best practice:</span>{" "}
                      Regenerate your secret regularly, especially after testing
                      or switching networks, to instantly invalidate previous
                      tunnel sessions.
                    </p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="manual" className="mt-4 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Advanced — run Ollama with open bind + a standalone Cloudflare
                  Quick Tunnel, then paste the public URL below.
                </p>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">macOS / Linux</p>
                    <CodeBlock title="Tab 1 — Serve Ollama" code={macosServe} />
                    <CodeBlock
                      title="Tab 2 — cloudflared tunnel"
                      code={cloudflaredMac}
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Windows (PowerShell)</p>
                    <CodeBlock
                      title="Tab 1 — Serve Ollama"
                      code={windowsServe}
                    />
                    <CodeBlock
                      title="Tab 2 — cloudflared tunnel"
                      code={cloudflaredWin}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ollama-url">Local Ollama URL</Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="ollama-url"
                      value={url}
                      disabled={disabled}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://xxxx.trycloudflare.com"
                      className="font-mono text-xs"
                    />
                    <Button
                      type="button"
                      variant="outline"
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
                            (await runVerify({
                              overrideUrl: url,
                              silent: false,
                            })) === "connected";
                          if (ok) {
                            toast.success("Ollama URL saved and verified");
                          } else {
                            toast.success("Ollama URL saved");
                            toast.error("Could not verify connection yet");
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
                  <p className="text-[11px] text-muted-foreground">
                    Paste your generated trycloudflare.com address above and
                    click Save URL, then Check Connection below.
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            {/* SECTION 2: SHARED STATUS CARD (outside / below tabs) */}
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 p-4">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {displayStatus === "waiting" && (
                    <span className="text-amber-600">🟡 Disconnected</span>
                  )}
                  {displayStatus === "checking" && (
                    <span className="text-blue-600">⏳ Verifying tunnel...</span>
                  )}
                  {displayStatus === "connected" && (
                    <span className="text-emerald-600">🟢 Ollama Connected</span>
                  )}
                  {displayStatus === "error" && (
                    <span className="text-rose-600">
                      🔴 Offline / Unreachable
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {isConnected
                    ? `Active tunnel: ${url.trim() || "—"}`
                    : "Run your bridge command or provide a manual URL, then click Check Connection."}
                </p>
                {!isConnected && statusMessage && (
                  <p className="text-xs text-muted-foreground">{statusMessage}</p>
                )}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={disabled || verifying}
                onClick={() => {
                  void runVerify({ silent: false }).then((status) => {
                    if (status === "connected") {
                      toast.success("Ollama connection verified");
                    } else {
                      toast.error("Could not reach Ollama");
                    }
                  });
                }}
              >
                {verifying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Check Connection
                  </>
                )}
              </Button>
            </div>

            {/* SECTION 3: GATED MODEL SELECTOR (bottom only when connected) */}
            {isConnected && (
              <div className="space-y-3 rounded-lg border border-border bg-background p-4">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="ollama-model" className="text-sm font-medium">
                    Active Local Model
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled || verifying}
                    onClick={() => {
                      void runVerify({ silent: false }).then((status) => {
                        if (status === "connected") {
                          toast.success("Models refreshed");
                        } else {
                          toast.error("Could not refresh models");
                        }
                      });
                    }}
                  >
                    {verifying ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Refresh Models
                  </Button>
                </div>

                {selectOptions.length > 0 ? (
                  <select
                    id="ollama-model"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={
                      selectOptions.includes(selectedModel)
                        ? selectedModel
                        : selectOptions[0]
                    }
                    disabled={disabled}
                    onChange={(e) => {
                      const next = e.target.value;
                      setSelectedModel(next);
                      if (!accountId || !url.trim()) return;
                      startTransition(async () => {
                        await updateOllamaUrl(accountId, url, next);
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
                    No models returned yet. Click Refresh Models.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Requests for your account will execute locally against this
                  model.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
