"use client";

import { useEffect, useState, useTransition } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PRIMARY_ACTION_BTN_CLASSNAME } from "@/components/ui/styles/primary-action-btn";
import {
  CLOUD_LLM_PROVIDERS,
  type CloudLlmProvider,
} from "@/lib/llm/provider.ssot";
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

export function ApiKeysDialog({
  accountId,
  open,
  onOpenChange,
}: {
  accountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [status, setStatus] = useState<ApiKeyStatus | null>(null);
  const [provider, setProvider] = useState<CloudLlmProvider>("OPENROUTER");
  const [cloudKey, setCloudKey] = useState("");
  const [scrapingAntKey, setScrapingAntKey] = useState("");
  const [hasDataKey, setHasDataKey] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void readApiKeyStatus(accountId).then((result) => {
      if (cancelled) return;
      if (!result.ok || !result.data) {
        toast.error(result.ok ? "Could not load keys" : result.error);
        return;
      }
      setStatus(result.data);
      setProvider(result.data.cloudProvider);
      setCloudKey("");
      setScrapingAntKey("");
      setHasDataKey("");
    });
    return () => {
      cancelled = true;
    };
  }, [open, accountId]);

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
      setStatus((current) =>
        current
          ? {
              ...current,
              cloudProvider: provider,
              maskedApiKey: result.data?.maskedApiKey ?? current.maskedApiKey,
            }
          : current
      );
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
      setStatus((current) =>
        current ? { ...current, maskedApiKey: null } : current
      );
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
      setStatus((current) =>
        current ? { ...current, cloudProvider: next } : current
      );
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>API Keys</DialogTitle>
          <DialogDescription>
            Cloud model and scraping credentials for this account. Keys are encrypted before they are stored.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <section className="space-y-2">
            <Label htmlFor="sidebar-cloud-provider">Cloud model provider</Label>
            <select
              id="sidebar-cloud-provider"
              value={provider}
              disabled={pending}
              onChange={(event) =>
                changeProvider(event.target.value as CloudLlmProvider)
              }
              className="h-9 w-full cursor-pointer rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            >
              {CLOUD_LLM_PROVIDERS.map((item) => (
                <option key={item} value={item}>
                  {PROVIDER_LABEL[item]}
                </option>
              ))}
            </select>
            <KeyField
              id="sidebar-cloud-key"
              label="Cloud API key"
              masked={status?.maskedApiKey ?? null}
              value={cloudKey}
              pending={pending}
              onChange={setCloudKey}
              onSave={saveCloudKey}
              onClear={status?.maskedApiKey ? clearCloudKey : undefined}
            />
          </section>
          <KeyField
            id="sidebar-scrapingant-key"
            label="ScrapingAnt API key"
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
            onClear={
              status?.maskedScrapingAntApiKey
                ? () =>
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
                : undefined
            }
          />
          <KeyField
            id="sidebar-hasdata-key"
            label="HasData API key"
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
            onClear={
              status?.maskedHasDataApiKey
                ? () =>
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
                : undefined
            }
          />
        </div>
      </DialogContent>
    </Dialog>
  );

  function saveProxyKey(
    raw: string,
    save: (key: string) => Promise<
      | { ok: true; data?: { maskedScrapingAntApiKey?: string | null; maskedHasDataApiKey?: string | null } }
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
    clear: () => Promise<{ ok: true; data?: { cleared: true } } | { ok: false; error: string }>,
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
}

function KeyField({
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
  onClear?: () => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {masked ? (
        <p className="text-xs text-muted-foreground">Saved key {masked}</p>
      ) : (
        <p className="text-xs text-muted-foreground">No key saved</p>
      )}
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="password"
          autoComplete="off"
          value={value}
          disabled={pending}
          placeholder={masked ? "Replace key" : "Paste key"}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className={cn(PRIMARY_ACTION_BTN_CLASSNAME, "shrink-0")}
          disabled={pending}
          onClick={onSave}
        >
          Save
        </button>
        {onClear ? (
          <button
            type="button"
            className="shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
            disabled={pending}
            onClick={onClear}
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}
