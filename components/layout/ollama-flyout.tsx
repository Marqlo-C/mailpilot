"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wifi } from "lucide-react";
import {
  readOllamaStatus,
  updateOllamaModel,
  type OllamaStatus,
} from "@/app/actions/settings";
import {
  FLYOUT_LABEL_CLASS,
  FlyoutIconPill,
  FlyoutSelect,
} from "@/components/layout/sidebar-flyout-chrome";
import { DEV_OLLAMA_MODEL_STORAGE_KEY } from "@/components/features/settings/ai-models";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ConnectionState = "idle" | "checking" | "connected" | "offline" | "error";

type VerifyResponse = {
  connected?: boolean;
  status?: "connected" | "waiting" | "offline" | "error";
  models?: string[];
  activeUrl?: string;
  error?: string;
};

type OllamaCache = { accountId: string; data: OllamaStatus };
let ollamaCache: OllamaCache | null = null;
let ollamaInflight: Promise<OllamaStatus | null> | null = null;

/** Last bridge verify — survives flyout unmount so models don't reset on reopen. */
type LiveCheckCache = {
  accountId: string;
  connection: ConnectionState;
  message: string | null;
  models: string[];
};
let liveCheckCache: LiveCheckCache | null = null;

type DevModelsCache = { accountId: string; models: string[] };
let devModelsCache: DevModelsCache | null = null;

function applyOllamaStatus(data: OllamaStatus): {
  connection: ConnectionState;
  message: string;
} {
  return {
    connection: data.bridgeConnected ? "connected" : "idle",
    message: data.bridgeConnected
      ? data.localOllamaUrl || "Bridge marked connected"
      : data.localOllamaUrl
        ? "Last URL on file — check to confirm"
        : "No bridge registered yet",
  };
}

function rememberLiveCheck(next: LiveCheckCache) {
  liveCheckCache = next;
}

function rememberDevModels(accountId: string, models: string[]) {
  devModelsCache = { accountId, models };
}

function loadOllamaStatus(accountId: string): Promise<OllamaStatus | null> {
  if (ollamaCache?.accountId === accountId) {
    return Promise.resolve(ollamaCache.data);
  }
  if (ollamaInflight) return ollamaInflight;
  ollamaInflight = readOllamaStatus(accountId)
    .then((result) => {
      if (result.ok && result.data) {
        ollamaCache = { accountId, data: result.data };
        return result.data;
      }
      return null;
    })
    .finally(() => {
      ollamaInflight = null;
    });
  return ollamaInflight;
}

/** Warm Ollama settings during hover dwell so the flyout isn't empty on open. */
export function prefetchOllamaStatus(accountId: string): void {
  void loadOllamaStatus(accountId);
}

function cachedOllamaStatus(accountId: string): OllamaStatus | null {
  return ollamaCache?.accountId === accountId ? ollamaCache.data : null;
}

function cachedLiveCheck(accountId: string): LiveCheckCache | null {
  return liveCheckCache?.accountId === accountId ? liveCheckCache : null;
}

function cachedDevModels(accountId: string): string[] {
  return devModelsCache?.accountId === accountId ? devModelsCache.models : [];
}

