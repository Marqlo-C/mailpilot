"use client";

import { useEffect, useState, useTransition } from "react";
import { Save, Trash2 } from "lucide-react";
import {
  clearCustomLlmKey,
  clearHasDataApiKey,
  clearScrapingAntApiKey,
  readApiKeyStatus,
  saveCustomLlmKey,
  saveHasDataApiKey,
  saveScrapingAntApiKey,
  updateRule,
  type ApiKeyStatus,
} from "@/app/actions/settings";
import {
  FLYOUT_FIELD_CLASS,
  FLYOUT_LABEL_CLASS,
  FlyoutIconPill,
  FlyoutSelect,
} from "@/components/layout/sidebar-flyout-chrome";
import {
  CLOUD_LLM_PROVIDERS,
  type CloudLlmProvider,
} from "@/lib/ai/provider.schema";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PROVIDER_LABEL: Record<CloudLlmProvider, string> = {
  OPENROUTER: "OpenRouter",
  OPENAI: "OpenAI",
  GROQ: "Groq",
  DEEPSEEK: "DeepSeek",
  ANTHROPIC: "Anthropic",
  GEMINI: "Gemini",
};

type ApiKeyCache = { accountId: string; data: ApiKeyStatus };
let apiKeyCache: ApiKeyCache | null = null;
let apiKeyInflight: Promise<ApiKeyStatus | null> | null = null;

function loadApiKeyStatus(accountId: string): Promise<ApiKeyStatus | null> {
  if (apiKeyCache?.accountId === accountId) {
    return Promise.resolve(apiKeyCache.data);
  }
  if (apiKeyInflight) return apiKeyInflight;
  apiKeyInflight = readApiKeyStatus(accountId)
    .then((result) => {
      if (result.ok && result.data) {
        apiKeyCache = { accountId, data: result.data };
        return result.data;
      }
      return null;
    })
    .finally(() => {
      apiKeyInflight = null;
    });
  return apiKeyInflight;
}

/** Warm the key status during hover dwell so the flyout isn't empty on open. */
export function prefetchApiKeyStatus(accountId: string): void {
  void loadApiKeyStatus(accountId);
}

function cachedApiKeyStatus(accountId: string): ApiKeyStatus | null {
  return apiKeyCache?.accountId === accountId ? apiKeyCache.data : null;
}

/**
 * Compact API-key editor for the sidebar flyout.
 * Same save/clear paths as before, with section-order style icon actions.
 */
