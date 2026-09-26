import { cookies } from "next/headers";

import {
  ACTIVE_ACCOUNT_COOKIE,
  AUTH_COOKIE_MAX_AGE,
  LEGACY_ACTIVE_ACCOUNT_COOKIE,
  LEGACY_LOGGED_OUT_COOKIE,
  SESSION_COOKIE,
} from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export type SessionCookieOptions = {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  maxAge: number;
  secure: boolean;
};

export function authCookieOptions(
  maxAge = AUTH_COOKIE_MAX_AGE
): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge,
    secure: process.env.NODE_ENV === "production",
  };
}

/**
 * Returns the raw session cookie value (account id) when present.
 */
export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(SESSION_COOKIE)?.value?.trim();
  return value && value.length > 0 ? value : null;
}

/**
 * True when a non-empty `mailpilot_session` cookie is present.
 * Used by middleware-compatible callers; DB validation happens in data layer.
 */
export function isSessionTokenPresent(token: string | null | undefined): boolean {
  return Boolean(token && token.trim().length > 0);
}

/**
 * Validates that the session cookie maps to an active Account row.
 */
export async function getAuthenticatedAccountId(): Promise<string | null> {
  const token = await getSessionToken();
  if (!token) return null;

  try {
    const account = await prisma.account.findFirst({
      where: { id: token, isActive: true },
      select: { id: true },
    });
    return account?.id ?? null;
  } catch (error) {
    console.error("getAuthenticatedAccountId failed", error);
    return null;
  }
}

/**
 * Clears all auth / account selection cookies (session + legacy leftovers).
 */
export async function clearAuthCookies(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(ACTIVE_ACCOUNT_COOKIE);
  cookieStore.delete(LEGACY_ACTIVE_ACCOUNT_COOKIE);
  cookieStore.delete(LEGACY_LOGGED_OUT_COOKIE);
  cookieStore.delete("mfa_pending");
  cookieStore.delete("oauth_state");
}
