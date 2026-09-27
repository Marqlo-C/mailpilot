import type { gmail_v1 } from "googleapis";
import type { Subscription } from "@prisma/client";

import { rethrowIfInsufficientScope } from "@/lib/google";
import { safeFetch, SsrfError } from "@/lib/ssrf";

export type CleanupAction = "NONE" | "TRASH" | "ARCHIVE";

export type UnsubscribeResult = {
  method: "POST" | "MAILTO" | "GET";
  ok: boolean;
  detail?: string;
  /** True when RFC 8058 POST failed and GET fallback was attempted. */
  usedGetFallback?: boolean;
};

export type UnsubscribeAndCleanupResult = {
  unsub: UnsubscribeResult;
  cleanupOk: boolean;
  cleanupError: string | null;
  cleanedCount: number;
};

function stripUrlBrackets(url: string): string {
  return url.trim().replace(/^<|>$/g, "");
}

const HTTP_URL_RE = /<(https?:\/\/[^>]+)>/gi;
const MAILTO_URL_RE = /<(mailto:[^>]+)>/gi;

export type ParsedUnsubscribeHeaders = {
  unsubHttpUrl: string | null;
  unsubPostUrl: string | null;
  unsubPostBody: string | null;
  unsubMailto: string | null;
  oneClick: boolean;
};

/**
 * Extracts RFC 8058 unsubscribe targets from message headers.
 */
export function parseListUnsubscribeHeaders(
  listUnsubscribe: string | null | undefined,
  listUnsubscribePost: string | null | undefined
): ParsedUnsubscribeHeaders {
  const header = listUnsubscribe ?? "";
  const postHeader = listUnsubscribePost ?? "";

  const httpUrls: string[] = [];
  for (const match of header.matchAll(HTTP_URL_RE)) {
    if (match[1]) {
      httpUrls.push(match[1]);
    }
  }

  const mailtoUrls: string[] = [];
  for (const match of header.matchAll(MAILTO_URL_RE)) {
    if (match[1]) {
      mailtoUrls.push(match[1]);
    }
  }

  const oneClick = /list-unsubscribe\s*=\s*one-click/i.test(postHeader);
  const primaryHttp = httpUrls[0] ?? null;

  return {
    unsubHttpUrl: primaryHttp,
    unsubPostUrl: oneClick ? primaryHttp : null,
    unsubPostBody: oneClick ? "List-Unsubscribe=One-Click" : null,
    unsubMailto: mailtoUrls[0] ?? null,
    oneClick,
  };
}

/**
 * Executes unsubscribe in priority order: RFC 8058 POST → GET fallback → mailto.
 * Cleanup (trash/archive) is returned separately so HTTP unsub failure does not
 * wipe a successful Gmail cleanup.
 */
export async function executeUnsubscribe(
  gmail: gmail_v1.Gmail,
  subscription: Pick<
    Subscription,
    | "senderEmail"
    | "unsubHttpUrl"
    | "unsubPostUrl"
    | "unsubPostBody"
    | "unsubMailto"
  >,
  cleanupAction: CleanupAction = "NONE"
): Promise<UnsubscribeAndCleanupResult> {
  const unsub = await executeUnsubscribeHttpChain(gmail, subscription);

  let cleanupOk = true;
  let cleanupError: string | null = null;
  let cleanedCount = 0;

  if (cleanupAction !== "NONE") {
    try {
      cleanedCount = await cleanupSenderMessages(
        gmail,
        subscription.senderEmail,
        cleanupAction
      );
    } catch (cleanupErr) {
      cleanupOk = false;
      cleanupError =
        cleanupErr instanceof Error
          ? cleanupErr.message
          : "Gmail cleanup failed";
    }
  }

  return { unsub, cleanupOk, cleanupError, cleanedCount };
}

/**
 * POST (one-click) → GET fallback on failure → mailto last resort.
 */
