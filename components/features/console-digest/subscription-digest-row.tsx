"use client";

import type { Subscription } from "@prisma/client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DigestRowItem } from "./digest-row-item";
import { SCORE_PERCENT_CLASSNAME } from "@/components/ui/styles/score-percent";
import { faviconUrlForDomain, getCleanDomain } from "@/lib/utils/domain";
import {
  clutterScoreTier,
  type ClutterScoreTier,
} from "@/lib/subscriptions/filters";
import { cn } from "@/lib/utils";

/** Tier tints for clutter score badges. */
export const CLUTTER_VALUE_CLASSES: Record<ClutterScoreTier, string> = {
  high: "bg-[#c21f10]/10 text-[#c21f10] border border-[#c21f10]/20 dark:bg-[#fb6230]/18 dark:text-[#fb6230] dark:border-[#fb6230]/30",
  mid: "bg-[hsl(28_70%_48%/0.14)] text-[hsl(28_62%_36%)] border border-amber-500/20 dark:bg-[hsl(28_70%_48%/0.2)] dark:text-[hsl(28_75%_68%)]",
  low: "bg-[hsl(174_22%_92%)] text-[#147a76] border border-teal-500/20 dark:bg-[hsl(174_28%_22%/0.55)] dark:text-[#5eead4]",
};

const CLUTTER_METER_BAR_CLASSES: Record<ClutterScoreTier, string> = {
  high: "bg-rose-500",
  mid: "bg-amber-500",
  low: "bg-teal-500",
};

const CLUTTER_TIER_LABELS: Record<ClutterScoreTier, string> = {
  high: "High Noise",
  mid: "Moderate",
  low: "Low Noise",
};

export function SubscriptionDigestRow({
  subscription,
  clutter,
}: {
  subscription: Subscription;
  clutter: number;
}) {
  const domain = getCleanDomain(subscription.senderEmail);
  const tier = clutterScoreTier(clutter);
  const meterFill = Math.min(100, Math.max(6, clutter));

  return (
    <DigestRowItem
      href="/subscriptions"
      logoSrc={domain ? faviconUrlForDomain(domain) : null}
      logoName={subscription.senderName ?? subscription.senderEmail}
      title={subscription.senderName ?? "—"}
      subtitle={subscription.senderEmail}
      meter={
        <div className="flex items-center gap-2">
          {/* Visual Clutter Meter */}
          <div
            className="h-1.5 w-16 overflow-hidden rounded-full bg-muted/80 ring-1 ring-border/40"
            title={`Clutter index: ${clutter}% (${CLUTTER_TIER_LABELS[tier]})`}
          >
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                CLUTTER_METER_BAR_CLASSES[tier]
              )}
              style={{ width: `${meterFill}%` }}
            />
          </div>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {CLUTTER_TIER_LABELS[tier]}
          </span>
        </div>
      }
      metricBadge={
        <span
          title={`Clutter score: ${clutter}%`}
          className={cn(
            "inline-flex h-[28px] shrink-0 items-center justify-center rounded-md px-2 shadow-2xs",
            SCORE_PERCENT_CLASSNAME,
            CLUTTER_VALUE_CLASSES[tier]
          )}
        >
          {clutter}%
        </span>
      }
      action={
        <Link
          href="/subscriptions"
          className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-border bg-background/80 px-2.5 text-xs font-medium text-foreground shadow-2xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:scale-95"
          onClick={(e) => {
            e.stopPropagation();
          }}
          title={`Manage ${subscription.senderName ?? subscription.senderEmail} subscription`}
        >
          <span>Manage</span>
          <ArrowRight className="size-3" />
        </Link>
      }
    />
  );
}
