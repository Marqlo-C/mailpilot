"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Activity,
  Calendar,
  Clock,
  CreditCard,
  ExternalLink,
  Info,
  KeyRound,
  Loader2,
  Redo2,
  RefreshCw,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { getHasDataUsageAction } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "@/lib/format-distance";
import type { HasDataUsage } from "@/lib/validations/rules";
import { cn } from "@/lib/utils";
import { WavyMeter } from "@/components/ui/wavy-meter";

type HasDataControlPanelProps = {
  accountId: string | null;
  initialUsage?: HasDataUsage | null;
  maskedApiKey?: string | null;
  disabled?: boolean;
  onReplaceKey?: () => void;
  onDeleteKey?: () => void;
  isDeletingKey?: boolean;
};

function formatIsoDate(iso: string): string {
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

function calculateDaysRemaining(endDateIso: string): number {
  try {
    const end = new Date(endDateIso).getTime();
    const now = Date.now();
    const diffDays = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  } catch {
    return 0;
  }
}

export function HasDataControlPanel({
  accountId,
  initialUsage = null,
  maskedApiKey,
  disabled = false,
  onReplaceKey,
  onDeleteKey,
  isDeletingKey = false,
}: HasDataControlPanelProps) {
  const [usage, setUsage] = useState<HasDataUsage | null>(initialUsage);
  const [isRefreshing, startRefresh] = useTransition();
  const [hasAutoFetched, setHasAutoFetched] = useState(false);

  // Sync state if server passes updated initialUsage
  useEffect(() => {
    if (initialUsage) {
      setUsage(initialUsage);
    }
  }, [initialUsage]);

  // Auto-refresh on mount if usage is null or older than 4 hours
  useEffect(() => {
    if (!accountId || !maskedApiKey || hasAutoFetched) return;

    const fourHoursMs = 4 * 60 * 60 * 1000;
    const isStale =
      !usage ||
      Date.now() - new Date(usage.fetchedAt).getTime() > fourHoursMs;

    if (isStale) {
      setHasAutoFetched(true);
      startRefresh(async () => {
        const res = await getHasDataUsageAction(accountId, false);
        if (res.ok && res.data) {
          setUsage(res.data);
        }
      });
    }
  }, [accountId, maskedApiKey, usage, hasAutoFetched]);

  function handleManualRefresh() {
    if (!accountId) return;

    startRefresh(async () => {
      const res = await getHasDataUsageAction(accountId, true);
      if (!res.ok) {
        toast.error(res.error || "Failed to fetch usage from HasData");
        return;
      }
      if (res.data) {
        setUsage(res.data);
        toast.success("HasData usage refreshed");
      }
    });
  }

  if (!maskedApiKey) {
    return null;
  }

  // If usage hasn't been retrieved yet, show an initial loading / fetch card
  if (!usage) {
    return (
      <div className="rounded-xl border border-border/80 bg-background/60 bg-global-radial p-4 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Your Usage Stats:
            </p>
            {maskedApiKey && (
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
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-rose-500" />
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
            )}
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
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Querying HasData for current credit balance, active concurrency, and plan metrics…
        </p>
      </div>
    );
  }

  const totalCredits = usage.totalCredits;
  const availableCredits = usage.availableCredits;
  const usedCredits = Math.max(0, totalCredits - availableCredits);
  const usagePercentage =
    totalCredits > 0 ? Math.min(100, Math.round((usedCredits / totalCredits) * 100)) : 0;

  const isExhausted = availableCredits <= 0;
  const isLowBalance = !isExhausted && usagePercentage >= 90;
  const estimatedHydrations = Math.floor(availableCredits / 10);
  const daysRemaining = usage.endDate ? calculateDaysRemaining(usage.endDate) : null;

  return (
    <div className="rounded-xl border border-border/80 bg-background/50 bg-global-radial p-4 space-y-4 shadow-sm backdrop-blur-sm">
      {/* Top Header Row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Your Usage Stats:
          </p>
          {maskedApiKey ? (
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
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-rose-500" />
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
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              {usage.planName} Plan
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
          {usage.fetchedAt && (
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              Updated {formatDistanceToNow(new Date(usage.fetchedAt), { addSuffix: true })}
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || isRefreshing}
            onClick={handleManualRefresh}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
            title="Refresh HasData credit balance and concurrency metrics"
            aria-label="Refresh HasData credit balance and concurrency metrics"
          >
            {isRefreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
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
          aria-label="HasData API credit usage meter"
        />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-[11px] text-muted-foreground gap-1 pt-0.5">
          <span>
            {availableCredits.toLocaleString()} credits remaining in account
          </span>
          <span className="font-mono text-[10px] text-muted-foreground/80">
            ~{estimatedHydrations.toLocaleString()} Glassdoor & Indeed job specs runway
          </span>
        </div>
      </div>

      {/* 4-Tile Information Grid */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Plan Card */}
        <div className="rounded-lg border border-border/50 bg-card/60 p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <CreditCard className="h-3.5 w-3.5" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">
              Subscription
            </span>
          </div>
          <p className="text-sm font-semibold tracking-tight text-foreground">
            {usage.planName}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {totalCredits.toLocaleString()} credits allowance
          </p>
        </div>

        {/* Concurrency Limit */}
        <div className="rounded-lg border border-border/50 bg-card/60 p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Zap className="h-3.5 w-3.5" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">
              Concurrency Limit
            </span>
          </div>
          <p className="text-sm font-semibold tracking-tight text-foreground">
            {usage.availableConcurrency
              ? `${usage.availableConcurrency} Max Simultaneous`
              : "Standard Limit"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {usage.availableConcurrency === 1
              ? "1 concurrent request (Free tier)"
              : "Multi-thread parallel concurrency"}
          </p>
        </div>

        {/* Active In-Flight Requests */}
        <div className="rounded-lg border border-border/50 bg-card/60 p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Activity className="h-3.5 w-3.5" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">
              Active In-Flight
            </span>
          </div>
          <p className="text-sm font-semibold tracking-tight text-foreground">
            {usage.concurrentRequests} Requests
          </p>
          <p className="text-[11px] text-muted-foreground">
            Simultaneous requests active
          </p>
        </div>

        {/* Renewal Date or Available Balance */}
        {usage.endDate ? (
          <div className="rounded-lg border border-border/50 bg-card/60 p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span className="text-[10px] font-semibold uppercase tracking-wider">
                Cycle Renews
              </span>
            </div>
            <p className="text-sm font-semibold tracking-tight text-foreground">
              {formatIsoDate(usage.endDate)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {daysRemaining !== null && daysRemaining > 0
                ? `In ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`
                : "Renews today"}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border/50 bg-card/60 p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              <span className="text-[10px] font-semibold uppercase tracking-wider">
                Available Credits
              </span>
            </div>
            <p className="text-sm font-semibold tracking-tight text-foreground">
              {availableCredits.toLocaleString()}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {Math.max(0, 100 - usagePercentage)}% remaining allowance
            </p>
          </div>
        )}
      </div>

      {/* Helpful Operational Notes & External Link */}
      <div className="flex flex-col gap-2 rounded-lg border border-border/40 bg-muted/10 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between text-[11px] text-muted-foreground">
        <div className="flex items-start gap-1.5 min-w-0">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary/70" />
          <span>
            10 credits are consumed per successful Glassdoor or Indeed job hydration. Never consumed during background sync.
          </span>
        </div>
        <a
          href="https://app.hasdata.com/dashboard"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline shrink-0 font-medium"
        >
          HasData Dashboard
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
