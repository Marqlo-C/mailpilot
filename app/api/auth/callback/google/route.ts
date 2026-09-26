import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import {
  ACTIVE_ACCOUNT_COOKIE,
  AUTH_COOKIE_MAX_AGE,
  LEGACY_ACTIVE_ACCOUNT_COOKIE,
  LEGACY_LOGGED_OUT_COOKIE,
  SESSION_COOKIE,
} from "@/lib/constants";
import { encryptToken } from "@/lib/crypto";
import {
  REJECTION_LABEL_NAME,
  exchangeCodeForTokens,
  findOrCreateLabel,
  getGmailClient,
  getGmailProfileEmail,
  registerInboxWatch,
} from "@/lib/google";
import { ensurePersistentProfile } from "@/lib/persistent-profile";
import { prisma } from "@/lib/prisma";
import { DEFAULT_ACCOUNT_RULES } from "@/lib/validations/rules";

export const runtime = "nodejs";

/**
 * Google OAuth callback — exchange code, upsert Account + PersistentProfile,
 * issue session cookie, redirect. No MFA / OTP intermediate steps.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const storedState = req.cookies.get("oauth_state")?.value;

  const clearAuthCookies = (response: NextResponse) => {
    response.cookies.set("oauth_state", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    // Clear any leftover MFA challenge cookies from prior auth experiments.
    response.cookies.set("mfa_pending", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  };

  if (oauthError) {
    return clearAuthCookies(
      NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(oauthError)}`, url.origin)
      )
    );
  }

  if (!code || !state || !storedState || state !== storedState) {
    return clearAuthCookies(
      NextResponse.redirect(
        new URL("/login?error=invalid_oauth_state", url.origin)
      )
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const gmail = getGmailClient(tokens);
    const email = await getGmailProfileEmail(gmail);
    const label = await findOrCreateLabel(gmail, REJECTION_LABEL_NAME);
    const watch = await registerInboxWatch(gmail);

    const encryptedAccess = encryptToken(tokens.accessToken);

    const existingAccount = await prisma.account.findUnique({
      where: { email },
      select: { id: true, encryptedRefresh: true },
    });
    const isReturningUser = Boolean(
      existingAccount && existingAccount.encryptedRefresh
    );

    // `select_account` logins often omit refresh_token — keep the stored one.
    const encryptedRefresh = tokens.refreshToken
      ? encryptToken(tokens.refreshToken)
      : existingAccount?.encryptedRefresh ?? null;

    if (!encryptedRefresh) {
      // First-time (or unlinked) accounts need consent to mint a refresh token.
      return clearAuthCookies(
        NextResponse.redirect(
          new URL("/api/auth/google?forceConsent=true", url.origin)
        )
      );
    }

    const rules = {
      ...DEFAULT_ACCOUNT_RULES,
      rejectionLabelName: REJECTION_LABEL_NAME,
      rejectionLabelId: label.id,
    };

    const account = await prisma.account.upsert({
      where: { email },
      create: {
        email,
        encryptedAccess,
        encryptedRefresh,
        tokenExpiry: tokens.expiryDate,
        historyId: watch.historyId,
        isActive: true,
        settings: {
          create: {
            llmProvider: "OPENROUTER",
            localOllamaUrl: "http://localhost:11434",
            rules: rules as Prisma.InputJsonValue,
          },
        },
      },
      update: {
        encryptedAccess,
        encryptedRefresh,
        tokenExpiry: tokens.expiryDate,
        historyId: watch.historyId,
        isActive: true,
        settings: {
          upsert: {
            create: {
              llmProvider: "OPENROUTER",
              localOllamaUrl: "http://localhost:11434",
              rules: rules as Prisma.InputJsonValue,
            },
            update: {
              rules: rules as Prisma.InputJsonValue,
            },
          },
        },
      },
    });

    await ensurePersistentProfile({
      email,
      googleSub: tokens.googleSub,
      accountId: account.id,
      seedRules: rules,
    });

    const redirectPath = isReturningUser
      ? "/"
      : `/settings?connected=${encodeURIComponent(email)}`;

    const response = clearAuthCookies(
      NextResponse.redirect(new URL(redirectPath, url.origin))
    );

    const cookieOpts = {
      httpOnly: true,
      sameSite: "lax" as const,
      path: "/",
      maxAge: AUTH_COOKIE_MAX_AGE,
      secure: process.env.NODE_ENV === "production",
    };

    response.cookies.set(SESSION_COOKIE, account.id, cookieOpts);
    response.cookies.set(ACTIVE_ACCOUNT_COOKIE, account.id, cookieOpts);
    // Clear legacy cookies from prior auth builds.
    response.cookies.set(LEGACY_ACTIVE_ACCOUNT_COOKIE, "", {
      ...cookieOpts,
      maxAge: 0,
    });
    response.cookies.set(LEGACY_LOGGED_OUT_COOKIE, "", {
      ...cookieOpts,
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error("Google OAuth callback failed", error);
    return clearAuthCookies(
      NextResponse.redirect(
        new URL("/login?error=oauth_callback_failed", url.origin)
      )
    );
  }
}
