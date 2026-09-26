import { google, gmail_v1 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import type { Account } from "@prisma/client";

import { decryptToken, encryptToken } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

/** Scopes required by MailPilot (openid + profile + Gmail modify/compose). */
export const GMAIL_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.compose",
] as const;

export const REAUTH_REQUIRED_MESSAGE =
  "Account needs re-authentication with updated permissions to trash or modify messages.";

export class InsufficientScopeError extends Error {
  constructor(message: string = REAUTH_REQUIRED_MESSAGE) {
    super(message);
    this.name = "InsufficientScopeError";
  }
}

/**
 * Returns true when a Google API error indicates missing OAuth scopes.
 */
export function isInsufficientScopeError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" &&
          error !== null &&
          "message" in error &&
          typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : String(error ?? "");

  const lower = message.toLowerCase();
  if (lower.includes("insufficient authentication scopes")) {
    return true;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: { status?: number; data?: unknown } })
      .response === "object"
  ) {
    const response = (
      error as {
        response?: { status?: number; data?: { error?: { message?: string } } };
      }
    ).response;
    if (response?.status === 403) {
      const apiMessage = response.data?.error?.message?.toLowerCase() ?? "";
      if (apiMessage.includes("insufficient authentication scopes")) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Re-throws InsufficientScopeError for 403 scope failures; otherwise rethrows original.
 */
export function rethrowIfInsufficientScope(error: unknown): never {
  // #region agent log
  const errObj = error as { message?: string; code?: number|string; response?: { status?: number; data?: unknown } };
  fetch('http://127.0.0.1:7809/ingest/151252f8-c719-4220-ad29-b58c7990906d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3c315a'},body:JSON.stringify({sessionId:'3c315a',runId:'pre-fix',hypothesisId:'E',location:'lib/google.ts:rethrowIfInsufficientScope',message:'Evaluating insufficient-scope classifier',data:{classified:isInsufficientScopeError(error),errMessage:errObj?.message??String(error),errCode:errObj?.code??null,httpStatus:errObj?.response?.status??null},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (isInsufficientScopeError(error)) {
    throw new InsufficientScopeError();
  }
  throw error;
}

export const REJECTION_LABEL_NAME = "Job Search/Rejections";

export type GoogleTokens = {
  accessToken: string;
  refreshToken: string;
  expiryDate: Date;
  scope?: string | null;
};

export type WatchResult = {
  historyId: string;
  expiration: string | null | undefined;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is not set`);
  }
  return value;
}

/**
 * Builds an OAuth2 client configured with MailPilot's Google credentials.
 */
export function createOAuth2Client(): OAuth2Client {
  return new google.auth.OAuth2(
    requireEnv("GOOGLE_CLIENT_ID"),
    requireEnv("GOOGLE_CLIENT_SECRET"),
    requireEnv("GOOGLE_REDIRECT_URI")
  );
}

/**
 * Generates the Google consent-screen URL for Gmail OAuth.
 * Always forces consent so newly added scopes are granted (not reused grants).
 */
export function getAuthorizationUrl(state?: string): string {
  const oauth2Client = createOAuth2Client();
  const params = {
    access_type: "offline" as const,
    prompt: "consent" as const,
    scope: [...GMAIL_SCOPES],
    state,
  };
  const authUrl = oauth2Client.generateAuthUrl(params);
  // #region agent log
  fetch('http://127.0.0.1:7809/ingest/151252f8-c719-4220-ad29-b58c7990906d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3c315a'},body:JSON.stringify({sessionId:'3c315a',runId:'pre-fix',hypothesisId:'A',location:'lib/google.ts:getAuthorizationUrl',message:'OAuth auth URL generated',data:{scopes:params.scope,accessType:params.access_type,prompt:params.prompt,hasOffline:authUrl.includes('access_type=offline'),hasConsent:authUrl.includes('prompt=consent'),hasModify:authUrl.includes('gmail.modify'),hasCompose:authUrl.includes('gmail.compose')},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  return authUrl;
}

/**
 * Exchanges an authorization code for access + refresh tokens.
 */
export async function exchangeCodeForTokens(
  code: string
): Promise<GoogleTokens> {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  // #region agent log
  fetch('http://127.0.0.1:7809/ingest/151252f8-c719-4220-ad29-b58c7990906d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3c315a'},body:JSON.stringify({sessionId:'3c315a',runId:'pre-fix',hypothesisId:'B',location:'lib/google.ts:exchangeCodeForTokens',message:'Token exchange response scopes',data:{scope:tokens.scope??null,hasAccess:Boolean(tokens.access_token),hasRefresh:Boolean(tokens.refresh_token),expiryDate:tokens.expiry_date??null,tokenKeys:Object.keys(tokens)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  console.log("[Auth Scopes Granted]:", tokens.scope);

  if (!tokens.access_token) {
    throw new Error("Google OAuth response missing access_token");
  }
  if (!tokens.refresh_token) {
    throw new Error(
      "Google OAuth response missing refresh_token. Revoke prior consent and retry with prompt=consent."
    );
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiryDate: tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600 * 1000),
    scope: tokens.scope ?? null,
  };
}

/**
 * Returns an authenticated Gmail API client from plaintext tokens.
 */
export function getGmailClient(tokens: GoogleTokens): gmail_v1.Gmail {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.expiryDate.getTime(),
  });

  return google.gmail({ version: "v1", auth: oauth2Client });
}

/**
 * Decrypts stored account tokens and returns an authenticated Gmail client.
 * Persists refreshed access tokens when Google rotates them.
 */
export async function getGmailClientForAccount(
  account: Account
): Promise<gmail_v1.Gmail> {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: decryptToken(account.encryptedAccess),
    refresh_token: decryptToken(account.encryptedRefresh),
    expiry_date: account.tokenExpiry.getTime(),
  });

  oauth2Client.on("tokens", (tokens) => {
    void persistRefreshedTokens(account.id, tokens).catch((error: unknown) => {
      console.error(
        `Failed to persist refreshed tokens for account ${account.id}`,
        error
      );
    });
  });

  return google.gmail({ version: "v1", auth: oauth2Client });
}

async function persistRefreshedTokens(
  accountId: string,
  tokens: {
    access_token?: string | null;
    refresh_token?: string | null;
    expiry_date?: number | null;
  }
): Promise<void> {
  const data: {
    encryptedAccess?: string;
    encryptedRefresh?: string;
    tokenExpiry?: Date;
  } = {};

  if (tokens.access_token) {
    data.encryptedAccess = encryptToken(tokens.access_token);
  }
  if (tokens.refresh_token) {
    data.encryptedRefresh = encryptToken(tokens.refresh_token);
  }
  if (tokens.expiry_date) {
    data.tokenExpiry = new Date(tokens.expiry_date);
  }

  if (Object.keys(data).length === 0) {
    return;
  }

  await prisma.account.update({
    where: { id: accountId },
    data,
  });
}

/**
 * Fetches the authenticated user's Gmail address via users.getProfile.
 */
export async function getGmailProfileEmail(
  gmail: gmail_v1.Gmail
): Promise<string> {
  const profile = await gmail.users.getProfile({ userId: "me" });
  const email = profile.data.emailAddress;
  if (!email) {
    throw new Error("Gmail profile did not return an emailAddress");
  }
  return email;
}

/**
 * Finds an existing Gmail label by name, or creates it if missing.
 */
export async function findOrCreateLabel(
  gmail: gmail_v1.Gmail,
  labelName: string = REJECTION_LABEL_NAME
): Promise<{ id: string; name: string }> {
  const listed = await gmail.users.labels.list({ userId: "me" });
  const existing = listed.data.labels?.find((label) => label.name === labelName);

  if (existing?.id) {
    return { id: existing.id, name: existing.name ?? labelName };
  }

  const created = await gmail.users.labels.create({
    userId: "me",
    requestBody: {
      name: labelName,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    },
  });

  if (!created.data.id) {
    throw new Error(`Failed to create Gmail label "${labelName}"`);
  }

  return { id: created.data.id, name: created.data.name ?? labelName };
}

/**
 * Registers a Gmail push notification watch against the configured Pub/Sub topic.
 */
export async function registerInboxWatch(
  gmail: gmail_v1.Gmail
): Promise<WatchResult> {
  const topicName = requireEnv("GMAIL_PUBSUB_TOPIC");

  const response = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName,
      labelIds: ["INBOX"],
      labelFilterBehavior: "include",
    },
  });

  const historyId = response.data.historyId;
  if (!historyId) {
    throw new Error("Gmail watch() response missing historyId");
  }

  return {
    historyId: String(historyId),
    expiration: response.data.expiration,
  };
}

/**
 * Re-invokes watch() for an account and persists the new historyId.
 */
export async function renewWatchForAccount(
  account: Account
): Promise<WatchResult> {
  const gmail = await getGmailClientForAccount(account);
  const watch = await registerInboxWatch(gmail);

  await prisma.account.update({
    where: { id: account.id },
    data: { historyId: watch.historyId },
  });

  return watch;
}
