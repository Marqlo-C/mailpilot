"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Worm, X } from "lucide-react";
import { Loader } from "@/components/ui/loader";
import { toast } from "sonner";
import { formatToastError } from "@/lib/utils/ui/toast-format";

import {
  clearHasDataApiKey,
  clearScrapingAntApiKey,
  saveHasDataApiKey,
  saveScrapingAntApiKey,
  updateRule,
} from "@/app/actions/settings";
import { SETTINGS_CARD_CLASSNAME } from "@/lib/utils/navigation/settings-chrome";
import {
  HasDataControlPanel,
  ScrapingAntControlPanel,
} from "@/components/features/settings/scraping";
import { CompanyLogo } from "@/components/ui/logo-frame";
import {
  SettingsFeatureCard,
  SettingsSectionCard,
} from "@/components/ui/tactile/nested-settings-card";
import { WaveToggle } from "@/components/ui/tactile/wave-toggle";
import { PRIMARY_ACTION_BTN_CLASSNAME } from "@/components/ui/styles/primary-action-btn";
import { SECONDARY_ACTION_BTN_CLASSNAME } from "@/components/ui/styles/secondary-action-btn";
import type { HasDataUsage, ScrapingAntUsage } from "@/lib/validations/rules.schema";
import { cn } from "@/lib/utils";

export interface BotBypassCardProps {
  accountId: string | null;
  enableWebScrapingProxies?: boolean;
  maskedScrapingAntApiKey?: string | null;
  scrapingAntUsage?: ScrapingAntUsage | null;
  maskedHasDataApiKey?: string | null;
  hasDataUsage?: HasDataUsage | null;
  maskedJinaApiKey?: string | null;
}

