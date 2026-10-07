"use server";

/**
 * Shared executor for Job Radar lifecycle moves.
 * Used by card/overflow buttons, bulk flyout, and DnD tab drops —
 * all go through `resolveJobMove` / card-action helpers in
 * `lib/opportunities/movement-rules.ts`, then land here.
 */

import {
  archiveOpportunities,
  dismissOpportunities,
  markOpportunitiesExternalApplied,
  restoreOpportunities,
  unmarkApplied,
  type ActionResult,
} from "@/app/actions/opportunities";
import {
  resolveJobCardAction,
  resolveJobMove,
  type JobCardAction,
  type JobDropZone,
  type JobMoveKind,
} from "@/lib/opportunities/movement-rules";
import type { JobsTabKey } from "@/lib/opportunities/sorting";

export type RunJobMoveResult = ActionResult<{ count: number; kind: JobMoveKind }>;

/** Card / bulk button → resolve allowlist → execute. */
export async function runJobCardAction(
  from: JobsTabKey,
  action: JobCardAction,
  opportunityIds: string[]
): Promise<RunJobMoveResult> {
  const resolved = resolveJobCardAction(from, action);
  if (resolved.kind === "forbidden") {
    return { ok: false, error: resolved.description };
  }
  return runJobMove(resolved.kind, opportunityIds);
}

/** DnD drop onto a tab zone → resolve matrix → execute. */
export async function runJobDrop(
  from: JobsTabKey,
  to: JobDropZone,
  opportunityIds: string[]
): Promise<RunJobMoveResult> {
  const resolved = resolveJobMove(from, to);
  if (resolved.kind === "forbidden" || resolved.kind === "reorder") {
    return {
      ok: false,
      error:
        resolved.kind === "reorder"
          ? "Reorder is handled client-side."
          : resolved.description,
    };
  }
  return runJobMove(resolved.kind, opportunityIds);
}

/**
 * Execute a resolved move kind against one or more opportunity ids.
 * `reorder` is client-only (localStorage) — not handled here.
 */
export async function runJobMove(
  kind: JobMoveKind,
  opportunityIds: string[]
): Promise<RunJobMoveResult> {
  const ids = [...new Set(opportunityIds.filter(Boolean))];
  if (ids.length === 0) {
    return { ok: true, data: { count: 0, kind } };
  }

  switch (kind) {
    case "mark_applied": {
      const result = await markOpportunitiesExternalApplied(ids);
      if (!result.ok) return result;
      return {
        ok: true,
        data: { count: result.data?.count ?? ids.length, kind },
      };
    }
    case "dismiss": {
      const result = await dismissOpportunities(ids);
      if (!result.ok) return result;
      return {
        ok: true,
        data: { count: result.data?.count ?? ids.length, kind },
      };
    }
    case "archive": {
      const result = await archiveOpportunities(ids);
      if (!result.ok) return result;
      return {
        ok: true,
        data: { count: result.data?.count ?? ids.length, kind },
      };
    }
    case "restore": {
      const result = await restoreOpportunities(ids);
      if (!result.ok) return result;
      return {
        ok: true,
        data: { count: result.data?.count ?? ids.length, kind },
      };
    }
    case "unmark_applied": {
      let count = 0;
      for (const id of ids) {
        const result = await unmarkApplied(id);
        if (!result.ok) return result;
        count += 1;
      }
      return { ok: true, data: { count, kind } };
    }
    case "reorder":
      return {
        ok: false,
        error: "Reorder is client-only (Custom sort / localStorage).",
      };
    case "forbidden":
      return { ok: false, error: "That move is not allowed." };
    default: {
      const _exhaustive: never = kind;
      return { ok: false, error: `Unknown move: ${String(_exhaustive)}` };
    }
  }
}
