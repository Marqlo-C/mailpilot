export type SubscriptionCategoryFilter =
  | "all"
  | "promotions"
  | "newsletters"
  | "alerts";

export type SubscriptionSortOption =
  | "clutter_desc"
  | "freq_desc"
  | "freq_asc"
  | "alpha"
  | "custom";

type ClutterInput = {
  emailCount: number;
  lastReceivedAt?: Date | string | null;
};

type CategoryInput = {
  senderName?: string | null;
  senderEmail: string;
};

/**
 * Derived clutter score (0–100) from tracked volume + recency.
 * Higher emailCount / fresher lastReceivedAt → higher noise.
 */
export function subscriptionClutterScore(sub: ClutterInput): number {
  const count = Math.max(0, sub.emailCount);
  const volume = Math.min(
    95,
    Math.round((Math.log10(count + 1) / Math.log10(101)) * 95)
  );

  let recency = 0;
  if (sub.lastReceivedAt) {
    const days =
      (Date.now() - new Date(sub.lastReceivedAt).getTime()) /
      (1000 * 60 * 60 * 24);
    if (days <= 2) recency = 5;
    else if (days <= 7) recency = 3;
    else if (days <= 30) recency = 1;
  }

  return Math.min(100, volume + recency);
}

/** Reverse of Job Radar match bands: high ≥80, mid ≥60, else low. */
export type ClutterScoreTier = "high" | "mid" | "low";

export function clutterScoreTier(score: number): ClutterScoreTier {
  if (score >= 80) return "high";
  if (score >= 60) return "mid";
  return "low";
}

/**
 * Lightweight category inference from sender identity (no static columns).
 */
export function inferSubscriptionCategory(
  sub: CategoryInput
): Exclude<SubscriptionCategoryFilter, "all"> {
  const hay = `${sub.senderName ?? ""} ${sub.senderEmail}`.toLowerCase();
  if (/\b(alert|notify|notification|security|otp|verify)\b/.test(hay)) {
    return "alerts";
  }
  if (/\b(promo|deal|offer|sale|discount|coupon)\b/.test(hay)) {
    return "promotions";
  }
  return "newsletters";
}

export function matchesSubscriptionSearch(
  sub: CategoryInput,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    sub.senderEmail.toLowerCase().includes(q) ||
    (sub.senderName?.toLowerCase().includes(q) ?? false)
  );
}

export function compareSubscriptionsBySort(
  a: ClutterInput & CategoryInput,
  b: ClutterInput & CategoryInput,
  sort: SubscriptionSortOption
): number {
  switch (sort) {
    case "custom":
      // Order is applied separately via applyCustomOrder; keep a stable fallback.
      return a.senderEmail.localeCompare(b.senderEmail);
    case "clutter_desc": {
      const diff =
        subscriptionClutterScore(b) - subscriptionClutterScore(a);
      return diff !== 0
        ? diff
        : a.senderEmail.localeCompare(b.senderEmail);
    }
    case "freq_desc": {
      const diff = b.emailCount - a.emailCount;
      return diff !== 0
        ? diff
        : a.senderEmail.localeCompare(b.senderEmail);
    }
    case "freq_asc": {
      const diff = a.emailCount - b.emailCount;
      return diff !== 0
        ? diff
        : a.senderEmail.localeCompare(b.senderEmail);
    }
    case "alpha":
    default:
      return (
        (a.senderName ?? a.senderEmail).localeCompare(
          b.senderName ?? b.senderEmail
        ) || a.senderEmail.localeCompare(b.senderEmail)
      );
  }
}
