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

type OAuthIntent = "login" | "link";

type OAuthStatePayload = {
  intent: OAuthIntent;
  timestamp: number;
  nonce: string;
};

const STATE_MAX_AGE_MS = 10 * 60 * 1000;

function parseOAuthState(raw: string): OAuthStatePayload | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8")
    ) as Partial<OAuthStatePayload>;
    if (parsed.intent !== "login" && parsed.intent !== "link") return null;
    if (typeof parsed.timestamp !== "number") return null;
    if (typeof parsed.nonce !== "string" || !parsed.nonce) return null;
    if (Date.now() - parsed.timestamp > STATE_MAX_AGE_MS) return null;
    return {
      intent: parsed.intent,
      timestamp: parsed.timestamp,
      nonce: parsed.nonce,
    };
  } catch {
    return null;
  }
}

function cookieOpts(maxAge = AUTH_COOKIE_MAX_AGE) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
    secure: process.env.NODE_ENV === "production",
  };
}

/**
 * Google OAuth callback — exchange code, upsert Account, attach the correct
 * PersistentProfile based on OAuth intent (login = isolated user, link = same user).
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const storedState = req.cookies.get("oauth_state")?.value;

  const clearOAuthStateCookie = (response: NextResponse) => {
    response.cookies.set("oauth_state", "", { ...cookieOpts(0), maxAge: 0 });
    response.cookies.set("mfa_pending", "", { ...cookieOpts(0), maxAge: 0 });
    return response;
  };

  if (oauthError) {
    return clearOAuthStateCookie(
      NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(oauthError)}`, url.origin)
      )
    );
  }

  if (!code || !state || !storedState || state !== storedState) {
    return clearOAuthStateCookie(
      NextResponse.redirect(
        new URL("/login?error=invalid_oauth_state", url.origin)
      )
    );
  }

  const oauthState = parseOAuthState(state);
  if (!oauthState) {
    return clearOAuthStateCookie(
      NextResponse.redirect(
        new URL("/login?error=invalid_oauth_state", url.origin)
      )
    );
  }

  const { intent } = oauthState;

  try {
    const tokens = await exchangeCodeForTokens(code);
    const gmail = getGmailClient(tokens);
    const email = await getGmailProfileEmail(gmail);
    const label = await findOrCreateLabel(gmail, REJECTION_LABEL_NAME);
    const watch = await registerInboxWatch(gmail);

    const encryptedAccess = encryptToken(tokens.accessToken);

    const existingAccount = await prisma.account.findUnique({
      where: { email },
      select: {
        id: true,
        encryptedRefresh: true,
        persistentProfileId: true,
      },
    });

    const encryptedRefresh = tokens.refreshToken
      ? encryptToken(tokens.refreshToken)
      : existingAccount?.encryptedRefresh ?? null;

    if (!encryptedRefresh) {
      const retry = new URL("/api/auth/google", url.origin);
      retry.searchParams.set("forceConsent", "true");
      retry.searchParams.set("intent", intent);
      return clearOAuthStateCookie(NextResponse.redirect(retry));
    }

    const rules = {
      ...DEFAULT_ACCOUNT_RULES,
      rejectionLabelName: REJECTION_LABEL_NAME,
      rejectionLabelId: label.id,
    };

    const sharedCredentials = {
      encryptedAccess,
      encryptedRefresh,
      tokenExpiry: tokens.expiryDate,
      historyId: watch.historyId,
      isActive: true,
    };

    // --- LINK: attach mailbox to the currently authenticated MailPilot user ---
    if (intent === "link") {
      const sessionAccountId = req.cookies.get(SESSION_COOKIE)?.value?.trim();
      if (!sessionAccountId) {
        return clearOAuthStateCookie(
          NextResponse.redirect(
            new URL("/login?error=link_requires_session", url.origin)
          )
        );
      }

      const sessionAccount = await prisma.account.findUnique({
        where: { id: sessionAccountId },
        select: { id: true, persistentProfileId: true, email: true },
      });

      if (!sessionAccount) {
        return clearOAuthStateCookie(
          NextResponse.redirect(
            new URL("/login?error=session_expired", url.origin)
          )
        );
      }

      let ownerProfileId = sessionAccount.persistentProfileId;
      if (!ownerProfileId) {
        const ownerProfile = await ensurePersistentProfile({
          email: sessionAccount.email,
          accountId: sessionAccount.id,
          seedRules: rules,
        });
        ownerProfileId = ownerProfile.id;
      }

      if (
        existingAccount?.persistentProfileId &&
        existingAccount.persistentProfileId !== ownerProfileId
      ) {
        return clearOAuthStateCookie(
          NextResponse.redirect(
            new URL(
              `/settings?error=${encodeURIComponent(
                "That Gmail account already belongs to another MailPilot user."
              )}`,
              url.origin
            )
          )
        );
      }

      const account = await prisma.account.upsert({
        where: { email },
        create: {
          email,
          ...sharedCredentials,
          persistentProfileId: ownerProfileId,
          settings: {
            create: {
              llmProvider: "OPENROUTER",
              localOllamaUrl: "http://localhost:11434",
              rules: rules as Prisma.InputJsonValue,
            },
          },
        },
        update: {
          ...sharedCredentials,
          persistentProfileId: ownerProfileId,
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

      await prisma.jobApplication.updateMany({
        where: { accountId: account.id, persistentProfileId: null },
        data: { persistentProfileId: ownerProfileId },
      });

      const response = clearOAuthStateCookie(
        NextResponse.redirect(
          new URL(
            `/settings?connected=${encodeURIComponent(email)}`,
            url.origin
          )
        )
      );

      // Keep the original user session; switch active mailbox to the linked one.
      response.cookies.set(SESSION_COOKIE, sessionAccount.id, cookieOpts());
      response.cookies.set(ACTIVE_ACCOUNT_COOKIE, account.id, cookieOpts());
      response.cookies.set(LEGACY_ACTIVE_ACCOUNT_COOKIE, "", {
        ...cookieOpts(0),
        maxAge: 0,
      });
      response.cookies.set(LEGACY_LOGGED_OUT_COOKIE, "", {
        ...cookieOpts(0),
        maxAge: 0,
      });

      return response;
    }

    // --- LOGIN: independent user — never merge into another profile ---
    const isReturningUser = Boolean(
      existingAccount && existingAccount.encryptedRefresh
    );

    const account = await prisma.account.upsert({
      where: { email },
      create: {
        email,
        ...sharedCredentials,
        settings: {
          create: {
            llmProvider: "OPENROUTER",
            localOllamaUrl: "http://localhost:11434",
            rules: rules as Prisma.InputJsonValue,
          },
        },
      },
      update: {
        ...sharedCredentials,
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

    // Bind (or create) a PersistentProfile owned solely by this Google identity.
    await ensurePersistentProfile({
      email,
      googleSub: tokens.googleSub,
      accountId: account.id,
      seedRules: rules,
    });

    const redirectPath = isReturningUser
      ? "/"
      : `/settings?connected=${encodeURIComponent(email)}`;

    const response = clearOAuthStateCookie(
      NextResponse.redirect(new URL(redirectPath, url.origin))
    );

    response.cookies.set(SESSION_COOKIE, account.id, cookieOpts());
    response.cookies.set(ACTIVE_ACCOUNT_COOKIE, account.id, cookieOpts());
    response.cookies.set(LEGACY_ACTIVE_ACCOUNT_COOKIE, "", {
      ...cookieOpts(0),
      maxAge: 0,
    });
    response.cookies.set(LEGACY_LOGGED_OUT_COOKIE, "", {
      ...cookieOpts(0),
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error("Google OAuth callback failed", error);
    return clearOAuthStateCookie(
      NextResponse.redirect(
        new URL("/login?error=oauth_callback_failed", url.origin)
      )
    );
  }
}
