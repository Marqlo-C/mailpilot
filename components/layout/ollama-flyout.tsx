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

/**
 * Sidebar flyout: check the local Ollama bridge and switch the active model.
 */
export function OllamaFlyout({ accountId }: { accountId: string }) {
  const router = useRouter();
  const cached = cachedOllamaStatus(accountId);
  const cachedView = cached ? applyOllamaStatus(cached) : null;
  const [status, setStatus] = useState<OllamaStatus | null>(cached);
  const [connection, setConnection] = useState<ConnectionState>(
    cachedView?.connection ?? "idle"
  );
  const [message, setMessage] = useState<string | null>(
    cachedView?.message ?? null
  );
  const [models, setModels] = useState<string[]>(cached?.availableModels ?? []);
  const [selectedModel, setSelectedModel] = useState(
    cached?.ollamaModel ?? ""
  );
  const [loading, setLoading] = useState(!cached);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    const hit = cachedOllamaStatus(accountId);
    if (hit) {
      const view = applyOllamaStatus(hit);
      setStatus(hit);
      setSelectedModel(hit.ollamaModel);
      setModels(hit.availableModels);
      setConnection(view.connection);
      setMessage(view.message);
      setLoading(false);
    } else {
      setLoading(true);
    }

    void loadOllamaStatus(accountId).then((data) => {
      if (cancelled) return;
      setLoading(false);
      if (!data) {
        if (!hit) toast.error("Could not load Ollama settings");
        return;
      }
      const view = applyOllamaStatus(data);
      setStatus(data);
      setSelectedModel(data.ollamaModel);
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
      setConnection(next);

      if (next === "connected" && Array.isArray(data.models)) {
        setModels(data.models);
        setMessage(
          data.activeUrl
            ? `Connected · ${data.models.length} model${data.models.length === 1 ? "" : "s"}`
            : `${data.models.length} model${data.models.length === 1 ? "" : "s"} available`
        );
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

      setModels([]);
      setMessage(
        data.error ??
          "Tunnel unreachable. Keep the bridge terminal open, then try again."
      );
    } catch {
      setConnection("offline");
      setModels([]);
      setMessage("Could not reach the bridge endpoint.");
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
    </div>
  );
}
