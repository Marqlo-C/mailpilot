"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  SCAN_DAY_OPTIONS,
  type ScanDays,
} from "@/lib/scan-types";
import {
  scanHistoricalEmails,
  type HistoricalScanSummary,
} from "@/lib/historical-scan";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const scanInputSchema = z.object({
  accountId: z.string().min(1),
  days: z.union([
    z.literal(5),
    z.literal(10),
    z.literal(15),
    z.literal(30),
  ]),
});

/**
 * Triggers a bounded historical inbox scan for subscriptions + job candidates.
 */
export async function triggerHistoricalScan(
  accountId: string,
  days: number
): Promise<ActionResult<HistoricalScanSummary>> {
  const parsed = scanInputSchema.safeParse({ accountId, days });
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid scan input. days must be one of ${SCAN_DAY_OPTIONS.join(", ")}`,
    };
  }

  try {
    const summary = await scanHistoricalEmails(
      parsed.data.accountId,
      parsed.data.days as ScanDays
    );

    revalidatePath("/");
    revalidatePath("/subscriptions");
    revalidatePath("/jobs");

    return { ok: true, data: summary };
  } catch (error) {
    console.error("triggerHistoricalScan failed", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Historical scan failed",
    };
  }
}
