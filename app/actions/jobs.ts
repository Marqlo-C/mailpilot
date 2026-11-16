"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/core/auth";
import { verifyAccountOwnership } from "@/lib/services/account-lifecycle.service";
import { emptyRejectionApplications } from "@/lib/services/opportunity-lifecycle.service";
import {
  accountIdParamSchema,
  actionError,
  actionSuccess,
  type ServerActionResult,
} from "@/lib/validations/action.schema";

export type ActionResult<T = void> = ServerActionResult<T>;

export type { ServerActionResult };

/**
 * Batch-trashes all Gmail messages tagged with the account's rejection label,
 * and marks matching JobApplication rows as trashed.
 */
export async function emptyRejections(
  accountId: string
): Promise<ServerActionResult<{ trashed: number }>> {
  const session = await auth();
  if (!session) return actionError("Unauthorized");

  const parsed = accountIdParamSchema.safeParse(accountId);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid account ID");
  }

  const verification = await verifyAccountOwnership(session.accountId, parsed.data);
  if (!verification.ok) {
    return actionError(verification.error ?? "Account not found for this user");
  }

  const result = await emptyRejectionApplications(parsed.data);
  if (result.ok) {
    revalidatePath("/jobs");
    revalidatePath("/");
  }
  return result.ok
    ? actionSuccess(result.data ?? { trashed: 0 })
    : actionError(result.error ?? "Failed to empty rejections");
}