export function BotBypassCard({
  accountId,
  enableWebScrapingProxies: initialEnableWebScrapingProxies = true,
  maskedScrapingAntApiKey: initialMaskedScrapingAntApiKey = null,
  scrapingAntUsage: initialScrapingAntUsage = null,
  maskedHasDataApiKey: initialMaskedHasDataApiKey = null,
  hasDataUsage: initialHasDataUsage = null,
  maskedJinaApiKey: initialMaskedJinaApiKey = null,
}: BotBypassCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const effectiveMaskedScrapingAntKey =
    initialMaskedScrapingAntApiKey ?? initialMaskedJinaApiKey ?? null;

  const [enableWebScrapingProxies, setEnableWebScrapingProxies] =
    useState<boolean>(initialEnableWebScrapingProxies);

  // Sub-cards expansion state
  const [scrapingAntSubOpen, setScrapingAntSubOpen] = useState<boolean>(
    Boolean(effectiveMaskedScrapingAntKey)
  );
  const [hasDataSubOpen, setHasDataSubOpen] = useState<boolean>(
    Boolean(initialMaskedHasDataApiKey)
  );

  // ScrapingAnt states
  const [scrapingAntUsage, setScrapingAntUsage] =
    useState<ScrapingAntUsage | null>(initialScrapingAntUsage);
  const [maskedScrapingAntKey, setMaskedScrapingAntKey] = useState<
    string | null
  >(effectiveMaskedScrapingAntKey);
  const [scrapingAntApiKeyInput, setScrapingAntApiKeyInput] = useState("");
  const [isSavingScrapingAntKey, setIsSavingScrapingAntKey] = useState(false);
  const [isClearingScrapingAntKey, setIsClearingScrapingAntKey] =
    useState(false);
  const [isReplacingScrapingAntKey, setIsReplacingScrapingAntKey] =
    useState(false);

  // HasData states
  const [hasDataUsage, setHasDataUsage] = useState<HasDataUsage | null>(
    initialHasDataUsage
  );
  const [maskedHasDataKey, setMaskedHasDataKey] = useState<string | null>(
    initialMaskedHasDataApiKey
  );
  const [hasDataApiKeyInput, setHasDataApiKeyInput] = useState("");
  const [isSavingHasDataKey, setIsSavingHasDataKey] = useState(false);
  const [isClearingHasDataKey, setIsClearingHasDataKey] = useState(false);
  const [isReplacingHasDataKey, setIsReplacingHasDataKey] = useState(false);

  const disabled = !accountId || pending;

  const [prevBypassProps, setPrevBypassProps] = useState({
    initialEnableWebScrapingProxies,
    initialMaskedScrapingAntApiKey,
    initialMaskedJinaApiKey,
    initialScrapingAntUsage,
    initialMaskedHasDataApiKey,
    initialHasDataUsage,
  });
  if (
    prevBypassProps.initialEnableWebScrapingProxies !==
      initialEnableWebScrapingProxies ||
    prevBypassProps.initialMaskedScrapingAntApiKey !==
      initialMaskedScrapingAntApiKey ||
    prevBypassProps.initialMaskedJinaApiKey !== initialMaskedJinaApiKey ||
    prevBypassProps.initialScrapingAntUsage !== initialScrapingAntUsage ||
    prevBypassProps.initialMaskedHasDataApiKey !==
      initialMaskedHasDataApiKey ||
    prevBypassProps.initialHasDataUsage !== initialHasDataUsage
  ) {
    setPrevBypassProps({
      initialEnableWebScrapingProxies,
      initialMaskedScrapingAntApiKey,
      initialMaskedJinaApiKey,
      initialScrapingAntUsage,
      initialMaskedHasDataApiKey,
      initialHasDataUsage,
    });
    setEnableWebScrapingProxies(initialEnableWebScrapingProxies);
    setMaskedScrapingAntKey(
      initialMaskedScrapingAntApiKey ?? initialMaskedJinaApiKey ?? null
    );
    setScrapingAntUsage(initialScrapingAntUsage);
    setMaskedHasDataKey(initialMaskedHasDataApiKey);
    setHasDataUsage(initialHasDataUsage);
  }

  function handleSaveScrapingAntKey() {
    if (!accountId) return;
    const key = scrapingAntApiKeyInput.trim();
    if (!key) {
      toast.error("Enter ScrapingAnt key");
      return;
    }

    setIsSavingScrapingAntKey(true);
    startTransition(async () => {
      try {
        const result = await saveScrapingAntApiKey(accountId, key);
        if (!result.ok) {
          toast.error(formatToastError(result.error));
          return;
        }
        setMaskedScrapingAntKey(result.data?.maskedScrapingAntApiKey ?? null);
        if (result.data?.scrapingAntUsage) {
          setScrapingAntUsage(result.data.scrapingAntUsage);
        }
        setScrapingAntApiKeyInput("");
        setIsReplacingScrapingAntKey(false);
        toast.success("ScrapingAnt key saved");
        router.refresh();
      } catch {
        toast.error("Failed to save key");
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
          toast.error(formatToastError(result.error));
          return;
        }
        setMaskedScrapingAntKey(null);
        setScrapingAntUsage(null);
        setScrapingAntApiKeyInput("");
        setIsReplacingScrapingAntKey(false);
        toast.success("ScrapingAnt key removed");
        router.refresh();
      } catch {
        toast.error("Failed to clear key");
      } finally {
        setIsClearingScrapingAntKey(false);
      }
    });
  }

  function handleSaveHasDataKey() {
    if (!accountId) return;
    const key = hasDataApiKeyInput.trim();
    if (!key) {
      toast.error("Enter HasData key");
      return;
    }

    setIsSavingHasDataKey(true);
    startTransition(async () => {
      try {
        const result = await saveHasDataApiKey(accountId, key);
        if (!result.ok) {
          toast.error(formatToastError(result.error));
          return;
        }
        setMaskedHasDataKey(result.data?.maskedHasDataApiKey ?? null);
        if (result.data?.hasDataUsage) {
          setHasDataUsage(result.data.hasDataUsage);
        }
        setHasDataApiKeyInput("");
        setIsReplacingHasDataKey(false);
        toast.success("HasData key saved");
        router.refresh();
      } catch {
        toast.error("Failed to save key");
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
          toast.error(formatToastError(result.error));
          return;
        }
        setMaskedHasDataKey(null);
        setHasDataUsage(null);
        setHasDataApiKeyInput("");
        setIsReplacingHasDataKey(false);
        toast.success("HasData key removed");
        router.refresh();
      } catch {
        toast.error("Failed to clear key");
      } finally {
        setIsClearingHasDataKey(false);
      }
    });
  }

  return (
    <SettingsSectionCard
      className={SETTINGS_CARD_CLASSNAME}
      icon={
        <Worm
          className="size-8 -translate-y-0.5 scale-[1.15] origin-center text-primary shrink-0"
          aria-hidden="true"
        />
      }
      title="Bot Bypass & Web Scraping"
      subtitle="Configure failover and on-demand proxies for rich job spec hydration and ATS block bypass. Your keys are stored securely."
      toggle={
        <WaveToggle
          id="enable-web-scraping-proxies"
          checked={enableWebScrapingProxies}
          disabled={disabled}
          onCheckedChange={(checked) => {
            if (!accountId) return;
            setEnableWebScrapingProxies(checked);
            if (checked && !scrapingAntSubOpen && !hasDataSubOpen) {
              setScrapingAntSubOpen(Boolean(maskedScrapingAntKey));
              setHasDataSubOpen(Boolean(maskedHasDataKey));
            }
            startTransition(async () => {
              const result = await updateRule(
                accountId,
                "enableWebScrapingProxies",
                checked
              );
              if (!result.ok) {
                setEnableWebScrapingProxies(!checked);
                toast.error(formatToastError(result.error));
                return;
              }
              toast.success(
                checked ? "Proxies enabled" : "Proxies disabled"
              );
              router.refresh();
            });
          }}
        />
      }
      curvedDivider
    >
      <div className="space-y-3.5 animate-in fade-in-50 duration-200">
        {!accountId ? (
          <p className="text-sm text-muted-foreground">
            Connect an account to configure scraping API settings.
          </p>
        ) : (
          <>
            {/* ScrapingAnt Sub Dropdown Card (Level 2) */}
            <SettingsFeatureCard
              logo={
                <CompanyLogo
                  src="/icons/ScrapingAnt Lucide Icon 2.png"
                  name="ScrapingAnt"
                  size="lg"
                  imageClassName="object-contain p-1 scale-[1.10] opacity-70 dark:invert"
                />
              }
              title="ScrapingAnt Proxy"
              subtitle="Automatically loads full job descriptions when a job site blocks normal access. Free plan includes 10,000 monthly credits."
              statusBadge={
                !enableWebScrapingProxies ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground shrink-0">
                    Disabled
                  </span>
                ) : maskedScrapingAntKey ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 shrink-0">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground shrink-0">
                    Direct Fetch (No Proxy)
                  </span>
                )
              }
              isExpanded={enableWebScrapingProxies && scrapingAntSubOpen}
              onToggle={() => {
                if (!enableWebScrapingProxies) return;
                setScrapingAntSubOpen((prev) => !prev);
              }}
              disabled={!enableWebScrapingProxies}
              curvedDivider
            >
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
                        autoFocus={Boolean(
                          maskedScrapingAntKey && isReplacingScrapingAntKey
                        )}
                        value={scrapingAntApiKeyInput}
                        disabled={disabled || isSavingScrapingAntKey}
                        onChange={(e) =>
                          setScrapingAntApiKeyInput(e.target.value)
                        }
                        className="h-full min-w-0 flex-1 border-0 bg-transparent py-0 font-mono text-xs shadow-none placeholder:text-foreground/45 focus:outline-none focus:ring-0"
                        autoComplete="off"
                        spellCheck={false}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleSaveScrapingAntKey();
                          } else if (
                            e.key === "Escape" &&
                            isReplacingScrapingAntKey
                          ) {
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
                        className={cn(
                          SECONDARY_ACTION_BTN_CLASSNAME,
                          "shrink-0"
                        )}
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
                          <Loader size="sm" />
                          <span>Saving…</span>
                        </>
                      ) : (
                        "Save"
                      )}
                    </button>
                  </div>
                </div>
              )}

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
            </SettingsFeatureCard>

            {/* HasData Sub Dropdown Card (Level 2) */}
            <SettingsFeatureCard
              logo={
                <CompanyLogo
                  src="/icons/HasData Lucide Icon 3.png"
                  name="HasData"
                  size="lg"
                  imageClassName="object-contain p-1 scale-[1.05] opacity-70 dark:invert"
                />
              }
              title="HasData Web Scraping"
              subtitle="Pulls full job descriptions from Glassdoor and Indeed when you open a job or tailor a resume. Never uses credits in the background."
              statusBadge={
                !enableWebScrapingProxies ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground shrink-0">
                    Disabled
                  </span>
                ) : maskedHasDataKey ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 shrink-0">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground shrink-0">
                    On-Demand Direct Only
                  </span>
                )
              }
              isExpanded={enableWebScrapingProxies && hasDataSubOpen}
              onToggle={() => {
                if (!enableWebScrapingProxies) return;
                setHasDataSubOpen((prev) => !prev);
              }}
              disabled={!enableWebScrapingProxies}
              curvedDivider
            >
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
                        autoFocus={Boolean(
                          maskedHasDataKey && isReplacingHasDataKey
                        )}
                        value={hasDataApiKeyInput}
                        disabled={disabled || isSavingHasDataKey}
                        onChange={(e) =>
                          setHasDataApiKeyInput(e.target.value)
                        }
                        className="h-full min-w-0 flex-1 border-0 bg-transparent py-0 font-mono text-xs shadow-none placeholder:text-foreground/45 focus:outline-none focus:ring-0"
                        autoComplete="off"
                        spellCheck={false}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleSaveHasDataKey();
                          } else if (
                            e.key === "Escape" &&
                            isReplacingHasDataKey
                          ) {
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
                        className={cn(
                          SECONDARY_ACTION_BTN_CLASSNAME,
                          "shrink-0"
                        )}
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
                          <Loader size="sm" />
                          <span>Saving…</span>
                        </>
                      ) : (
                        "Save"
                      )}
                    </button>
                  </div>
                </div>
              )}

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
            </SettingsFeatureCard>
          </>
        )}
      </div>
    </SettingsSectionCard>
  );
}