async function executeUnsubscribeHttpChain(
  gmail: gmail_v1.Gmail,
  subscription: Pick<
    Subscription,
    "unsubHttpUrl" | "unsubPostUrl" | "unsubPostBody" | "unsubMailto"
  >
): Promise<UnsubscribeResult> {
  const postUrl = subscription.unsubPostUrl
    ? stripUrlBrackets(subscription.unsubPostUrl)
    : null;
  const httpUrl = subscription.unsubHttpUrl
    ? stripUrlBrackets(subscription.unsubHttpUrl)
    : postUrl;

  if (postUrl) {
    const postResult = await executeOneClickPost(
      postUrl,
      subscription.unsubPostBody ?? "List-Unsubscribe=One-Click"
    );
    if (postResult.ok) {
      return postResult;
    }

    // RFC 8058 soft-fail: many providers 404/405 POST but accept GET.
    if (httpUrl) {
      const getResult = await executeHttpGetUnsubscribe(httpUrl);
      if (getResult.ok) {
        return { ...getResult, usedGetFallback: true };
      }
      // Prefer GET detail if both failed; keep POST context.
      return {
        method: "GET",
        ok: false,
        usedGetFallback: true,
        detail: `POST ${postResult.detail}; GET ${getResult.detail}`,
      };
    }

    return postResult;
  }

  if (subscription.unsubMailto) {
    return executeMailtoUnsubscribe(gmail, subscription.unsubMailto);
  }

  if (httpUrl) {
    return executeHttpGetUnsubscribe(httpUrl);
  }

  throw new Error("Subscription has no unsubscribe target");
}

async function executeOneClickPost(
  postUrl: string,
  body: string
): Promise<UnsubscribeResult> {
  try {
    const response = await safeFetch(postUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const ok = response.status >= 200 && response.status < 400;
    return {
      method: "POST",
      ok,
      detail: `HTTP ${response.status}`,
    };
  } catch (error) {
    if (error instanceof SsrfError) {
      return { method: "POST", ok: false, detail: error.message };
    }
    throw error;
  }
}

async function executeHttpGetUnsubscribe(
  httpUrl: string
): Promise<UnsubscribeResult> {
  try {
    const response = await safeFetch(httpUrl, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    const ok = response.status >= 200 && response.status < 400;
    return {
      method: "GET",
      ok,
      detail: `HTTP ${response.status}`,
    };
  } catch (error) {
    if (error instanceof SsrfError) {
      return { method: "GET", ok: false, detail: error.message };
    }
    throw error;
  }
}

type MailtoParts = {
  to: string;
  subject: string;
};

function parseMailto(mailtoUrl: string): MailtoParts {
  const normalized = mailtoUrl.startsWith("mailto:")
    ? mailtoUrl
    : `mailto:${mailtoUrl}`;
  const url = new URL(normalized);
  const to = decodeURIComponent(url.pathname);
  if (!to) {
    throw new Error("mailto: target is missing a recipient");
  }

  const subject = url.searchParams.get("subject") ?? "Unsubscribe";
  return { to, subject };
}

function encodeRawMessage(raw: string): string {
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function executeMailtoUnsubscribe(
  gmail: gmail_v1.Gmail,
  mailtoUrl: string
): Promise<UnsubscribeResult> {
  const { to, subject } = parseMailto(mailtoUrl);
  const raw = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    "",
  ].join("\r\n");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodeRawMessage(raw),
    },
  });

  return {
    method: "MAILTO",
    ok: true,
    detail: `Sent empty message to ${to}`,
  };
}

/**
 * Trashes or archives past messages from a sender after unsubscribe.
 */
export async function cleanupSenderMessages(
  gmail: gmail_v1.Gmail,
  senderEmail: string,
  action: Exclude<CleanupAction, "NONE">
): Promise<number> {
  const messageIds: string[] = [];
  let pageToken: string | undefined;

  do {
    const listed = await gmail.users.messages.list({
      userId: "me",
      q: `from:${senderEmail}`,
      maxResults: 500,
      pageToken,
    });

    for (const message of listed.data.messages ?? []) {
      if (message.id) {
        messageIds.push(message.id);
      }
    }

    pageToken = listed.data.nextPageToken ?? undefined;
  } while (pageToken);

  if (messageIds.length === 0) {
    return 0;
  }

  // Gmail batch endpoints accept up to 1000 IDs per call
  const chunks = chunkArray(messageIds, 1000);

  for (const chunk of chunks) {
    try {
      if (action === "TRASH") {
        // gmail.modify allows trash via label, but NOT permanent batchDelete
        await gmail.users.messages.batchModify({
          userId: "me",
          requestBody: {
            ids: chunk,
            addLabelIds: ["TRASH"],
            removeLabelIds: ["INBOX"],
          },
        });
      } else {
        await gmail.users.messages.batchModify({
          userId: "me",
          requestBody: {
            ids: chunk,
            removeLabelIds: ["INBOX"],
          },
        });
      }
    } catch (error) {
      rethrowIfInsufficientScope(error);
    }
  }

  return messageIds.length;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
