"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Loader2,
  RefreshCw,
  Shield,
  Terminal,
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
import { cn } from "@/lib/utils";

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
  _debug?: {
    hypothesisId?: string;
    reason?: string;
    hadPayloadUrl?: boolean;
    hadStoredUrl?: boolean;
    hadStoredTunnel?: boolean;
    rawStoredHost?: string | null;
    httpWouldHaveBeen?: number;
    nowStatus?: number;
    issues?: string[];
    accountIdLen?: number;
    modelCount?: number;
  };
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
  const useOllama = llmProvider === "LOCAL_OLLAMA";
  const disabled = !accountId || pending;
  const hasSecret = bridgeSecret.trim().length > 0;

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
    // #region agent log
    fetch("http://127.0.0.1:7809/ingest/151252f8-c719-4220-ad29-b58c7990906d", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "3c315a",
      },
      body: JSON.stringify({
        sessionId: "3c315a",
        runId: "post-fix",
        hypothesisId: "A",
        location: "ai-models-card.tsx:mounted",
        message: "client mounted; origin will switch",
        data: {
          windowOrigin:
            typeof window !== "undefined" ? window.location.origin : null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
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
      const candidate = (overrideUrl ?? url).trim();
      const payload: { url?: string } = {};
      // Only forward real Cloudflare tunnels; never the schema default localhost
      if (
        candidate &&
        (() => {
          try {
            const host = new URL(candidate).hostname.toLowerCase();
            return host.endsWith(".trycloudflare.com");
          } catch {
            return false;
          }
        })()
      ) {
        payload.url = candidate;
      }

      // #region agent log
      fetch("http://127.0.0.1:7809/ingest/151252f8-c719-4220-ad29-b58c7990906d", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "3c315a",
        },
        body: JSON.stringify({
          sessionId: "3c315a",
          runId: "post-fix",
          hypothesisId: "E",
          location: "ai-models-card.tsx:handleVerifyConnection",
          message: "verify click start",
          data: {
            hasCandidate: Boolean(candidate),
            candidateLen: candidate.length,
            payloadHasUrl: Boolean(payload.url),
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      const res = await fetch("/api/ollama/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as VerifyResponse;

      // #region agent log
      fetch("http://127.0.0.1:7809/ingest/151252f8-c719-4220-ad29-b58c7990906d", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "3c315a",
        },
        body: JSON.stringify({
          sessionId: "3c315a",
          runId: "post-fix",
          hypothesisId: data._debug?.hypothesisId ?? "B",
          location: "ai-models-card.tsx:handleVerifyConnection",
          message: "verify response (prod-forwarded)",
          data: {
            httpStatus: res.status,
            connected: data.connected ?? false,
            status: data.status ?? null,
            error: data.error ?? null,
            serverDebug: data._debug ?? null,
            pageOrigin:
              typeof window !== "undefined" ? window.location.origin : null,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      const status: ConnectionStatus =
        data.status ??
        (data.connected ? "connected" : data.error ? "error" : "waiting");

      if (status === "connected" && Array.isArray(data.models)) {
        setConnectionStatus("connected");
        setModels(data.models);
        if (data.activeUrl) setUrl(data.activeUrl);
        setStatusMessage(
          `${data.models.length} model${data.models.length === 1 ? "" : "s"} available`
        );

        if (
          data.models.length > 0 &&
          !data.models.includes(selectedModel) &&
          accountId
        ) {
          const next = data.models[0]!;
          setSelectedModel(next);
          const active = data.activeUrl ?? candidate;
          if (active.trim()) {
            await updateOllamaUrl(accountId, active.trim(), next);
          }
        }

        router.refresh();
        return "connected";
      }

      setConnectionStatus(status);
      if (data.cleared || status === "offline") {
        setUrl("");
        setModels([]);
      }
      setStatusMessage(
        data.error ??
          "Tunnel unreachable. Keep the bridge terminal open, then try again."
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
    'CF=/tmp/cloudflared; if command -v cloudflared >/dev/null 2>&1; then CF="$(command -v cloudflared)"; elif [ ! -x "$CF" ]; then curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz" | tar -xz -C /tmp && chmod +x "$CF" && xattr -d com.apple.quarantine "$CF" 2>/dev/null || true; fi; "$CF" tunnel --url http://127.0.0.1:11434';
  const cloudflaredWin =
    '$cf="$env:TEMP\\cloudflared.exe"; if (-not (Test-Path $cf)) { Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cf -UseBasicParsing }; & $cf tunnel --url http://127.0.0.1:11434';

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm">
      <CardHeader className="border-b border-border/60 bg-muted/20 pb-5">
        <CardTitle className="text-lg tracking-tight">AI & Models</CardTitle>
        <CardDescription>
          Route inference through local Ollama or fall back to OpenRouter.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {!accountId && (
          <p className="text-sm text-muted-foreground">
            Connect an account to configure AI routing.
          </p>
        )}

        <div className="flex items-center justify-between gap-4 rounded-xl border border-border/80 bg-background px-4 py-3.5">
          <div className="space-y-0.5">
            <p className="text-sm font-medium tracking-tight">Use Local Ollama</p>
            <p className="text-xs text-muted-foreground">
              Disabling clears the bridge secret and stored tunnel URL.
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
            {/* Setup methods */}
            <Tabs defaultValue="automated" className="w-full">
              <TabsList className="grid h-10 w-full grid-cols-2 rounded-lg bg-muted/60 p-1">
                <TabsTrigger
                  value="automated"
                  className="rounded-md text-xs font-medium data-[state=active]:shadow-sm sm:text-sm"
                >
                  Automated Bridge
                </TabsTrigger>
                <TabsTrigger
                  value="manual"
                  className="rounded-md text-xs font-medium data-[state=active]:shadow-sm sm:text-sm"
                >
                  Manual Setup
                </TabsTrigger>
              </TabsList>

              <TabsContent value="automated" className="mt-4 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Recommended — one command tunnels your local Ollama to
                  production with a personal CLI secret. Prerequisite: only the{" "}
                  <a
                    href="https://ollama.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-foreground underline underline-offset-2 hover:text-primary"
                  >
                    Ollama desktop app
                  </a>{" "}
                  is required (no Node.js).
                </p>

                {/* Secret (required before command unlocks) */}
                {!hasSecret ? (
                  <Button
                    type="button"
                    size="sm"
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
                  <div className="flex flex-col gap-2 rounded-xl border border-border/80 bg-muted/15 p-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <Shield className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <Input
                        readOnly
                        type={revealSecret ? "text" : "password"}
                        value={bridgeSecret}
                        className="h-8 border-border/80 bg-background font-mono text-xs"
                        onFocus={() => setRevealSecret(true)}
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0"
                      disabled={disabled}
                      onClick={() => void copySecret()}
                    >
                      {copiedSecret ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      Copy Secret
                    </Button>
                  </div>
                )}

                {/* Platform switcher & secret rotation */}
                <div className="flex items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Platform
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setBridgeOs("mac")}
                        className={cn(
                          "rounded-md px-2.5 py-1 font-mono text-xs transition-colors",
                          bridgeOs === "mac"
                            ? "bg-foreground/10 font-medium text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        macOS / Linux
                      </button>
                      <button
                        type="button"
                        onClick={() => setBridgeOs("win")}
                        className={cn(
                          "rounded-md px-2.5 py-1 font-mono text-xs transition-colors",
                          bridgeOs === "win"
                            ? "bg-foreground/10 font-medium text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        Windows
                      </button>
                    </div>
                  </div>

                  {hasSecret ? (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => handleGenerateSecret(true)}
                      className="text-[11px] text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
                    >
                      Rotate Secret
                    </button>
                  ) : null}
                </div>

                {/* Command block */}
                <div className="group relative rounded-lg border border-zinc-800/80 bg-zinc-950 p-3.5 shadow-inner">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex select-all items-start gap-2.5 break-all font-mono text-xs leading-relaxed text-zinc-300">
                      <span className="select-none text-zinc-600">$</span>
                      <span>{activeBridgeCommand}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 shrink-0 p-0 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                      disabled={!hasSecret || !accountEmail}
                      onClick={() => void copyOsCommand(bridgeOs)}
                    >
                      {copiedOsCommand === bridgeOs ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground">
                  Run this from any terminal window. No repo cloning or Node.js
                  required — only the Ollama desktop app.
                </p>

                <ol className="list-decimal space-y-1.5 pl-5 text-xs text-muted-foreground">
                  <li>
                    Open the{" "}
                    <a
                      href="https://ollama.com"
                      target="_blank"
                      rel="noreferrer"
                      className="text-foreground underline underline-offset-2 hover:text-primary"
                    >
                      Ollama desktop app
                    </a>{" "}
                    (or ensure it is running).
                  </li>
                  <li>Click Generate Bridge Secret above.</li>
                  <li>
                    Copy and run the{" "}
                    {bridgeOs === "mac" ? "macOS / Linux" : "Windows"} command
                    in your terminal.
                  </li>
                  <li>
                    Keep the terminal open, then click Check Connection below.
                  </li>
                </ol>

                <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400/90">
                  <span className="mt-0.5 shrink-0 text-sm" aria-hidden>
                    ⚠️
                  </span>
                  <div className="space-y-1.5 leading-relaxed">
                    <p>
                      <span className="font-medium text-foreground">
                        Why secrets matter:
                      </span>{" "}
                      <span className="text-[11px] text-muted-foreground">
                        Your bridge secret authenticates your terminal against
                        your MailPilot account so nobody else can hijack your
                        LLM pipeline or alter where your requests route.
                      </span>
                    </p>
                    <p>
                      <span className="font-medium text-foreground">
                        Best practice:
                      </span>{" "}
                      <span className="text-[11px] text-muted-foreground">
                        Regenerate your secret regularly, especially after
                        testing or switching networks, to instantly invalidate
                        previous tunnel sessions.
                      </span>
                    </p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="manual" className="mt-5 space-y-5">
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

                <div className="space-y-2 rounded-xl border border-border/80 bg-muted/15 p-4">
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
                            toast.error("Could not verify yet");
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
            </Tabs>

            {/* Status — outside tabs */}
            <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1.5">
                <div className="flex items-center gap-2.5">
                  <StatusDot status={displayStatus} />
                  <span className="text-sm font-medium tracking-tight">
                    {displayStatus === "connected" && "Connected"}
                    {displayStatus === "checking" && "Verifying tunnel…"}
                    {displayStatus === "waiting" && "Waiting for bridge"}
                    {displayStatus === "error" && "Offline / unreachable"}
                  </span>
                </div>
                <p className="truncate font-mono text-[11px] text-muted-foreground">
                  {isConnected
                    ? url.trim() || "—"
                    : "Run the bridge command, then Check Connection."}
                </p>
                {statusMessage && (
                  <p className="text-xs text-muted-foreground">{statusMessage}</p>
                )}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 shrink-0"
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
                {verifying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking…
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Check Connection
                  </>
                )}
              </Button>
            </div>

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
                    No models returned. Click Refresh.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
