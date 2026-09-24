"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { ACTIVE_ACCOUNT_COOKIE } from "@/lib/constants";
import { getGmailClientForAccount } from "@/lib/google";
import { prisma } from "@/lib/prisma";
import { processInboxDelta } from "@/lib/sync";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function setActiveAccount(
  accountId: string
): Promise<ActionResult> {
  const account = await prisma.account.findFirst({
    where: { id: accountId, isActive: true },
  });

  if (!account) {
    return { ok: false, error: "Account not found" };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ACCOUNT_COOKIE, accountId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeAccount(accountId: string): Promise<ActionResult> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) {
    return { ok: false, error: "Account not found" };
  }

  await prisma.account.delete({ where: { id: accountId } });

  const cookieStore = await cookies();
  if (cookieStore.get(ACTIVE_ACCOUNT_COOKIE)?.value === accountId) {
    cookieStore.delete(ACTIVE_ACCOUNT_COOKIE);
  }

  revalidatePath("/", "layout");
  revalidatePath("/settings");
  return { ok: true };
}

export async function triggerManualSync(
  accountId: string
): Promise<ActionResult> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account || !account.isActive) {
    return { ok: false, error: "Account not found or inactive" };
  }

  try {
    const historyId = account.historyId ?? "1";
    await processInboxDelta(account.email, historyId);
    revalidatePath("/");
    revalidatePath("/subscriptions");
    revalidatePath("/jobs");
    return { ok: true };
  } catch (error) {
    console.error("Manual sync failed", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Sync failed",
    };
  }
}

export async function pingOllama(
  accountId: string,
  url?: string
): Promise<ActionResult<{ models: number }>> {
  const settings = await prisma.accountSettings.findUnique({
    where: { accountId },
  });

  const base =
    url?.trim() || settings?.localOllamaUrl || "http://localhost:11434";

  try {
    // Allow localhost for Ollama ping (user's machine) — not used for unsubscribe
    const endpoint = new URL("/api/tags", base).toString();
    const response = await fetch(endpoint, {
      method: "GET",
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) {
      return { ok: false, error: `Ollama responded with HTTP ${response.status}` };
    }

    const json = (await response.json()) as { models?: unknown[] };
    return { ok: true, data: { models: json.models?.length ?? 0 } };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not reach Ollama endpoint",
    };
  }
}

/** Used to verify Gmail still accepts tokens before showing sync badge as live. */
export async function probeGmailConnection(
  accountId: string
): Promise<ActionResult> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) {
    return { ok: false, error: "Account not found" };
  }

  try {
    const gmail = await getGmailClientForAccount(account);
    await gmail.users.getProfile({ userId: "me" });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Gmail probe failed",
    };
  }
}
