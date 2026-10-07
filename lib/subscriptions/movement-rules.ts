/**
 * Subscriptions lifecycle / tab policy — shared home for card buttons, bulk
 * flyout, and DnD tab drops.
 *
 * Flow:
 * 1. Resolve intent → `SubscriptionMoveKind`
 *    - DnD: `resolveSubscriptionMove(fromTab, dropZone)`
 *    - Card/bulk: `resolveSubscriptionCardAction(fromTab, action)`
 * 2. UI confirm when `requiresConfirm` (unsubscribe), then execute via
 *    `lib/subscriptions/run-subscription-move.ts`
 *
 * Gesture plumbing stays in `hooks/use-card-list-gestures.ts` + `lib/dnd/*`.
 * Briefing / preview actions stay outside this matrix.
 *
 * Tabs: active | archive (Unsubscribed)
 */

import type { CardListGestureRules } from "@/lib/dnd/types";

export type SubscriptionTab = "active" | "archive";

/** Drop-zone ids — match `data-dnd-drop-zone` on subscription tab triggers. */
export type SubscriptionDropZone = SubscriptionTab;

export type SubscriptionMoveKind =
  | "reorder"
  | "unsubscribe"
  | "cleanup"
  | "delete_record"
  | "forbidden";

export type SubscriptionCardAction =
  | "unsubscribe"
  | "cleanup"
  | "delete_record";

export type SubscriptionMoveResolution = {
  kind: SubscriptionMoveKind;
  label: string;
  description: string;
  /** Unsubscribe opens the confirm dialog before `runSubscriptionMove`. */
  requiresConfirm: boolean;
};

/** Same-tab Custom-order rearrange — Active only. */
export const SUBSCRIPTION_TAB_REORDER_ALLOWED: Record<SubscriptionTab, boolean> =
  {
    active: true,
    archive: false,
  };

/**
 * Cross-tab DnD defaults.
 * Only Active → Unsubscribed (archive) is allowed; opens unsubscribe confirm.
 */
export const SUBSCRIPTION_CROSS_TAB_MOVES: Record<
  SubscriptionTab,
  Partial<Record<SubscriptionDropZone, SubscriptionMoveKind>>
> = {
  active: {
    archive: "unsubscribe",
  },
  archive: {
    // No drag back to Active — re-subscribe is not a product action.
  },
};

/** Card / bulk actions valid on each tab. */
export const SUBSCRIPTION_CARD_ACTIONS_BY_TAB: Record<
  SubscriptionTab,
  SubscriptionCardAction[]
> = {
  active: ["unsubscribe"],
  archive: ["cleanup", "delete_record"],
};

const MOVE_COPY: Record<
  SubscriptionMoveKind,
  { label: string; description: string; requiresConfirm: boolean }
> = {
  reorder: {
    label: "Reorder",
    description: "Same-tab Custom order (localStorage); page-edge flip OK.",
    requiresConfirm: false,
  },
  unsubscribe: {
    label: "Unsubscribe",
    description:
      "Move Active → Unsubscribed (confirm cleanup choice, then run unsubscribe).",
    requiresConfirm: true,
  },
  cleanup: {
    label: "Cleanup",
    description: "Batch-clean past mail from an unsubscribed sender.",
    requiresConfirm: false,
  },
  delete_record: {
    label: "Delete record",
    description: "Remove the unsubscribed sender record from MailPilot.",
    requiresConfirm: false,
  },
  forbidden: {
    label: "Not allowed",
    description: "This move is blocked from the current tab.",
    requiresConfirm: false,
  },
};

function resolutionFor(
  kind: SubscriptionMoveKind,
  description?: string
): SubscriptionMoveResolution {
  return {
    kind,
    label: MOVE_COPY[kind].label,
    description: description ?? MOVE_COPY[kind].description,
    requiresConfirm: MOVE_COPY[kind].requiresConfirm,
  };
}