function readStoredDevModel(): string {
  try {
    return localStorage.getItem(DEV_OLLAMA_MODEL_STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

/**
 * Sidebar flyout: check the local Ollama bridge and switch the active model.
 */
export function OllamaFlyout({ accountId }: { accountId: string }) {
  const router = useRouter();
  const isDev = process.env.NODE_ENV === "development";
  const cached = cachedOllamaStatus(accountId);
  const live = cachedLiveCheck(accountId);
  const cachedView = cached ? applyOllamaStatus(cached) : null;
  const [status, setStatus] = useState<OllamaStatus | null>(cached);
  const [connection, setConnection] = useState<ConnectionState>(
    live?.connection ?? cachedView?.connection ?? "idle"
  );
  const [message, setMessage] = useState<string | null>(
    live?.message ?? cachedView?.message ?? null
  );
  const [models, setModels] = useState<string[]>(
    live?.models ?? cached?.availableModels ?? []
  );
  const [selectedModel, setSelectedModel] = useState(
    cached?.ollamaModel ?? ""
  );
  const [loading, setLoading] = useState(!cached && !live);
  const [pending, startTransition] = useTransition();
  const [checkingDevModels, setCheckingDevModels] = useState(false);
  const initialDevModels = cachedDevModels(accountId);
  const [devModels, setDevModels] = useState<string[]>(initialDevModels);
  const [devSelectedModel, setDevSelectedModel] = useState(() => {
    const stored = readStoredDevModel();
    if (stored && initialDevModels.includes(stored)) return stored;
    return initialDevModels[0] ?? "";
  });

  useEffect(() => {
    let cancelled = false;
    const hit = cachedOllamaStatus(accountId);
    const priorCheck = cachedLiveCheck(accountId);
    const priorDev = cachedDevModels(accountId);
    if (priorDev.length > 0) {
      setDevModels(priorDev);
      const stored = readStoredDevModel();
      setDevSelectedModel((prev) => {
        if (prev && priorDev.includes(prev)) return prev;
        if (stored && priorDev.includes(stored)) return stored;
        return priorDev[0] ?? "";
      });
    }
    if (hit) {
      const view = applyOllamaStatus(hit);
      setStatus(hit);
      setSelectedModel(hit.ollamaModel);
      // Keep the last verify snapshot; only fall back to stored models.
      if (priorCheck) {
        setConnection(priorCheck.connection);
        setMessage(priorCheck.message);
        setModels(priorCheck.models);
      } else {
        setModels(hit.availableModels);
        setConnection(view.connection);
        setMessage(view.message);
      }
      setLoading(false);
    } else if (priorCheck) {
      setLoading(false);
    } else {
      setLoading(true);
    }

    void loadOllamaStatus(accountId).then((data) => {
      if (cancelled) return;
      setLoading(false);
      if (!data) {
        if (!hit && !priorCheck) toast.error("Could not load Ollama settings");
        return;
      }
      const view = applyOllamaStatus(data);
      setStatus(data);
      setSelectedModel(data.ollamaModel);
      const latestCheck = cachedLiveCheck(accountId);
      if (latestCheck) {
        setConnection(latestCheck.connection);
        setMessage(latestCheck.message);
        setModels(latestCheck.models);
        return;
      }
      setModels(data.availableModels);
      setConnection(view.connection);
      setMessage(view.message);
    });

    return () => {
      cancelled = true;
    };
  }, [accountId]);

  async function checkConnection() {
    setConnection("checking");
    setMessage("Checking bridge…");
    try {
      const res = await fetch("/api/ollama/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as VerifyResponse;
      const next: ConnectionState =
        data.status === "connected" || data.connected
          ? "connected"
          : data.status === "offline"
            ? "offline"
            : "error";

      if (next === "connected" && Array.isArray(data.models)) {
        const nextMessage = data.activeUrl
          ? `Connected · ${data.models.length} model${data.models.length === 1 ? "" : "s"}`
          : `${data.models.length} model${data.models.length === 1 ? "" : "s"} available`;
        setConnection(next);
        setModels(data.models);
        setMessage(nextMessage);
        rememberLiveCheck({
          accountId,
          connection: next,
          message: nextMessage,
          models: data.models,
        });
        if (ollamaCache?.accountId === accountId) {
          ollamaCache = {
            accountId,
            data: {
              ...ollamaCache.data,
              availableModels: data.models,
              bridgeConnected: true,
            },
          };
        }
        if (data.models.length > 0 && !data.models.includes(selectedModel)) {
          const first = data.models[0]!;
          setSelectedModel(first);
          startTransition(async () => {
            const result = await updateOllamaModel(accountId, first);
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            toast.success(`Model set to ${first}`);
            router.refresh();
          });
        } else {
          router.refresh();
        }
        return;
      }

      const failMessage =
        data.error ??
        "Tunnel unreachable. Keep the bridge terminal open, then try again.";
      setConnection(next);
      setModels([]);
      setMessage(failMessage);
      rememberLiveCheck({
        accountId,
        connection: next,
        message: failMessage,
        models: [],
      });
    } catch {
      setConnection("offline");
      setModels([]);
      setMessage("Could not reach the bridge endpoint.");
      rememberLiveCheck({
        accountId,
        connection: "offline",
        message: "Could not reach the bridge endpoint.",
        models: [],
      });
    }
  }

  function changeModel(next: string) {
    setSelectedModel(next);
    startTransition(async () => {
      const result = await updateOllamaModel(accountId, next);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setStatus((current) => {
        const updated = current
          ? { ...current, ollamaModel: next }
          : current;
        if (updated) ollamaCache = { accountId, data: updated };
        return updated;
      });
      toast.success(`Model set to ${next}`);
      router.refresh();
    });
  }

  function checkDevModels() {
    setCheckingDevModels(true);
    void (async () => {
      try {
        const res = await fetch("/api/ollama/dev-models", { method: "POST" });
        const data = (await res.json()) as {
          models?: string[];
          error?: string;
        };
        const names = Array.isArray(data.models) ? data.models : [];
        setDevModels(names);
        rememberDevModels(accountId, names);
        if (!res.ok || data.error || names.length === 0) {
          toast.error(data.error ?? "Could not list local models");
          return;
        }
        toast.success("Local models loaded");
        setDevSelectedModel((prev) => {
          if (prev && names.includes(prev)) return prev;
          const stored = readStoredDevModel();
          if (stored && names.includes(stored)) return stored;
          const fallback = names[0] ?? "";
          try {
            if (fallback) {
              localStorage.setItem(DEV_OLLAMA_MODEL_STORAGE_KEY, fallback);
            }
          } catch {
            // ignore
          }
          return fallback;
        });
      } catch {
        setDevModels([]);
        rememberDevModels(accountId, []);
        toast.error("Could not list local models");
      } finally {
        setCheckingDevModels(false);
      }
    })();
  }

  const statusTone =
    connection === "connected"
      ? "bg-emerald-400"
      : connection === "checking"
        ? "bg-sky-300"
        : connection === "idle"
          ? "bg-white/50"
          : "bg-[#c21f10]";

  if (loading && !status) {
    return (
      <div className="w-64 px-2.5 py-3 text-xs text-[#e4f7f3]/60">
        Loading Ollama…
      </div>
    );
  }

  const modelOptions =
    models.length > 0
      ? models
      : selectedModel
        ? [selectedModel]
        : [];

  return (
    <div className="flex w-64 flex-col gap-3 p-2" data-dnd-ignore="">
      <div className="space-y-1 px-0.5">
        <p className="text-[13px] font-semibold text-[#e4f7f3]">Local Ollama</p>
        <div className="flex items-center gap-2">
          <span
            className={cn("size-2 shrink-0 rounded-full", statusTone)}
            aria-hidden
          />
          <p className="min-w-0 flex-1 truncate text-[11px] text-[#e4f7f3]/60">
            {message ?? "Ready to check"}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="sidebar-ollama-model" className={FLYOUT_LABEL_CLASS}>
          Active model
        </label>
        <div className="flex items-center gap-1.5">
          <FlyoutSelect
            id="sidebar-ollama-model"
            value={selectedModel}
            disabled={pending || modelOptions.length === 0}
            placeholder="Check connection for models"
            onChange={changeModel}
            className="min-w-0 flex-1"
            options={modelOptions.map((model) => ({
              value: model,
              label: model,
            }))}
          />
          <FlyoutIconPill
            matchPairWidth={false}
            primary={{
              icon: connection === "checking" ? Loader2 : Wifi,
              label:
                connection === "checking"
                  ? "Checking connection"
                  : "Check connection",
              onClick: () => void checkConnection(),
              disabled: pending || connection === "checking",
              busy: connection === "checking",
            }}
          />
        </div>
      </div>

      {isDev ? (
        <div className="flex items-center gap-1.5 rounded-xl outline outline-1 outline-dashed outline-white/20 [outline-offset:6px]">
          <FlyoutSelect
            id="sidebar-dev-ollama-model"
            value={
              devModels.includes(devSelectedModel)
                ? devSelectedModel
                : (devModels[0] ?? "")
            }
            disabled={pending || devModels.length === 0}
            placeholder="Check for local models"
            onChange={(next) => {
              setDevSelectedModel(next);
              try {
                localStorage.setItem(DEV_OLLAMA_MODEL_STORAGE_KEY, next);
              } catch {
                // ignore
              }
              toast.success(`Dev model set to ${next} (local only)`);
            }}
            className="min-w-0 flex-1"
            options={devModels.map((model) => ({
              value: model,
              label: model,
            }))}
          />
          <FlyoutIconPill
            matchPairWidth={false}
            primary={{
              icon: checkingDevModels ? Loader2 : Wifi,
              label: checkingDevModels
                ? "Checking local models"
                : "Check local models",
              onClick: checkDevModels,
              disabled: pending || checkingDevModels,
              busy: checkingDevModels,
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
