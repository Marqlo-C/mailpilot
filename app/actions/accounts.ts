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
  accountIdParamSchema,
  actionError,
  actionSuccess,
  type ServerActionResult,
} from "@/lib/validations/action.schema";
import {
  getAccountForGmailProbe,
  getAccountForManualSync,
  getAccountOllamaSettings,
  unlinkAccountTokens,
  updateOllamaSettings,
  verifyAccountOwnership,
} from "@/lib/services/account-lifecycle.service";

export type ActionResult<T = void> = ServerActionResult<T>;

export type { ServerActionResult };

export async function setActiveAccount(
  accountId: string
): Promise<ServerActionResult<void>> {
  const parsed = accountIdParamSchema.safeParse(accountId);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid account ID");
  }

  const session = await getSessionToken();
  if (!session) {
    return actionError("Not authenticated");
  }

  const verification = await verifyAccountOwnership(session, parsed.data);
  if (!verification.ok || !verification.accountId) {
    return actionError(verification.error ?? "Account not found for this user");
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ACCOUNT_COOKIE, parsed.data, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });

  revalidatePath("/", "layout");
  return actionSuccess(undefined);
}

/**
 * Clears Gmail OAuth tokens but keeps Account + historical data rows.
 */
export async function unlinkAccountCredentials(
  accountId: string
): Promise<ServerActionResult<void>> {
  const parsed = accountIdParamSchema.safeParse(accountId);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid account ID");
  }

  const session = await getSessionToken();
  if (!session) {
    return actionError("Not authenticated");
  }

  const verification = await verifyAccountOwnership(session, parsed.data);
  if (!verification.ok) {
    return actionError(verification.error ?? "Unauthorized");
  }

  const result = await unlinkAccountTokens(parsed.data);
  if (!result.ok) {
    return actionError(result.error ?? "Account not found");
  }

  const cookieStore = await cookies();
  if (cookieStore.get(ACTIVE_ACCOUNT_COOKIE)?.value === parsed.data) {
    cookieStore.delete(ACTIVE_ACCOUNT_COOKIE);
  }
  if (cookieStore.get(SESSION_COOKIE)?.value === parsed.data) {
    cookieStore.delete(ACTIVE_ACCOUNT_COOKIE);
  }

  revalidatePath("/", "layout");
  revalidatePath("/settings");
  return actionSuccess(undefined);
}

/**
 * @deprecated Prefer unlinkAccountCredentials — kept as alias for older callers.
 */
export async function removeAccount(accountId: string): Promise<ServerActionResult<void>> {
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
): Promise<ServerActionResult<void>> {
  const parsed = accountIdParamSchema.safeParse(accountId);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid account ID");
  }

  const session = await getSessionToken();
  if (!session) {
    return actionError("Not authenticated");
  }

  const verification = await verifyAccountOwnership(session, parsed.data);
  if (!verification.ok) {
    return actionError(verification.error ?? "Unauthorized");
  }

  const account = await getAccountForManualSync(parsed.data);
  if (!account) {
    return actionError("Account not found or credentials unlinked");
  }

  try {
    const historyId = account.historyId ?? "1";
    await processInboxDelta(account.email, historyId);
    revalidatePath("/");
    revalidatePath("/subscriptions");
    revalidatePath("/jobs");
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Sync failed");
  }
}

export async function pingOllama(
  accountId: string,
  url?: string
): Promise<ServerActionResult<{ models: string[] }>> {
  const parsed = accountIdParamSchema.safeParse(accountId);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid account ID");
  }

  const settings = await getAccountOllamaSettings(parsed.data);
  const raw = url?.trim() || settings?.localOllamaUrl || ollamaBaseUrlFromEnv();
  const base = normalizeOllamaBaseUrl(raw);

  try {
    const { models } = await probeOllamaTags(base, 5000);
    await updateOllamaSettings(parsed.data, base, models);
    return actionSuccess({ models });
  } catch (error) {
    return actionError(
      error instanceof Error ? error.message : "Could not reach Ollama endpoint"
    );
  }
}

/** Used to verify Gmail still accepts tokens before showing sync badge as live. */
export async function probeGmailConnection(
  accountId: string
): Promise<ServerActionResult<void>> {
  const parsed = accountIdParamSchema.safeParse(accountId);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid account ID");
  }

  const account = await getAccountForGmailProbe(parsed.data);
  if (!account || !account.encryptedAccess) {
    return actionError("Account not found or credentials unlinked");
  }

  try {
    const gmail = await getGmailClientForAccount(account);
    await gmail.users.getProfile({ userId: "me" });
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Gmail probe failed");
  }
}
