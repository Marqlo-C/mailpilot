"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { logoutSession } from "@/app/actions/auth";
import { getSessionToken } from "@/lib/auth";
import {
  ACTIVE_ACCOUNT_COOKIE,
  AUTH_COOKIE_MAX_AGE,
  SESSION_COOKIE,
} from "@/lib/constants";
import { getGmailClientForAccount } from "@/lib/google";
import { prisma } from "@/lib/prisma";
import { processInboxDelta } from "@/lib/sync";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function setActiveAccount(
  accountId: string
): Promise<ActionResult> {
  const session = await getSessionToken();
  if (!session) {
    return { ok: false, error: "Not authenticated" };
  }

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
    maxAge: AUTH_COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Clears Gmail OAuth tokens but keeps Account + historical data rows.
 */
export async function unlinkAccountCredentials(
  accountId: string
): Promise<ActionResult> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) {
    return { ok: false, error: "Account not found" };
  }

  await prisma.account.update({
    where: { id: accountId },
    data: {
      encryptedAccess: null,
      encryptedRefresh: null,
      tokenExpiry: null,
      historyId: null,
      // Keep row active in UI so history remains visible; tokens alone are cleared.
      isActive: true,
    },
  });

  const cookieStore = await cookies();
  if (cookieStore.get(ACTIVE_ACCOUNT_COOKIE)?.value === accountId) {
    cookieStore.delete(ACTIVE_ACCOUNT_COOKIE);
  }
  if (cookieStore.get(SESSION_COOKIE)?.value === accountId) {
    // Session pointed at this inbox — clear selection but keep session if another
    // account exists; full logout is explicit via logoutSession.
    cookieStore.delete(ACTIVE_ACCOUNT_COOKIE);
  }

  revalidatePath("/", "layout");
  revalidatePath("/settings");
  return { ok: true };
}

/**
 * @deprecated Prefer unlinkAccountCredentials — kept as alias for older callers.
 */
export async function removeAccount(accountId: string): Promise<ActionResult> {
  return unlinkAccountCredentials(accountId);
}

/**
 * Ends the MailPilot browser session (cookies only). Does not unlink Gmail.
 * @deprecated Prefer `logoutSession` from `@/app/actions/auth`.
 */
export async function logoutMailPilotSession(): Promise<never> {
  return logoutSession();
}

export async function triggerManualSync(
  accountId: string
): Promise<ActionResult> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account || !account.isActive || !account.encryptedAccess) {
    return { ok: false, error: "Account not found or credentials unlinked" };
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
  if (!account || !account.encryptedAccess) {
    return { ok: false, error: "Account not found or credentials unlinked" };
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
