import type { gmail_v1 } from "googleapis";

import { rethrowIfInsufficientScope } from "@/lib/google";
import { extractMessageBody, sanitizeEmailBody } from "@/lib/llm";
import { prisma } from "@/lib/prisma";
import { MAX_BRIEFING_DAYS } from "@/lib/subscriptions/digest-constants";
import { subscriptionClutterScore } from "@/lib/subscriptions/filters";

export const MAX_BRIEFING_MESSAGES = 40;

export type DigestCard = {
  id: string;
  from: string;
  fromEmail: string;
  subject: string;
  summary: string;
  heroImageUrl: string | null;
  primaryLink: string | null;
  receivedAt: Date | null;
};

export type DigestBriefingSnapshot = {
  id: string;
  htmlPreview: string;
  generatedAt: string;
  senderEmails: string[];
  subscriptionIds: string[];
};

export type DigestResult = {
  success: true;
  processedCount: number;
  digestSentTo: string;
  briefing: DigestBriefingSnapshot;
  /** Previous DB briefing displaced to client localStorage (if any). */
  displacedBriefing: DigestBriefingSnapshot | null;
};

function encodeRawMessage(raw: string): string {
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string {
  const lower = name.toLowerCase();
  return (
    headers?.find((h) => (h.name ?? "").toLowerCase() === lower)?.value ?? ""
  );
}

function toGmailDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

/** Normalize to UTC midnight for Gmail day queries. */
function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
}

