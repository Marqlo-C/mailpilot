"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ExternalLink, Info, KeyRound, Redo2, RefreshCw, Trash2, type LucideIcon } from "lucide-react";
import { Loader } from "@/components/ui/loader";
import { toast } from "sonner";
import { formatToastError } from "@/lib/utils/ui/toast-format";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "@/lib/utils/format-distance";
import { cn } from "@/lib/utils";
import { WavyMeter } from "@/components/ui/tactile/wavy-meter";
import type { ServerActionResult } from "@/lib/validations/action.schema";

/**
 * Metric card data item rendered in the provider's 4-tile grid.
 */
export interface ProviderUsageTile {
  label: string;
  icon: LucideIcon;
  value: string;
  subtext: string;
}

/**
 * Canonical normalized representation of provider usage telemetry.
 */
export interface NormalizedProviderUsage {
  planName: string;
  totalCredits: number;
  remainedCredits: number;
  fetchedAt: string;
  remainingCreditsLabel?: string;
  estimatedUnitsLabel?: string;
  tiles: ProviderUsageTile[];
}

/**
 * Props for the unified ProviderUsagePanel composite.
 */
export interface ProviderUsagePanelProps<T extends { fetchedAt: string }> {
  providerName: string;
  accountId: string | null;
  initialUsage?: T | null;
  maskedApiKey?: string | null;
  disabled?: boolean;
  onReplaceKey?: () => void;
  onDeleteKey?: () => void;
  isDeletingKey?: boolean;
  dashboardUrl: string;
  dashboardLabel?: string;
  noteText: string;
  queryingMessage?: string;
  fetchAction: (
    accountId: string,
    force: boolean
  ) => Promise<ServerActionResult<T | null>>;
  normalizeUsage: (usage: T) => NormalizedProviderUsage;
}

/**
 * Formats an ISO date string into a user-friendly display date (e.g. "Nov 17, 2026").
 */
export function formatIsoDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/**
 * Calculates remaining calendar days between now and the provided ISO end date.
 */
export function calculateDaysRemaining(endDateIso: string): number {
  try {
    const end = new Date(endDateIso).getTime();
    const now = Date.now();
    const diffDays = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  } catch {
    return 0;
  }
}

/**
 * Subcomponent rendering the masked API key pill with delete and replace action buttons.
 */
