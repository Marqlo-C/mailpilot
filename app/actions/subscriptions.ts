"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getGmailClientForAccount } from "@/lib/google";
import { prisma } from "@/lib/prisma";
import {
  executeUnsubscribe,
  type CleanupAction,
} from "@/lib/unsubscribe";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const cleanupActionSchema = z.enum(["NONE", "TRASH", "ARCHIVE"]);

/**
 * Runs the unsubscribe chain for a stored subscription and optional cleanup.
 */
export async function unsubscribeSender(
  subscriptionId: string,
  cleanupAction: CleanupAction
): Promise<ActionResult<{ method: string; cleaned?: number }>> {
  const parsedCleanup = cleanupActionSchema.safeParse(cleanupAction);
  if (!parsedCleanup.success) {
    return { ok: false, error: "Invalid cleanup action" };
  }

  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { account: true },
  });

  if (!subscription) {
    return { ok: false, error: "Subscription not found" };
  }

  if (!subscription.account.isActive) {
    return { ok: false, error: "Account is inactive" };
  }

  try {
    const gmail = await getGmailClientForAccount(subscription.account);
    const result = await executeUnsubscribe(
      gmail,
      subscription,
      parsedCleanup.data
    );

    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: result.ok ? "UNSUBSCRIBED" : "FAILED",
      },
    });

    revalidatePath("/subscriptions");
    revalidatePath("/");

    if (!result.ok) {
      return {
        ok: false,
        error: result.detail ?? "Unsubscribe request failed",
      };
    }

    return {
      ok: true,
      data: { method: result.method },
    };
  } catch (error) {
    console.error("unsubscribeSender failed", error);

    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: "FAILED" },
    });

    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unsubscribe failed",
    };
  }
}
