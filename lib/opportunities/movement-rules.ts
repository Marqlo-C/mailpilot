/**
 * Job Radar lifecycle / kanban policy — shared home for card buttons, bulk
 * flyout, and DnD tab drops.
 *
 * Flow:
 * 1. Resolve intent → `JobMoveKind`
 *    - DnD: `resolveJobMove(fromTab, dropZone)`
 *    - Card/bulk: `resolveJobCardAction(fromTab, action)`
 * 2. Execute: `runJobMove` / `runJobCardAction` / `runJobDrop`
 *    in `lib/opportunities/run-job-move.ts`
 *
 * Gesture plumbing stays in `hooks/use-card-list-gestures.ts` + `lib/dnd/*`.
 * "Less like this" (ban + dismiss) stays outside this matrix.
 *
 * Tabs: leads | applied | action_required | history
 */

import type { CardListGestureRules } from "@/lib/dnd/types";
import type { JobsTabKey } from "@/lib/opportunities/sorting";

/** Map OpportunityCard / view variant → movement tab key. */
export function variantToJobsTabKey(
  variant: "leads" | "applied" | "action" | "history" | string
): JobsTabKey {
  if (variant === "action") return "action_required";
  if (
    variant === "leads" ||
    variant === "applied" ||
    variant === "history" ||
    variant === "action_required"
  ) {
    return variant;
  }
  return "leads";
}

/** Drop-zone ids — match `data-dnd-drop-zone` on Job Radar tab triggers. */
export type JobDropZone = JobsTabKey;

/** Lifecycle move kinds shared by DnD + card actions. */
export type JobMoveKind =
  | "reorder"
  | "mark_applied"
  | "unmark_applied"
  | "dismiss"
  | "archive"
  | "restore"
  | "forbidden";

/** Explicit card / bulk button intents (map to kinds + validate by tab). */
export type JobCardAction =
  | "mark_applied"
  | "unmark_applied"
  | "dismiss"
  | "archive"
  | "restore";

export type JobMoveResolution = {
  kind: JobMoveKind;
  /** Short label for UI / toasts. */
  label: string;
  /** Human explanation of the rule. */
  description: string;
};

/** Same-tab Custom-order rearrange (like Subscriptions Active). */
export const JOB_TAB_REORDER_ALLOWED: Record<JobsTabKey, boolean> = {
  leads: true,
  applied: true,
  action_required: true,
  /** History is archive-like — no custom reorder. */
  history: false,
};

/**
 * Cross-tab DnD defaults. Same-tab is `reorder` when allowed.
 * Card buttons may use a more specific kind (e.g. archive vs dismiss to History).
 */
export const JOB_CROSS_TAB_MOVES: Record<
  JobsTabKey,
  Partial<Record<JobDropZone, JobMoveKind>>
> = {
  leads: {
    applied: "mark_applied",
    history: "dismiss",
  },
  applied: {
    history: "archive",
    leads: "unmark_applied",
  },
  action_required: {
    history: "dismiss",
    applied: "mark_applied",
  },
  history: {
    leads: "restore",
    applied: "restore",
  },
};

/**
 * Which lifecycle buttons are valid on each tab.
 * DnD drop zones are derived from `JOB_CROSS_TAB_MOVES`; card UI uses this list
 * so overflow/bulk actions stay in lockstep with the matrix.
 */
export const JOB_CARD_ACTIONS_BY_TAB: Record<JobsTabKey, JobCardAction[]> = {
  leads: ["mark_applied", "dismiss", "archive"],
  applied: ["unmark_applied", "archive", "dismiss"],
  action_required: ["mark_applied", "dismiss"],
  /** restore = leave History; dismiss = start purge on user-archived rows */
  history: ["restore", "dismiss"],
};

const MOVE_COPY: Record<JobMoveKind, { label: string; description: string }> = {
  reorder: {
    label: "Reorder",
    description: "Same-tab Custom order (localStorage); page-edge flip OK.",
  },
  mark_applied: {
    label: "Mark applied",
    description: "Move into Applied (external/applied flow).",
  },
  unmark_applied: {
    label: "Unmark applied",
    description: "Return from Applied to the active leads queue.",
  },
  dismiss: {
    label: "Dismiss",
    description: "Send to History as dismissed (retention countdown).",
  },
  archive: {
    label: "Archive",
    description: "User-archive into History (keeps previousStatus).",
  },
  restore: {
    label: "Restore",
    description: "Pull out of History to previous active status.",
  },
  forbidden: {
    label: "Not allowed",
    description: "This move is blocked from the current tab.",
  },
};

