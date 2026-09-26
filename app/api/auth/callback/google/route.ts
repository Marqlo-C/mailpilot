import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { ACTIVE_ACCOUNT_COOKIE, LOGGED_OUT_COOKIE } from "@/lib/constants";
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
 * Handles the Google OAuth callback:
 * 1. Validates CSRF state
 * 2. Exchanges code for tokens and encrypts them
 * 3. Find-or-creates the Job Search/Rejections label
 * 4. Registers the initial Gmail watch
 * 5. Upserts Account + AccountSettings + PersistentProfile
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const storedState = req.cookies.get("oauth_state")?.value;

  const clearStateCookie = (response: NextResponse) => {
    response.cookies.set("oauth_state", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  };

  if (oauthError) {
    return clearStateCookie(
      NextResponse.redirect(
        new URL(`/settings?error=${encodeURIComponent(oauthError)}`, url.origin)
      )
    );
  }

  if (!code || !state || !storedState || state !== storedState) {
    return clearStateCookie(
      NextResponse.redirect(
        new URL("/settings?error=invalid_oauth_state", url.origin)
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
    const encryptedRefresh = encryptToken(tokens.refreshToken);

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

    const response = clearStateCookie(
      NextResponse.redirect(
        new URL(
          `/settings?connected=${encodeURIComponent(email)}`,
          url.origin
        )
      )
    );

    response.cookies.set(ACTIVE_ACCOUNT_COOKIE, account.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    response.cookies.set(LOGGED_OUT_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error("Google OAuth callback failed", error);
    return clearStateCookie(
      NextResponse.redirect(
        new URL("/settings?error=oauth_callback_failed", url.origin)
      )
    );
  }
}
