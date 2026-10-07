"use server";

/**
 * Shared executor for Subscriptions lifecycle moves.
 * Card buttons, bulk flyout, and DnD drops resolve intent in
 * `lib/subscriptions/movement-rules.ts`, then land here.
 *
 * `unsubscribe` requires a cleanup choice (from the confirm dialog).
 */

import {
  batchCleanupSender,
  deleteUnsubscribedRecord,
  unsubscribeSender,
  type ActionResult,
} from "@/app/actions/subscriptions";
import {
  resolveSubscriptionCardAction,
  resolveSubscriptionMove,
  type SubscriptionCardAction,
  type SubscriptionDropZone,
  type SubscriptionMoveKind,
  type SubscriptionTab,
} from "@/lib/subscriptions/movement-rules";
import type { CleanupAction } from "@/lib/unsubscribe";

export type RunSubscriptionMoveResult = ActionResult<{
  count: number;
  kind: SubscriptionMoveKind;
  failed?: number;
}>;

export type SubscriptionMoveParams = {
  subscriptionIds?: string[];
  accountId?: string;
  senderEmail?: string;
  cleanup?: CleanupAction;
};

/** Card / bulk button → resolve allowlist → execute. */
export async function runSubscriptionCardAction(
  from: SubscriptionTab,
  action: SubscriptionCardAction,
  params: SubscriptionMoveParams
): Promise<RunSubscriptionMoveResult> {
  const resolved = resolveSubscriptionCardAction(from, action);
  if (resolved.kind === "forbidden") {
    return { ok: false, error: resolved.description };
  }
  return runSubscriptionMove(resolved.kind, params);
}

/**
 * DnD drop onto a tab zone → resolve matrix → execute.
 * Unsubscribe still needs `cleanup` from the confirm dialog.
 */
export async function runSubscriptionDrop(
  from: SubscriptionTab,
  to: SubscriptionDropZone,
  params: SubscriptionMoveParams
): Promise<RunSubscriptionMoveResult> {
  const resolved = resolveSubscriptionMove(from, to);
  if (resolved.kind === "forbidden" || resolved.kind === "reorder") {
    return {
      ok: false,
      error:
        resolved.kind === "reorder"
          ? "Reorder is handled client-side."
          : resolved.description,
    };
  }
  return runSubscriptionMove(resolved.kind, params);
}

export async function runSubscriptionMove(
  kind: SubscriptionMoveKind,
  params: SubscriptionMoveParams
): Promise<RunSubscriptionMoveResult> {
  switch (kind) {
    case "unsubscribe": {
      const ids = [...new Set((params.subscriptionIds ?? []).filter(Boolean))];
      if (ids.length === 0) {
        return { ok: true, data: { count: 0, kind } };
      }
      if (params.cleanup == null) {
        return {
          ok: false,
          error: "Cleanup choice is required to unsubscribe.",
        };
      }
      let okCount = 0;
      let failCount = 0;
      for (const id of ids) {
        const result = await unsubscribeSender(id, params.cleanup);
        if (result.ok) okCount += 1;
        else failCount += 1;
      }
      if (okCount === 0 && failCount > 0) {
        return {
          ok: false,
          error: `Failed to unsubscribe ${failCount} sender(s)`,
        };
      }
      return {
        ok: true,
        data: { count: okCount, kind, failed: failCount },
      };
    }
    case "cleanup": {
      if (!params.accountId || !params.senderEmail) {
        return {
          ok: false,
          error: "Account and sender are required for cleanup.",
        };
      }
      const result = await batchCleanupSender(
        params.accountId,
        params.senderEmail
      );
      if (!result.ok) return result;
      return {
        ok: true,
        data: { count: result.data?.cleaned ?? 0, kind },
      };
    }
    case "delete_record": {
      if (!params.accountId || !params.senderEmail) {
        return {
          ok: false,
          error: "Account and sender are required to delete a record.",
        };
      }
      const result = await deleteUnsubscribedRecord(
        params.accountId,
        params.senderEmail
      );
      if (!result.ok) return result;
      return { ok: true, data: { count: 1, kind } };
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
