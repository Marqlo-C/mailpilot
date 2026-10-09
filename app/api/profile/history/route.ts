import { NextResponse } from "next/server";
import { z } from "zod";

import { listAccounts } from "@/lib/data";
import { listProfileRevisions } from "@/lib/profile-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const querySchema = z.object({
  accountId: z.string().trim().min(1),
});

/**
 * Revision list for the profile menu. A GET so it is not stuck behind a long AI server action.
 */
export async function GET(request: Request) {
  const parsed = querySchema.safeParse({
    accountId: new URL(request.url).searchParams.get("accountId"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  }

  const accounts = await listAccounts();
  const allowed = accounts.some((account) => account.id === parsed.data.accountId);
  if (!allowed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = await listProfileRevisions(parsed.data.accountId);
  return NextResponse.json({ items });
}
