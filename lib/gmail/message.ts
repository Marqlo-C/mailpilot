import type { gmail_v1 } from "googleapis";

export type GmailMessagePreview = {
  id: string;
  subject: string;
  from: string;
  date: string;
  htmlBody: string;
  snippet: string;
};

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string {
  const lower = name.toLowerCase();
  return (
    headers?.find((h) => (h.name ?? "").toLowerCase() === lower)?.value ?? ""
  );
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function findPartByMime(
  payload: gmail_v1.Schema$MessagePart | null | undefined,
  mime: string
): string | null {
  if (!payload) return null;
  if (payload.mimeType === mime && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  for (const part of payload.parts ?? []) {
    const nested = findPartByMime(part, mime);
    if (nested) return nested;
  }
  return null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function plainTextToHtml(text: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;color:#111;padding:16px;white-space:pre-wrap;">${escapeHtml(text)}</body></html>`;
}

/**
 * Fetch a full Gmail message and normalize preview fields for the UI.
 */
export async function fetchGmailMessagePreview(
  gmail: gmail_v1.Gmail,
  messageId: string
): Promise<GmailMessagePreview> {
  const message = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const headers = message.data.payload?.headers;
  const subject = getHeader(headers, "Subject").trim() || "(No subject)";
  const from = getHeader(headers, "From").trim() || "Unknown sender";
  const dateHeader = getHeader(headers, "Date").trim();
  const date =
    dateHeader ||
    (message.data.internalDate
      ? new Date(Number(message.data.internalDate)).toISOString()
      : "");

  const html =
    findPartByMime(message.data.payload, "text/html") ??
    "";
  const plain =
    findPartByMime(message.data.payload, "text/plain") ??
    "";
  const snippet = message.data.snippet?.trim() ?? "";

  const htmlBody =
    html.trim() ||
    (plain.trim() ? plainTextToHtml(plain) : plainTextToHtml(snippet || "(Empty message)"));

  return {
    id: messageId,
    subject,
    from,
    date,
    htmlBody,
    snippet,
  };
}

/**
 * Resolve the most recent inbox message id from a sender email.
 */
export async function findLatestMessageIdFromSender(
  gmail: gmail_v1.Gmail,
  senderEmail: string
): Promise<string | null> {
  const listed = await gmail.users.messages.list({
    userId: "me",
    q: `from:${senderEmail} -in:trash -in:spam`,
    maxResults: 1,
  });
  return listed.data.messages?.[0]?.id ?? null;
}
