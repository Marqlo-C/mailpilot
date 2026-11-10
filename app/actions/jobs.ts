"use server";

import { revalidatePath } from "next/cache";
import { emptyRejectionApplications } from "@/lib/services/opportunity-lifecycle.service";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/**
 * Batch-trashes all Gmail messages tagged with the account's rejection label,
 * and marks matching JobApplication rows as trashed.
 */
export async function emptyRejections(
  accountId: string
): Promise<ActionResult<{ trashed: number }>> {
  const result = await emptyRejectionApplications(accountId);
  if (result.ok) {
    revalidatePath("/jobs");
    revalidatePath("/");
  }
  return result;
}
