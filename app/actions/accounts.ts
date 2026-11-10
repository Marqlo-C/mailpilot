"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { logoutSession } from "@/app/actions/auth";
import { getSessionToken } from "@/lib/core/auth";
import {
  ACTIVE_ACCOUNT_COOKIE,
  AUTH_COOKIE_MAX_AGE,
  SESSION_COOKIE,
} from "@/lib/core/constants";
import { getGmailClientForAccount } from "@/lib/gmail/google";
import { normalizeOllamaBaseUrl, ollamaBaseUrlFromEnv, probeOllamaTags } from "@/lib/ai";
import { processInboxDelta } from "@/lib/gmail/sync";
import {
  getAccountForGmailProbe,
  getAccountForManualSync,
  getAccountOllamaSettings,
  unlinkAccountTokens,
  updateOllamaSettings,
  verifyAccountOwnership,
} from "@/lib/services/account-lifecycle.service";

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

  const verification = await verifyAccountOwnership(session, accountId);
  if (!verification.ok || !verification.accountId) {
    return { ok: false, error: verification.error ?? "Account not found for this user" };
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
  const result = await unlinkAccountTokens(accountId);
  if (!result.ok) {
    return { ok: false, error: result.error ?? "Account not found" };
  }

  const cookieStore = await cookies();
  if (cookieStore.get(ACTIVE_ACCOUNT_COOKIE)?.value === accountId) {
    cookieStore.delete(ACTIVE_ACCOUNT_COOKIE);
  }
  if (cookieStore.get(SESSION_COOKIE)?.value === accountId) {
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

/**
 * Settings → Sync: runs History API delta only (`processInboxDelta`).
 * Advances `historyId`; does not stamp `lastSyncedAt` (Sync Inbox owns that).
 * Kept for isolated delta testing — prefer Job Radar → Sync Inbox day-to-day.
 */
export async function triggerManualSync(
  accountId: string
): Promise<ActionResult> {
  const account = await getAccountForManualSync(accountId);
  if (!account) {
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
): Promise<ActionResult<{ models: string[] }>> {
  const settings = await getAccountOllamaSettings(accountId);

  const raw =
    url?.trim() || settings?.localOllamaUrl || ollamaBaseUrlFromEnv();
  const base = normalizeOllamaBaseUrl(raw);

  try {
    const { models } = await probeOllamaTags(base, 5000);

    await updateOllamaSettings(accountId, base, models);

    return { ok: true, data: { models } };
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
  const account = await getAccountForGmailProbe(accountId);
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