/** Resolve a DnD drop (from tab → drop zone). */
export function resolveSubscriptionMove(
  from: SubscriptionTab,
  to: SubscriptionDropZone
): SubscriptionMoveResolution {
  if (from === to) {
    const allowed = SUBSCRIPTION_TAB_REORDER_ALLOWED[from];
    return resolutionFor(
      allowed ? "reorder" : "forbidden",
      allowed
        ? MOVE_COPY.reorder.description
        : "No custom reorder on this tab."
    );
  }

  const kind = SUBSCRIPTION_CROSS_TAB_MOVES[from][to] ?? "forbidden";
  return resolutionFor(kind);
}

/** Resolve a card/bulk button against the tab allowlist. */
export function resolveSubscriptionCardAction(
  from: SubscriptionTab,
  action: SubscriptionCardAction
): SubscriptionMoveResolution {
  if (!SUBSCRIPTION_CARD_ACTIONS_BY_TAB[from].includes(action)) {
    return resolutionFor(
      "forbidden",
      `“${action}” is not available on the ${from} tab.`
    );
  }
  return resolutionFor(action);
}

export function allowedSubscriptionDropZones(
  from: SubscriptionTab
): SubscriptionDropZone[] {
  const row = SUBSCRIPTION_CROSS_TAB_MOVES[from];
  return (Object.keys(row) as SubscriptionDropZone[]).filter(
    (zone) => row[zone] != null && row[zone] !== "forbidden"
  );
}

export function subscriptionCardActionsForTab(
  from: SubscriptionTab
): SubscriptionCardAction[] {
  return SUBSCRIPTION_CARD_ACTIONS_BY_TAB[from];
}

export function getSubscriptionGestureRules(options: {
  activeTab: SubscriptionTab;
  sortIsCustom: boolean;
  hasSavedCustomOrder: boolean;
}): CardListGestureRules {
  // Reorder whenever the tab allows it. First drop promotes Sort → Custom
  // (see subscriptions-view handleReorder). Gating on sortIsCustom hid the
  // live preview while drag still armed for tab drops — looked broken.
  void options.sortIsCustom;
  void options.hasSavedCustomOrder;
  const canReorder = SUBSCRIPTION_TAB_REORDER_ALLOWED[options.activeTab];

  return {
    canReorder,
    allowedDropZones: allowedSubscriptionDropZones(options.activeTab),
  };
}

export function formatSubscriptionMovementRulesSummary(): string {
  const lines: string[] = [
    "Subscriptions movement rules (DnD + card/bulk share runSubscriptionMove)",
    "",
    "Same-tab reorder (Custom sort):",
  ];
  for (const tab of Object.keys(
    SUBSCRIPTION_TAB_REORDER_ALLOWED
  ) as SubscriptionTab[]) {
    lines.push(
      `  - ${tab}: ${SUBSCRIPTION_TAB_REORDER_ALLOWED[tab] ? "yes" : "no"}`
    );
  }
  lines.push("", "Cross-tab DnD defaults:");
  for (const from of Object.keys(
    SUBSCRIPTION_CROSS_TAB_MOVES
  ) as SubscriptionTab[]) {
    const targets = allowedSubscriptionDropZones(from);
    if (targets.length === 0) {
      lines.push(`  - ${from}: (none)`);
      continue;
    }
    for (const to of targets) {
      const r = resolveSubscriptionMove(from, to);
      lines.push(
        `  - ${from} → ${to}: ${r.kind}${r.requiresConfirm ? " (confirm)" : ""} — ${r.description}`
      );
    }
  }
  lines.push("", "Card / bulk actions by tab:");
  for (const from of Object.keys(
    SUBSCRIPTION_CARD_ACTIONS_BY_TAB
  ) as SubscriptionTab[]) {
    lines.push(
      `  - ${from}: ${SUBSCRIPTION_CARD_ACTIONS_BY_TAB[from].join(", ")}`
    );
  }
  return lines.join("\n");
}