export function buildBriefingSearchQuery(
  senderEmails: string[],
  rangeStart: Date,
  rangeEnd: Date
): string {
  const fromClause = senderEmails
    .map((email) => `from:${email}`)
    .join(" OR ");
  const start = startOfUtcDay(rangeStart);
  const endExclusive = startOfUtcDay(rangeEnd);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return `(${fromClause}) after:${toGmailDate(start)} before:${toGmailDate(endExclusive)} -in:trash -in:spam`;
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function findHtmlPart(
  payload: gmail_v1.Schema$MessagePart | null | undefined
): string | null {
  if (!payload) return null;
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  for (const part of payload.parts ?? []) {
    const nested = findHtmlPart(part);
    if (nested) return nested;
  }
  return null;
}

function isTrackingOrTinyImage(url: string, tag: string): boolean {
  const lower = `${url} ${tag}`.toLowerCase();
  if (
    /width\s*=\s*["']?1["']?/.test(lower) ||
    /height\s*=\s*["']?1["']?/.test(lower)
  ) {
    return true;
  }
  return /pixel|track|beacon|spacer|open\.|click\.|list-manage|doubleclick|facebook\.com\/tr|google-analytics|googletagmanager/.test(
    lower
  );
}

function extractHeroImageUrl(html: string): string | null {
  const re = /<img\b([^>]*?)>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const attrs = match[1] ?? "";
    const src =
      attrs.match(/\bsrc=["'](https?:\/\/[^"']+)["']/i)?.[1] ??
      attrs.match(/\bsrc=(https?:\/\/\S+)/i)?.[1];
    if (!src || isTrackingOrTinyImage(src, attrs)) continue;
    return src;
  }
  return null;
}

function extractPrimaryLink(html: string): string | null {
  const re = /<a\b([^>]*?)>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const attrs = match[1] ?? "";
    const href =
      attrs.match(/\bhref=["'](https?:\/\/[^"']+)["']/i)?.[1] ?? null;
    if (!href) continue;
    const lower = href.toLowerCase();
    if (
      lower.includes("unsubscribe") ||
      lower.includes("mailto:") ||
      lower.includes("list-manage") ||
      lower.endsWith("#")
    ) {
      continue;
    }
    return href;
  }
  return null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseFromEmail(fromRaw: string): { name: string; email: string } {
  const match = fromRaw.match(/^(?:"?([^"<]*)"?\s*)?<([^>]+)>$/);
  if (match?.[2]) {
    return {
      name: (match[1] ?? "").trim() || match[2].trim(),
      email: match[2].trim().toLowerCase(),
    };
  }
  const email = fromRaw.replace(/[<>]/g, "").trim().toLowerCase();
  return { name: email, email };
}

export function buildBriefingHtml(
  cards: DigestCard[],
  opts: { rangeLabel: string; recipientEmail: string }
): string {
  const cardHtml = cards
    .map((card) => {
      const imageBlock = card.heroImageUrl
        ? `<img src="${escapeHtml(card.heroImageUrl)}" alt="" width="560" style="display:block;width:100%;max-width:560px;height:auto;border-radius:12px 12px 0 0;" />`
        : `<div style="height:8px;border-radius:12px 12px 0 0;background:#134e4a;"></div>`;
      const cta = card.primaryLink
        ? `<a href="${escapeHtml(card.primaryLink)}" style="display:inline-block;margin-top:14px;padding:10px 16px;border-radius:8px;background:#0f766e;color:#f8fafc;font-size:13px;font-weight:600;text-decoration:none;">Read Article</a>`
        : "";
      return `
      <tr>
        <td style="padding:0 0 16px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;overflow:hidden;">
            <tr><td>${imageBlock}</td></tr>
            <tr>
              <td style="padding:18px 20px 20px 20px;">
                <p style="margin:0 0 4px 0;font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:#5eead4;font-weight:600;">${escapeHtml(card.from)}</p>
                <h2 style="margin:0 0 8px 0;font-size:17px;line-height:1.35;color:#f8fafc;font-weight:700;">${escapeHtml(card.subject)}</h2>
                <p style="margin:0;font-size:13px;line-height:1.55;color:#94a3b8;">${escapeHtml(card.summary)}</p>
                ${cta}
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Mail Pilot Briefing</title>
</head>
<body style="margin:0;padding:0;background:#020617;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#020617;">
    <tr>
      <td align="center" style="padding:28px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
          <tr>
            <td style="padding:0 4px 22px 4px;">
              <p style="margin:0 0 6px 0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#2dd4bf;font-weight:700;">Mail Pilot</p>
              <h1 style="margin:0 0 8px 0;font-size:26px;line-height:1.2;color:#f8fafc;font-weight:700;">Your Briefing</h1>
              <p style="margin:0;font-size:13px;color:#94a3b8;">
                ${cards.length} update${cards.length === 1 ? "" : "s"} · ${escapeHtml(opts.rangeLabel)} · delivered to ${escapeHtml(opts.recipientEmail)}
              </p>
            </td>
          </tr>
          ${cardHtml || `<tr><td style="color:#94a3b8;font-size:14px;">No messages found in this window.</td></tr>`}
          <tr>
            <td style="padding:12px 4px 0 4px;font-size:11px;color:#64748b;line-height:1.5;">
              Original newsletter messages were moved to Trash after this briefing was sent.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function listMessageIds(
  gmail: gmail_v1.Gmail,
  query: string,
  limit: number
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const listed = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: Math.min(50, limit - ids.length),
      pageToken,
    });
    for (const message of listed.data.messages ?? []) {
      if (message.id) ids.push(message.id);
      if (ids.length >= limit) return ids;
    }
    pageToken = listed.data.nextPageToken ?? undefined;
  } while (pageToken && ids.length < limit);

  return ids;
}

async function estimateCount(
  gmail: gmail_v1.Gmail,
  query: string
): Promise<number> {
  const listed = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: 1,
  });
  return listed.data.resultSizeEstimate ?? 0;
}

async function fetchDigestCard(
  gmail: gmail_v1.Gmail,
  id: string
): Promise<DigestCard | null> {
  const message = await gmail.users.messages.get({
    userId: "me",
    id,
    format: "full",
  });
  const headers = message.data.payload?.headers;
  const subject = getHeader(headers, "Subject").trim() || "(No subject)";
  const fromRaw = getHeader(headers, "From").trim() || "Unknown sender";
  const parsed = parseFromEmail(fromRaw);

  const plain = extractMessageBody(message.data.payload);
  const html = findHtmlPart(message.data.payload) ?? "";
  const summarySource =
    sanitizeEmailBody(plain || html.replace(/<[^>]+>/g, " ")).trim() ||
    message.data.snippet?.trim() ||
    subject;
  const summary =
    summarySource.length > 240
      ? `${summarySource.slice(0, 237).trim()}…`
      : summarySource;

  const internalDate = message.data.internalDate
    ? new Date(Number(message.data.internalDate))
    : null;

  return {
    id,
    from: parsed.name,
    fromEmail: parsed.email,
    subject,
    summary,
    heroImageUrl: html ? extractHeroImageUrl(html) : null,
    primaryLink: html ? extractPrimaryLink(html) : null,
    receivedAt: internalDate,
  };
}

async function trashMessageIds(
  gmail: gmail_v1.Gmail,
  ids: string[]
): Promise<void> {
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    try {
      await gmail.users.messages.batchModify({
        userId: "me",
        requestBody: {
          ids: chunk,
          addLabelIds: ["TRASH"],
          removeLabelIds: ["INBOX"],
        },
      });
    } catch (error) {
      rethrowIfInsufficientScope(error);
    }
  }
}

async function syncSenderStatsAfterTrash(
  gmail: gmail_v1.Gmail,
  accountId: string,
  senderEmails: string[],
  trashedBySender: Map<string, number>
): Promise<void> {
  for (const email of senderEmails) {
    const key = email.toLowerCase();
    const trashed = trashedBySender.get(key) ?? 0;
    const sub = await prisma.subscription.findFirst({
      where: {
        accountId,
        senderEmail: { equals: email, mode: "insensitive" },
      },
    });
    if (!sub) continue;

    // Prefer local decrement: Gmail resultSizeEstimate is coarse and often
    // inflates remaining totals (which pushed clutter to 100 via unread share).
    const localRemaining = Math.max(0, sub.emailCount - trashed);
    let remainingTotal = localRemaining;
    let gmailEstimate: number | null = null;
    try {
      gmailEstimate = await estimateCount(
        gmail,
        `from:${email} -in:trash -in:spam`
      );
      // Only trust the estimate when it is at or below our local remaining
      // (post-trash index lag usually overcounts, not undercounts).
      if (gmailEstimate >= 0 && gmailEstimate <= localRemaining) {
        remainingTotal = gmailEstimate;
      }
    } catch {
      // Keep localRemaining.
    }

    const clutterScore = subscriptionClutterScore({
      emailCount: remainingTotal,
      lastReceivedAt: sub.lastReceivedAt,
    });

    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        emailCount: remainingTotal,
        clutterScore,
      },
    });
  }
}

/**
 * Build a branded briefing for the date range, send it, trash originals, update Neon stats.
 */
export async function createSubscriptionBriefing(options: {
  gmail: gmail_v1.Gmail;
  accountId: string;
  senderEmails: string[];
  rangeStart: Date;
  rangeEnd: Date;
  recipientEmail: string;
}): Promise<DigestResult> {
  const { gmail, accountId, recipientEmail } = options;
  const rangeStart = startOfUtcDay(options.rangeStart);
  const rangeEnd = startOfUtcDay(options.rangeEnd);
  if (rangeEnd < rangeStart) {
    throw new Error("End date must be on or after start date");
  }
  const spanDays =
    Math.floor(
      (rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;
  if (spanDays > MAX_BRIEFING_DAYS) {
    throw new Error(`Maximum briefing range is ${MAX_BRIEFING_DAYS} days`);
  }
  const today = startOfUtcDay(new Date());
  if (rangeEnd > today) {
    throw new Error("Future dates are not allowed");
  }

  const senderEmails = Array.from(
    new Set(
      options.senderEmails
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes("@"))
    )
  );
  if (senderEmails.length === 0) {
    throw new Error("Select at least one sender email");
  }

  const query = buildBriefingSearchQuery(senderEmails, rangeStart, rangeEnd);
  const ids = await listMessageIds(gmail, query, MAX_BRIEFING_MESSAGES);

  const cards: DigestCard[] = [];
  const concurrency = 5;
  for (let i = 0; i < ids.length; i += concurrency) {
    const slice = ids.slice(i, i + concurrency);
    const batch = await Promise.all(
      slice.map(async (id) => {
        try {
          return await fetchDigestCard(gmail, id);
        } catch (error) {
          rethrowIfInsufficientScope(error);
          return null;
        }
      })
    );
    for (const card of batch) {
      if (card) cards.push(card);
    }
  }

  cards.sort(
    (a, b) => (b.receivedAt?.getTime() ?? 0) - (a.receivedAt?.getTime() ?? 0)
  );

  const rangeLabel = `${rangeStart.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })} – ${rangeEnd.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;

  const html = buildBriefingHtml(cards, { rangeLabel, recipientEmail });
  const subject = `Mail Pilot Briefing · ${cards.length} update${cards.length === 1 ? "" : "s"} · ${rangeLabel}`;
  const raw = [
    `To: ${recipientEmail}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    html,
  ].join("\r\n");

  try {
    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: encodeRawMessage(raw) },
    });
  } catch (error) {
    rethrowIfInsufficientScope(error);
  }

  const processedIds = cards.map((c) => c.id);
  const trashedBySender = new Map<string, number>();
  for (const card of cards) {
    const key = card.fromEmail.toLowerCase();
    trashedBySender.set(key, (trashedBySender.get(key) ?? 0) + 1);
  }

  if (processedIds.length > 0) {
    await trashMessageIds(gmail, processedIds);
  }

  await syncSenderStatsAfterTrash(
    gmail,
    accountId,
    senderEmails,
    trashedBySender
  );

  const generatedAt = new Date();
  const subscriptions = await prisma.subscription.findMany({
    where: {
      accountId,
      senderEmail: { in: senderEmails, mode: "insensitive" },
    },
    select: { id: true, senderEmail: true },
  });
  const subscriptionIds = subscriptions.map((s) => s.id);

  const previous = await prisma.subscriptionBriefing.findUnique({
    where: { accountId },
    select: {
      id: true,
      htmlPreview: true,
      generatedAt: true,
      senderEmails: true,
      subscriptionIds: true,
    },
  });

  const briefing = await prisma.subscriptionBriefing.upsert({
    where: { accountId },
    create: {
      accountId,
      htmlPreview: html,
      generatedAt,
      senderEmails,
      subscriptionIds,
    },
    update: {
      htmlPreview: html,
      generatedAt,
      senderEmails,
      subscriptionIds,
    },
  });

  const toSnapshot = (row: {
    id: string;
    htmlPreview: string;
    generatedAt: Date;
    senderEmails: string[];
    subscriptionIds: string[];
  }): DigestBriefingSnapshot => ({
    id: row.id,
    htmlPreview: row.htmlPreview,
    generatedAt: row.generatedAt.toISOString(),
    senderEmails: row.senderEmails,
    subscriptionIds: row.subscriptionIds,
  });

  // Client migrates this into localStorage before the new DB row is treated as current.
  const displacedBriefing = previous ? toSnapshot(previous) : null;

  return {
    success: true,
    processedCount: processedIds.length,
    digestSentTo: recipientEmail,
    briefing: toSnapshot(briefing),
    displacedBriefing,
  };
}
