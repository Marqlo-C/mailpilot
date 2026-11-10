import type { Subscription } from "@prisma/client";
import { faviconUrlForDomain, getCleanDomain } from "@/lib/utils/domain";
import {
  effectiveSubscriptionClutterScore,
  subscriptionClutterScore,
  type ClutterScoreTier,
} from "@/lib/subscriptions/filters";

export type MetricColumnWidths = {
  clutter: string;
  emails: string;
  received: string;
};

/**
 * Clutter tier tints — same red / warm / teal roles, shaded to page tokens
 * (#c21f10 destructive, chart-2 warm, brand #1ab5af).
 */
export const CLUTTER_VALUE_CLASSES: Record<ClutterScoreTier, string> = {
  high: "bg-[#c21f10]/10 text-[#c21f10] dark:bg-[#fb6230]/18 dark:text-[#fb6230]",
  mid: "bg-[hsl(28_70%_48%/0.14)] text-[hsl(28_62%_36%)] dark:bg-[hsl(28_70%_48%/0.2)] dark:text-[hsl(28_75%_68%)]",
  low: "bg-[hsl(174_22%_92%)] text-[#147a76] dark:bg-[hsl(174_28%_22%/0.55)] dark:text-[#5eead4]",
};

/** Gray mute for metric pills when the parent row/card is selected. */
export const SELECT_MUTED_PILL_VALUE_CLASSNAME =
  "bg-muted/50 text-muted-foreground";

/** Same gap as Send Snapshot ↔ Unsubscribe (`gap-2.5`). */
export const METRICS_GAP_CLASS = "gap-2.5";

/** Desktop row height — was `h-16` (64px); +2px. Class literal for Tailwind. */
export const SUBSCRIPTION_ROW_HEIGHT_PX = 66;
export const SUBSCRIPTION_ROW_HEIGHT_CLASS = "h-[66px]";

/**
 * Mobile card shell — 1px border matches Job Radar / settings / selection
 * highlight so multiselect only recolors the edge (no size jump).
 */
export const SUBSCRIPTION_CARD_SHELL_CLASS =
  "rounded-xl border bg-card p-4 shadow-md";

/** Job Radar card hover — border lift + shadow (mobile cards). */
export const SUBSCRIPTION_CARD_SURFACE_CLASS =
  "rounded-xl border bg-card p-4 shadow-md border-border/80 transition-[border-color,box-shadow] duration-200 hover:border-border hover:shadow-lg";

/** Desktop table row hover — same family, background tint instead of shadow. */
export const SUBSCRIPTION_ROW_HOVER_CLASS =
  "transition-colors duration-200 hover:bg-muted/30";

export function senderLogoSrc(email: string): string | null {
  const domain = getCleanDomain(email);
  return domain ? faviconUrlForDomain(domain) : null;
}

export type ArchiveEntry = {
  key: string;
  senderEmail: string;
  senderName: string | null;
  emailCount: number | null;
  lastReceivedAt: Date | null;
  subscriptionId: string | null;
  source: "subscription" | "history";
};

export type LatestBriefingProp = {
  id: string;
  subject?: string | null;
  htmlPreview: string;
  generatedAt: string;
  senderEmails: string[];
  subscriptionIds: string[];
};

export type ResolvedBriefing = LatestBriefingProp & {
  subscriptionId: string;
  source: "db" | "local";
};

/** Width each badge type to the widest value on the current page for vertical alignment. */
export function computeMetricColumnWidths(
  items: { emailCount: number }[]
): MetricColumnWidths {
  let maxEmailChars = 1;
  for (const item of items) {
    maxEmailChars = Math.max(maxEmailChars, String(item.emailCount).length);
  }
  const clutterCh = 3.75;
  const emailsCh = Math.max(5.25, maxEmailChars + 2.75);
  const receivedCh = 6.25;
  return {
    clutter: `${clutterCh}ch`,
    emails: `${emailsCh}ch`,
    received: `${receivedCh}ch`,
  };
}

export function clutterForSub(sub: Subscription): number {
  return effectiveSubscriptionClutterScore(sub);
}

export function clutterForArchiveEntry(entry: ArchiveEntry): number {
  return subscriptionClutterScore({
    emailCount: entry.emailCount ?? 0,
    lastReceivedAt: entry.lastReceivedAt,
  });
}