function resolutionFor(kind: JobMoveKind, description?: string): JobMoveResolution {
  return {
    kind,
    label: MOVE_COPY[kind].label,
    description: description ?? MOVE_COPY[kind].description,
  };
}

/** Resolve a DnD drop (from tab → drop zone). */
export function resolveJobMove(
  from: JobsTabKey,
  to: JobDropZone
): JobMoveResolution {
  if (from === to) {
    const allowed = JOB_TAB_REORDER_ALLOWED[from];
    return resolutionFor(
      allowed ? "reorder" : "forbidden",
      allowed
        ? MOVE_COPY.reorder.description
        : "No custom reorder on this tab."
    );
  }

  const kind = JOB_CROSS_TAB_MOVES[from][to] ?? "forbidden";
  return resolutionFor(kind);
}

/**
 * Resolve a card/bulk button. Validates the action is allowed on `from` tab
 * so buttons and DnD share one allowlist.
 */
export function resolveJobCardAction(
  from: JobsTabKey,
  action: JobCardAction
): JobMoveResolution {
  if (!JOB_CARD_ACTIONS_BY_TAB[from].includes(action)) {
    return resolutionFor(
      "forbidden",
      `“${action}” is not available on the ${from} tab.`
    );
  }
  return resolutionFor(action);
}

/** Drop zones the current tab may drag onto (for `CardListGestureRules`). */
export function allowedJobDropZones(from: JobsTabKey): JobDropZone[] {
  const row = JOB_CROSS_TAB_MOVES[from];
  return (Object.keys(row) as JobDropZone[]).filter(
    (zone) => row[zone] != null && row[zone] !== "forbidden"
  );
}

/** Card/bulk actions available on a tab (for rendering buttons). */
export function jobCardActionsForTab(from: JobsTabKey): JobCardAction[] {
  return JOB_CARD_ACTIONS_BY_TAB[from];
}

/**
 * Gesture rules for the active Job Radar tab.
 * Reorder only when Custom sort is active (or no custom order saved yet —
 * same first-reorder promotion pattern as Subscriptions).
 */
export function getJobGestureRules(options: {
  activeTab: JobsTabKey;
  sortIsCustom: boolean;
  hasSavedCustomOrder: boolean;
}): CardListGestureRules {
  // Same as Subscriptions: allow reorder on the tab; executor/view promotes
  // to Custom sort on drop. Don't gate preview on the current sort label.
  void options.sortIsCustom;
  void options.hasSavedCustomOrder;
  const canReorder = JOB_TAB_REORDER_ALLOWED[options.activeTab];

  return {
    canReorder,
    allowedDropZones: allowedJobDropZones(options.activeTab),
  };
}

/** Readable summary for docs / debugging. */
export function formatJobMovementRulesSummary(): string {
  const lines: string[] = [
    "Job Radar movement rules (DnD + card/bulk share runJobMove)",
    "",
    "Same-tab reorder (Custom sort):",
  ];
  for (const tab of Object.keys(JOB_TAB_REORDER_ALLOWED) as JobsTabKey[]) {
    lines.push(
      `  - ${tab}: ${JOB_TAB_REORDER_ALLOWED[tab] ? "yes" : "no"}`
    );
  }
  lines.push("", "Cross-tab DnD defaults:");
  for (const from of Object.keys(JOB_CROSS_TAB_MOVES) as JobsTabKey[]) {
    const targets = allowedJobDropZones(from);
    if (targets.length === 0) {
      lines.push(`  - ${from}: (none)`);
      continue;
    }
    for (const to of targets) {
      const r = resolveJobMove(from, to);
      lines.push(`  - ${from} → ${to}: ${r.kind} — ${r.description}`);
    }
  }
  lines.push("", "Card / bulk actions by tab:");
  for (const from of Object.keys(JOB_CARD_ACTIONS_BY_TAB) as JobsTabKey[]) {
    lines.push(`  - ${from}: ${JOB_CARD_ACTIONS_BY_TAB[from].join(", ")}`);
  }
  return lines.join("\n");
}
