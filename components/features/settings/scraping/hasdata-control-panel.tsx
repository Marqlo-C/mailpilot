"use client";

import { Activity, Calendar, Clock, CreditCard, Zap } from "lucide-react";
import { getHasDataUsageAction } from "@/app/actions/settings";
import type { HasDataUsage } from "@/lib/validations/rules.schema";
import {
  calculateDaysRemaining,
  formatIsoDate,
  ProviderUsagePanel,
  type NormalizedProviderUsage,
} from "./provider-usage-panel";

export type HasDataControlPanelProps = {
  accountId: string | null;
  initialUsage?: HasDataUsage;
  maskedApiKey?: string | null;
  disabled?: boolean;
  onReplaceKey?: () => void;
  onDeleteKey?: () => void;
  isDeletingKey?: boolean;
};

/**
 * Normalizes HasData usage telemetry into the canonical ProviderUsagePanel shape.
 */
function normalizeHasDataUsage(
  usage: NonNullable<HasDataUsage>
): NormalizedProviderUsage {
  const totalCredits = usage.totalCredits;
  const availableCredits = usage.availableCredits;
  const usedCredits = Math.max(0, totalCredits - availableCredits);
  const usagePercentage =
    totalCredits > 0 ? Math.min(100, Math.round((usedCredits / totalCredits) * 100)) : 0;
  const estimatedHydrations = Math.floor(availableCredits / 10);
  const daysRemaining = usage.endDate ? calculateDaysRemaining(usage.endDate) : null;

  return {
    planName: usage.planName,
    totalCredits,
    remainedCredits: availableCredits,
    fetchedAt: usage.fetchedAt,
    remainingCreditsLabel: `${availableCredits.toLocaleString()} credits remaining in account`,
    estimatedUnitsLabel: `Enough for ~${estimatedHydrations.toLocaleString()} Glassdoor & Indeed jobs`,
    tiles: [
      {
        label: "Subscription",
        icon: CreditCard,
        value: usage.planName,
        subtext: `${totalCredits.toLocaleString()} credits allowance`,
      },
      {
        label: "Concurrency Limit",
        icon: Zap,
        value: usage.availableConcurrency
          ? `${usage.availableConcurrency} Max Simultaneous`
          : "Standard Limit",
        subtext:
          usage.availableConcurrency === 1
            ? "1 concurrent request (Free tier)"
            : "Multi-thread parallel concurrency",
      },
      {
        label: "Active In-Flight",
        icon: Activity,
        value: `${usage.concurrentRequests} Requests`,
        subtext: "Simultaneous requests active",
      },
      usage.endDate
        ? {
            label: "Cycle Renews",
            icon: Clock,
            value: formatIsoDate(usage.endDate),
            subtext:
              daysRemaining !== null && daysRemaining > 0
                ? `In ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`
                : "Renews today",
          }
        : {
            label: "Available Credits",
            icon: Calendar,
            value: availableCredits.toLocaleString(),
            subtext: `${Math.max(0, 100 - usagePercentage)}% remaining allowance`,
          },
    ],
  };
}

/**
 * HasData provider usage control panel adapter delegating to ProviderUsagePanel.
 */
export function HasDataControlPanel(props: HasDataControlPanelProps) {
  return (
    <ProviderUsagePanel
      {...props}
      providerName="HasData"
      dashboardUrl="https://app.hasdata.com/dashboard"
      noteText="Uses 10 credits per Glassdoor or Indeed job loaded. Credits are never used in the background."
      queryingMessage="Querying HasData for current credit balance, active concurrency, and plan metrics…"
      fetchAction={getHasDataUsageAction}
      normalizeUsage={normalizeHasDataUsage}
    />
  );
}
