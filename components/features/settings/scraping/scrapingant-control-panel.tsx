"use client";

import { Calendar, Clock, CreditCard, Zap } from "lucide-react";
import { getScrapingAntUsageAction } from "@/app/actions/settings";
import type { ScrapingAntUsage } from "@/lib/validations/rules.schema";
import {
  calculateDaysRemaining,
  formatIsoDate,
  ProviderUsagePanel,
  type NormalizedProviderUsage,
} from "./provider-usage-panel";

export type ScrapingAntControlPanelProps = {
  accountId: string | null;
  initialUsage?: ScrapingAntUsage;
  maskedApiKey?: string | null;
  disabled?: boolean;
  onReplaceKey?: () => void;
  onDeleteKey?: () => void;
  isDeletingKey?: boolean;
};

/**
 * Normalizes ScrapingAnt usage telemetry into the canonical ProviderUsagePanel shape.
 */
function normalizeScrapingAntUsage(
  usage: NonNullable<ScrapingAntUsage>
): NormalizedProviderUsage {
  const totalCredits = usage.planTotalCredits;
  const remainedCredits = usage.remainedCredits;
  const daysRemaining = calculateDaysRemaining(usage.endDate);
  const isFreeTier = usage.planName.toLowerCase().includes("free");

  return {
    planName: usage.planName,
    totalCredits,
    remainedCredits,
    fetchedAt: usage.fetchedAt,
    remainingCreditsLabel: `${remainedCredits.toLocaleString()} credits remaining in current billing cycle`,
    estimatedUnitsLabel: `Enough for ~${remainedCredits.toLocaleString()} job listings`,
    tiles: [
      {
        label: "Subscription",
        icon: CreditCard,
        value: usage.planName,
        subtext: `${totalCredits.toLocaleString()} credits / cycle`,
      },
      {
        label: "Concurrency Limit",
        icon: Zap,
        value: usage.concurrencyLimit
          ? `${usage.concurrencyLimit} Parallel Thread`
          : "Unlimited",
        subtext: isFreeTier
          ? "1 concurrent request (Free limit)"
          : "Uncapped parallel threads",
      },
      {
        label: "Cycle Started",
        icon: Calendar,
        value: formatIsoDate(usage.startDate),
        subtext: "Billing cycle origin",
      },
      {
        label: "Cycle Renews",
        icon: Clock,
        value: formatIsoDate(usage.endDate),
        subtext:
          daysRemaining > 0
            ? `In ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`
            : "Renews today",
      },
    ],
  };
}

/**
 * ScrapingAnt provider usage control panel adapter delegating to ProviderUsagePanel.
 */
export function ScrapingAntControlPanel(props: ScrapingAntControlPanelProps) {
  return (
    <ProviderUsagePanel
      {...props}
      providerName="ScrapingAnt"
      dashboardUrl="https://scrapingant.com/dashboard"
      noteText="Uses 1 credit per job listing loaded. Unused credits reset each month."
      queryingMessage="Querying ScrapingAnt for current plan limits, remaining credit balance, and renewal dates…"
      fetchAction={getScrapingAntUsageAction}
      normalizeUsage={normalizeScrapingAntUsage}
    />
  );
}
