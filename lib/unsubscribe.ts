import type { gmail_v1 } from "googleapis";
import type { Subscription } from "@prisma/client";

import { safeFetch, SsrfError } from "@/lib/ssrf";

export type CleanupAction = "NONE" | "TRASH" | "ARCHIVE";

export type UnsubscribeResult = {
  method: "POST" | "MAILTO" | "GET";
  ok: boolean;
  detail?: string;
};

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
 * Executes unsubscribe in priority order: RFC 8058 POST → mailto → HTTPS GET.
 * Optionally cleans up past messages from the sender.
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
): Promise<UnsubscribeResult> {
  let result: UnsubscribeResult | null = null;

  if (subscription.unsubPostUrl) {
    result = await executeOneClickPost(
      subscription.unsubPostUrl,
      subscription.unsubPostBody ?? "List-Unsubscribe=One-Click"
    );
  } else if (subscription.unsubMailto) {
    result = await executeMailtoUnsubscribe(gmail, subscription.unsubMailto);
  } else if (subscription.unsubHttpUrl) {
    result = await executeHttpGetUnsubscribe(subscription.unsubHttpUrl);
  } else {
    throw new Error(
      `Subscription for ${subscription.senderEmail} has no unsubscribe target`
    );
  }

  if (cleanupAction !== "NONE") {
    await cleanupSenderMessages(gmail, subscription.senderEmail, cleanupAction);
  }

  return result;
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
    if (action === "TRASH") {
      await gmail.users.messages.batchDelete({
        userId: "me",
        requestBody: { ids: chunk },
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