export function ApiKeysFlyout({ accountId }: { accountId: string }) {
  const cached = cachedApiKeyStatus(accountId);
  const [status, setStatus] = useState<ApiKeyStatus | null>(cached);
  const [provider, setProvider] = useState<CloudLlmProvider>(
    cached?.cloudProvider ?? "OPENROUTER"
  );
  const [cloudKey, setCloudKey] = useState("");
  const [scrapingAntKey, setScrapingAntKey] = useState("");
  const [hasDataKey, setHasDataKey] = useState("");
  const [loading, setLoading] = useState(!cached);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    const hit = cachedApiKeyStatus(accountId);
    if (hit) {
      setStatus(hit);
      setProvider(hit.cloudProvider);
      setLoading(false);
    } else {
      setLoading(true);
    }

    void loadApiKeyStatus(accountId).then((data) => {
      if (cancelled) return;
      setLoading(false);
      if (!data) {
        if (!hit) toast.error("Could not load keys");
        return;
      }
      setStatus(data);
      setProvider(data.cloudProvider);
      setCloudKey("");
      setScrapingAntKey("");
      setHasDataKey("");
    });

    return () => {
      cancelled = true;
    };
  }, [accountId]);

  function saveCloudKey() {
    const key = cloudKey.trim();
    if (!key) {
      toast.error("Enter an API key");
      return;
    }
    startTransition(async () => {
      const result = await saveCustomLlmKey(accountId, {
        provider,
        apiKey: key,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setStatus((current) => {
        const next = current
          ? {
              ...current,
              cloudProvider: provider,
              maskedApiKey: result.data?.maskedApiKey ?? current.maskedApiKey,
            }
          : current;
        if (next) apiKeyCache = { accountId, data: next };
        return next;
      });
      setCloudKey("");
      toast.success("Cloud API key saved");
    });
  }

  function clearCloudKey() {
    startTransition(async () => {
      const result = await clearCustomLlmKey(accountId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setStatus((current) => {
        const next = current ? { ...current, maskedApiKey: null } : current;
        if (next) apiKeyCache = { accountId, data: next };
        return next;
      });
      toast.success("Cloud API key cleared");
    });
  }

  function changeProvider(next: CloudLlmProvider) {
    setProvider(next);
    startTransition(async () => {
      const result = await updateRule(accountId, "cloudProvider", next);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setStatus((current) => {
        const updated = current
          ? { ...current, cloudProvider: next }
          : current;
        if (updated) apiKeyCache = { accountId, data: updated };
        return updated;
      });
    });
  }

  function saveProxyKey(
    raw: string,
    save: (key: string) => Promise<
      | {
          ok: true;
          data?: {
            maskedScrapingAntApiKey?: string | null;
            maskedHasDataApiKey?: string | null;
          };
        }
      | { ok: false; error: string }
    >,
    applyMask: (masked: string | null) => void,
    clearInput: (value: string) => void,
    success: string
  ) {
    const key = raw.trim();
    if (!key) {
      toast.error("Enter an API key");
      return;
    }
    startTransition(async () => {
      const result = await save(key);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const masked =
        result.data?.maskedScrapingAntApiKey ??
        result.data?.maskedHasDataApiKey ??
        null;
      applyMask(masked);
      clearInput("");
      toast.success(success);
    });
  }

  function clearProxyKey(
    clear: () => Promise<
      { ok: true; data?: { cleared: true } } | { ok: false; error: string }
    >,
    apply: () => void,
    success: string
  ) {
    startTransition(async () => {
      const result = await clear();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      apply();
      toast.success(success);
    });
  }

  if (loading && !status) {
    return (
      <div className="w-72 px-2.5 py-3 text-xs text-[#e4f7f3]/60">
        Loading keys…
      </div>
    );
  }

  return (
    <div className="flex w-72 flex-col gap-3 p-2" data-dnd-ignore="">
      <div className="space-y-1 px-0.5">
        <p className="text-[13px] font-semibold text-[#e4f7f3]">API Keys</p>
        <p className="text-[11px] leading-snug text-[#e4f7f3]/55">
          Encrypted for this account. Paste a key, then save.
        </p>
      </div>

      <section className="space-y-1.5">
        <label htmlFor="sidebar-cloud-provider" className={FLYOUT_LABEL_CLASS}>
          Cloud provider
        </label>
        <FlyoutSelect
          id="sidebar-cloud-provider"
          value={provider}
          disabled={pending}
          onChange={(next) => changeProvider(next as CloudLlmProvider)}
          options={CLOUD_LLM_PROVIDERS.map((item) => ({
            value: item,
            label: PROVIDER_LABEL[item],
          }))}
        />
        <KeyRow
          id="sidebar-cloud-key"
          label="Cloud key"
          masked={status?.maskedApiKey ?? null}
          value={cloudKey}
          pending={pending}
          onChange={setCloudKey}
          onSave={saveCloudKey}
          onClear={clearCloudKey}
        />
      </section>

      <KeyRow
        id="sidebar-scrapingant-key"
        label="ScrapingAnt"
        masked={status?.maskedScrapingAntApiKey ?? null}
        value={scrapingAntKey}
        pending={pending}
        onChange={setScrapingAntKey}
        onSave={() =>
          saveProxyKey(
            scrapingAntKey,
            (key) => saveScrapingAntApiKey(accountId, key),
            (masked) =>
              setStatus((current) =>
                current
                  ? { ...current, maskedScrapingAntApiKey: masked }
                  : current
              ),
            setScrapingAntKey,
            "ScrapingAnt API key saved"
          )
        }
        onClear={() =>
          clearProxyKey(
            () => clearScrapingAntApiKey(accountId),
            () =>
              setStatus((current) =>
                current
                  ? { ...current, maskedScrapingAntApiKey: null }
                  : current
              ),
            "ScrapingAnt API key cleared"
          )
        }
      />

      <KeyRow
        id="sidebar-hasdata-key"
        label="HasData"
        masked={status?.maskedHasDataApiKey ?? null}
        value={hasDataKey}
        pending={pending}
        onChange={setHasDataKey}
        onSave={() =>
          saveProxyKey(
            hasDataKey,
            (key) => saveHasDataApiKey(accountId, key),
            (masked) =>
              setStatus((current) =>
                current
                  ? { ...current, maskedHasDataApiKey: masked }
                  : current
              ),
            setHasDataKey,
            "HasData API key saved"
          )
        }
        onClear={() =>
          clearProxyKey(
            () => clearHasDataApiKey(accountId),
            () =>
              setStatus((current) =>
                current
                  ? { ...current, maskedHasDataApiKey: null }
                  : current
              ),
            "HasData API key cleared"
          )
        }
      />
    </div>
  );
}

function KeyRow({
  id,
  label,
  masked,
  value,
  pending,
  onChange,
  onSave,
  onClear,
}: {
  id: string;
  label: string;
  masked: string | null;
  value: string;
  pending: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onClear: () => void;
}) {
  const hasSavedKey = Boolean(masked);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1.5 gap-y-1.5">
      <label htmlFor={id} className={cn(FLYOUT_LABEL_CLASS, "px-0.5")}>
        {label}
      </label>
      <span className="max-w-[4.25rem] truncate text-center text-[10px] leading-none text-[#e4f7f3]/45">
        {masked ? masked : "None saved"}
      </span>
      <input
        id={id}
        type="password"
        autoComplete="off"
        value={value}
        disabled={pending}
        placeholder={masked ? "Replace" : "Paste key"}
        onChange={(event) => onChange(event.target.value)}
        className={FLYOUT_FIELD_CLASS}
      />
      <FlyoutIconPill
        matchPairWidth
        primary={{
          icon: Save,
          label: "Save key",
          onClick: onSave,
          disabled: pending,
        }}
        secondary={{
          icon: Trash2,
          label: hasSavedKey ? "Delete key" : "No key saved",
          onClick: onClear,
          disabled: pending || !hasSavedKey,
        }}
      />
    </div>
  );
}