function KeyActions({
  maskedApiKey,
  disabled,
  isDeletingKey,
  onDeleteKey,
  onReplaceKey,
}: {
  maskedApiKey: string;
  disabled?: boolean;
  isDeletingKey?: boolean;
  onDeleteKey?: () => void;
  onReplaceKey?: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 font-mono text-[11px] font-medium text-primary">
        <KeyRound className="h-3 w-3 shrink-0" />
        {maskedApiKey}
      </span>
      <div className="flex items-center gap-0.5">
        {onDeleteKey && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || isDeletingKey}
            onClick={onDeleteKey}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 shrink-0"
            title="Delete active key"
            aria-label="Delete active key"
          >
            {isDeletingKey ? (
              <Loader size="sm" className="text-rose-500" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </Button>
        )}
        {onReplaceKey && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={onReplaceKey}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
            title="Replace active key"
            aria-label="Replace active key"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Reusable composite control panel for scraping providers (ScrapingAnt, HasData, etc.).
 * Unifies API key management, usage caching, meter visualization, and telemetry grids.
 */
export function ProviderUsagePanel<T extends { fetchedAt: string }>({
  providerName,
  accountId,
  initialUsage = null,
  maskedApiKey,
  disabled = false,
  onReplaceKey,
  onDeleteKey,
  isDeletingKey = false,
  dashboardUrl,
  dashboardLabel,
  noteText,
  queryingMessage,
  fetchAction,
  normalizeUsage,
}: ProviderUsagePanelProps<T>) {
  const [usage, setUsage] = useState<T | null>(initialUsage);
  const [prevInitialUsage, setPrevInitialUsage] = useState<T | null>(
    initialUsage
  );
  const [isRefreshing, startRefresh] = useTransition();
  const hasAutoFetchedRef = useRef(false);

  // Sync state if server passes updated initialUsage
  if (prevInitialUsage !== initialUsage) {
    setPrevInitialUsage(initialUsage);
    if (initialUsage) {
      setUsage(initialUsage);
    }
  }

  // Auto-refresh on mount if usage is null or older than 4 hours
  useEffect(() => {
    if (!accountId || !maskedApiKey || hasAutoFetchedRef.current) return;

    const fourHoursMs = 4 * 60 * 60 * 1000;
    const isStale =
      !usage ||
      Date.now() - new Date(usage.fetchedAt).getTime() > fourHoursMs;

    if (isStale) {
      hasAutoFetchedRef.current = true;
      startRefresh(async () => {
        const res = await fetchAction(accountId, false);
        if (res.ok && res.data) {
          setUsage(res.data);
        }
      });
    }
  }, [accountId, maskedApiKey, usage, fetchAction]);

  function handleManualRefresh() {
    if (!accountId) return;

    startRefresh(async () => {
      const res = await fetchAction(accountId, true);
      if (!res.ok) {
        toast.error(formatToastError(res.error, `${providerName} fetch failed`));
        return;
      }
      if (res.data) {
        setUsage(res.data);
        toast.success("Usage refreshed");
      }
    });
  }

  if (!maskedApiKey) {
    return null;
  }

  // If usage hasn't been retrieved yet, show a clean loading or prompt card
  if (!usage) {
    return (
      <div className="rounded-xl border border-border/80 bg-background/60 bg-global-radial p-4 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Your Usage Stats:
            </p>
            <KeyActions
              maskedApiKey={maskedApiKey}
              disabled={disabled}
              isDeletingKey={isDeletingKey}
              onDeleteKey={onDeleteKey}
              onReplaceKey={onReplaceKey}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || isRefreshing}
            onClick={handleManualRefresh}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
            title="Fetch plan and credit balance"
            aria-label="Fetch plan and credit balance"
          >
            {isRefreshing ? (
              <Loader size="sm" className="text-primary" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {queryingMessage ??
            `Querying ${providerName} for current plan limits, remaining credit balance, and renewal dates…`}
        </p>
      </div>
    );
  }

  const normalized = normalizeUsage(usage);
  const totalCredits = normalized.totalCredits;
  const remainedCredits = normalized.remainedCredits;
  const usedCredits = Math.max(0, totalCredits - remainedCredits);
  const usagePercentage =
    totalCredits > 0 ? Math.min(100, Math.round((usedCredits / totalCredits) * 100)) : 0;

  const isExhausted = remainedCredits <= 0;
  const isLowBalance = !isExhausted && usagePercentage >= 90;

  return (
    <div className="rounded-xl border border-border/80 bg-background/50 bg-global-radial p-4 space-y-4 shadow-sm backdrop-blur-sm">
      {/* Top Header Row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Your Usage Stats:
          </p>
          {maskedApiKey ? (
            <KeyActions
              maskedApiKey={maskedApiKey}
              disabled={disabled}
              isDeletingKey={isDeletingKey}
              onDeleteKey={onDeleteKey}
              onReplaceKey={onReplaceKey}
            />
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              {normalized.planName} Plan
            </span>
          )}
          {isExhausted ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-600 dark:text-rose-400">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
              Credits Depleted
            </span>
          ) : isLowBalance ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Low Balance
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {normalized.fetchedAt && (
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              Updated {formatDistanceToNow(new Date(normalized.fetchedAt), { addSuffix: true })}
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || isRefreshing}
            onClick={handleManualRefresh}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
            title={`Refresh ${providerName} plan and credit balance`}
            aria-label={`Refresh ${providerName} plan and credit balance`}
          >
            {isRefreshing ? (
              <Loader size="sm" className="text-primary" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Credit Usage Bar Section */}
      <div className="space-y-2 rounded-lg border border-border/80 bg-muted/20 p-3.5">
        <div className="flex items-center justify-between text-xs font-medium">
          <span className="text-foreground">
            <span className="font-semibold text-sm">
              {usedCredits.toLocaleString()}
            </span>{" "}
            <span className="text-muted-foreground font-normal">
              / {totalCredits.toLocaleString()} credits used
            </span>
          </span>
          <span
            className={cn(
              "font-mono text-xs font-semibold",
              isExhausted
                ? "text-rose-500"
                : isLowBalance
                  ? "text-amber-500"
                  : "text-foreground"
            )}
          >
            {usagePercentage}%
          </span>
        </div>

        {/* Wavy liquid usage meter */}
        <WavyMeter
          value={usagePercentage}
          accountId={accountId}
          tone={isExhausted ? "destructive" : isLowBalance ? "warning" : "default"}
          aria-label={`${providerName} API credit usage meter`}
        />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-[11px] text-muted-foreground gap-1 pt-0.5">
          <span>
            {normalized.remainingCreditsLabel ??
              `${remainedCredits.toLocaleString()} credits remaining in current billing cycle`}
          </span>
          {normalized.estimatedUnitsLabel && (
            <span className="font-mono text-[10px] text-muted-foreground/80">
              {normalized.estimatedUnitsLabel}
            </span>
          )}
        </div>
      </div>

      {/* 4-Tile Information Grid */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {normalized.tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <div
              key={tile.label}
              className="rounded-lg border border-border/50 bg-card/60 p-3 space-y-1"
            >
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
                <span className="text-[10px] font-semibold uppercase tracking-wider">
                  {tile.label}
                </span>
              </div>
              <p className="text-sm font-semibold tracking-tight text-foreground">
                {tile.value}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {tile.subtext}
              </p>
            </div>
          );
        })}
      </div>

      {/* Helpful Operational Notes & External Link */}
      <div className="flex flex-col gap-2 rounded-lg border border-border/40 bg-muted/10 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between text-[11px] text-muted-foreground">
        <div className="flex items-start gap-1.5 min-w-0">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary/70" />
          <span>{noteText}</span>
        </div>
        <a
          href={dashboardUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline shrink-0 font-medium"
        >
          {dashboardLabel ?? `${providerName} Dashboard`}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
