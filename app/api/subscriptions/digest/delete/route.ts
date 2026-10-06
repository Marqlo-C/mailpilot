import { NextResponse } from "next/server";
import { z } from "zod";

import { getActiveAccount } from "@/lib/data";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  subscriptionIds: z.array(z.string().min(1)).min(1).max(100),
});

/**
 * POST /api/subscriptions/digest/delete
 * Removes selected subscription ids from the single account-level DB briefing.
 * Deletes the row when no subscription ids remain.
 */
export async function POST(req: Request) {
  try {
    const active = await getActiveAccount();
    if (!active) {
      return NextResponse.json(
        { success: false, error: "Sign in with a linked Gmail account" },
        { status: 401 }
      );
    }

    const json: unknown = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid subscription ids" },
        { status: 400 }
      );
    }

    const remove = new Set(parsed.data.subscriptionIds);
    const existing = await prisma.subscriptionBriefing.findUnique({
      where: { accountId: active.id },
    });

    if (!existing) {
      return NextResponse.json({
        success: true,
        deletedRow: false,
        remainingSubscriptionIds: [] as string[],
      });
    }

    const remainingIds = existing.subscriptionIds.filter((id) => !remove.has(id));
    const remainingEmails = existing.senderEmails.filter((_, i) => {
      const sid = existing.subscriptionIds[i];
      // Prefer id-based filter; fall back to keeping emails whose ids remain.
      return sid ? remainingIds.includes(sid) : true;
    });

    // Rebuild sender emails from remaining subscription rows for accuracy.
    const remainingSubs =
      remainingIds.length > 0
        ? await prisma.subscription.findMany({
            where: { id: { in: remainingIds }, accountId: active.id },
            select: { id: true, senderEmail: true },
          })
        : [];
    const emailById = new Map(
      remainingSubs.map((s) => [s.id, s.senderEmail.toLowerCase()] as const)
    );
    const nextEmails = remainingIds
      .map((id) => emailById.get(id))
      .filter((e): e is string => Boolean(e));

    if (remainingIds.length === 0) {
      await prisma.subscriptionBriefing.delete({
        where: { accountId: active.id },
      });
      return NextResponse.json({
        success: true,
        deletedRow: true,
        remainingSubscriptionIds: [] as string[],
      });
    }

    await prisma.subscriptionBriefing.update({
      where: { accountId: active.id },
      data: {
        subscriptionIds: remainingIds,
        senderEmails: nextEmails.length > 0 ? nextEmails : remainingEmails,
      },
    });

    return NextResponse.json({
      success: true,
      deletedRow: false,
      remainingSubscriptionIds: remainingIds,
    });
  } catch (error) {
    console.error("POST /api/subscriptions/digest/delete failed", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to delete snapshot",
      },
      { status: 500 }
    );
  }
}
