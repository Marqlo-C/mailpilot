import type { gmail_v1 } from "googleapis";

import { rethrowIfInsufficientScope } from "@/lib/gmail/google";
import { extractMessageBody, sanitizeEmailBody } from "@/lib/llm";
import { prisma } from "@/lib/core/prisma";
import { MAX_BRIEFING_DAYS } from "@/lib/subscriptions/digest-constants";
import { subscriptionClutterScore } from "@/lib/subscriptions/filters";
import { dateFromGmailInternalDate } from "@/lib/subscriptions/last-received";
import {
  buildBriefingHtml,
  actionLinkLabel,
  resolveAppUrl,
  type DigestCard,
} from "./digest-renderer";

export { buildBriefingHtml, actionLinkLabel, resolveAppUrl, type DigestCard };

export const MAX_BRIEFING_MESSAGES = 40;

export type DigestBriefingSnapshot = {
  id: string;
  subject: string | null;
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

function gmailFromClause(email: string): string {
  // Quote addresses so +aliases / dots are matched literally.
  const safe = email.replace(/"/g, "");
  return `from:"${safe}"`;
}

export function buildBriefingSearchQuery(
  senderEmails: string[],
  rangeStart: Date,
  rangeEnd: Date
): string {
  const fromClause = senderEmails.map(gmailFromClause).join(" OR ");
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

/** Explicit width below this is treated as icon/avatar, not a preview image. */
const MIN_PREVIEW_WIDTH_PX = 120;

/** RFC 2047 encoded-word so · and – survive MIME transport. */
export function encodeMimeSubject(str: string): string {
  return `=?UTF-8?B?${Buffer.from(str, "utf-8").toString("base64")}?=`;
}

function parseHtmlDimension(attrs: string, name: "width" | "height"): number | null {
  const match = attrs.match(
    new RegExp(`\\b${name}\\s*=\\s*["']?(\\d+(?:\\.\\d+)?)(px)?["']?`, "i")
  );
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

/** Reject trackers, avatars, badges, and explicitly small images. */
function isRejectedHeroImage(url: string, attrs: string): boolean {
  const lowerUrl = url.toLowerCase();
  const lowerAttrs = attrs.toLowerCase();
  const hay = `${lowerUrl} ${lowerAttrs}`;

  if (
    lowerUrl.includes("avatars.githubusercontent.com") ||
    lowerUrl.includes("gravatar.com") ||
    lowerUrl.includes("www.gravatar.com") ||
    /\/avatar\b/.test(lowerUrl) ||
    /profile[-_]?pic|user[-_]?icon|emoji|badge|shields\.io|img\.shields/.test(
      hay
    )
  ) {
    return true;
  }

  if (
    /pixel|track|beacon|spacer|open\.|click\.|list-manage|doubleclick|facebook\.com\/tr|google-analytics|googletagmanager/.test(
      hay
    )
  ) {
    return true;
  }

  const width = parseHtmlDimension(attrs, "width");
  const height = parseHtmlDimension(attrs, "height");
  if (width != null && width < MIN_PREVIEW_WIDTH_PX) return true;
  // Tall-skinny icons / 1px trackers
  if (height != null && height > 0 && height <= 48 && (width == null || width <= 96)) {
    return true;
  }
  if (width === 1 || height === 1) return true;

  return false;
}

export function extractHeroImageUrl(html: string): string | null {
  const re = /<img\b([^>]*?)>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const attrs = match[1] ?? "";
    const src =
      attrs.match(/\bsrc=["'](https?:\/\/[^"']+)["']/i)?.[1] ??
      attrs.match(/\bsrc=(https?:\/\/\S+)/i)?.[1];
    if (!src || isRejectedHeroImage(src, attrs)) continue;
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

/** Strip tracking chrome / bot boilerplate / leaked URLs before summarizing. */
export function cleanDigestSummaryText(raw: string): string {
  let text = raw
    .replace(/data:[a-z0-9+.-]+\/[a-z0-9+.-]+;base64,[a-z0-9+/=\s]+/gi, " ")
    .replace(/\[[^\]]{0,12}\]:\s*#[0-9a-f]{6,}\b/gi, " ")
    .replace(/\{?\s*"?[a-f0-9]{32,}"?\s*\}?/gi, " ")
    // Bare tracker / click / http(s) URLs must never leak into visible copy.
    .replace(/https?:\/\/[^\s<>"')\]]+/gi, " ")
    .replace(/\bwww\.[^\s<>"')\]]+/gi, " ")
    .replace(
      /reply to this email directly or view it on github:?\s*/gi,
      " "
    )
    .replace(/you(?:'|’)re receiving this because[^.]*\.?/gi, " ")
    .replace(/unsubscribe from this list[^.]*\.?/gi, " ")
    .replace(/view this (?:email|message) in (?:your )?browser[^.]*\.?/gi, " ")
    .replace(/manage (?:your )?notification(?:s)?[^.]*\.?/gi, " ")
    .replace(/this is an automated (?:message|notification)[^.]*\.?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text;
}

/** Truncate at a sentence or word boundary (never mid-word). */
export function truncateSummary(text: string, maxLen = 240): string {
  const cleaned = text.trim();
  if (cleaned.length <= maxLen) return cleaned;

  const window = cleaned.slice(0, maxLen + 1);
  const sentenceEnd = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf("! "),
    window.lastIndexOf("? ")
  );
  if (sentenceEnd >= Math.floor(maxLen * 0.55)) {
    return cleaned.slice(0, sentenceEnd + 1).trim();
  }

  const wordEnd = window.lastIndexOf(" ");
  const cut = wordEnd > 40 ? wordEnd : maxLen;
  return `${cleaned.slice(0, cut).trim()}…`;
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

/**
 * Newest remaining (non-trash/spam) message from this sender.
 * Used after a snapshot trashes a range so lastReceivedAt can move backward.
 */
async function newestRemainingReceivedAt(
  gmail: gmail_v1.Gmail,
  senderEmail: string
): Promise<Date | null> {
  const listed = await gmail.users.messages.list({
    userId: "me",
    q: `${gmailFromClause(senderEmail)} -in:trash -in:spam`,
    maxResults: 1,
  });
  const id = listed.data.messages?.[0]?.id;
  if (!id) return null;
  const message = await gmail.users.messages.get({
    userId: "me",
    id,
    format: "metadata",
    metadataHeaders: [],
  });
  return dateFromGmailInternalDate(message.data.internalDate);
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
  const rawSummary =
    sanitizeEmailBody(plain || html.replace(/<[^>]+>/g, " ")).trim() ||
    message.data.snippet?.trim() ||
    subject;
  const summary = truncateSummary(cleanDigestSummaryText(rawSummary));

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
  const emailsToSync = Array.from(
    new Set([
      ...senderEmails.map((e) => e.toLowerCase()),
      ...trashedBySender.keys(),
    ])
  );

  for (const email of emailsToSync) {
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
    try {
      const gmailEstimate = await estimateCount(
        gmail,
        `${gmailFromClause(email)} -in:trash -in:spam`
      );
      if (gmailEstimate != null && gmailEstimate >= 0) {
        if (gmailEstimate <= localRemaining) {
          // Estimate agrees or is lower — safe to adopt (avoids lag overcount).
          remainingTotal = gmailEstimate;
        } else if (localRemaining === 0 && gmailEstimate > 0) {
          // Local math wiped the sender but Gmail still has mail — keep visible.
          remainingTotal = gmailEstimate;
        }
      }
    } catch {
      // Keep localRemaining.
    }

    // Snapshot may have trashed the message that set lastReceivedAt — recompute
    // from whatever is still in the mailbox (or clear if none remain).
    let lastReceivedAt: Date | null = sub.lastReceivedAt;
    if (remainingTotal === 0) {
      lastReceivedAt = null;
    } else {
      try {
        lastReceivedAt = await newestRemainingReceivedAt(gmail, email);
      } catch {
        // Keep prior stamp if Gmail lookup fails.
      }
    }

    const clutterScore = subscriptionClutterScore({
      emailCount: remainingTotal,
      lastReceivedAt,
    });

    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        emailCount: remainingTotal,
        lastReceivedAt,
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
    throw new Error(`Maximum snapshot range is ${MAX_BRIEFING_DAYS} days`);
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

  const appUrl = resolveAppUrl();
  const html = buildBriefingHtml(cards, {
    rangeLabel,
    recipientEmail,
    appUrl,
  });
  const subject = `Mail Pilot Snapshot · ${cards.length} update${cards.length === 1 ? "" : "s"} · ${rangeLabel}`;
  const raw = [
    `To: ${recipientEmail}`,
    `Subject: ${encodeMimeSubject(subject)}`,
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
      subject: true,
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
      subject,
      htmlPreview: html,
      generatedAt,
      senderEmails,
      subscriptionIds,
    },
    update: {
      subject,
      htmlPreview: html,
      generatedAt,
      senderEmails,
      subscriptionIds,
    },
  });

  const toSnapshot = (row: {
    id: string;
    subject: string | null;
    htmlPreview: string;
    generatedAt: Date;
    senderEmails: string[];
    subscriptionIds: string[];
  }): DigestBriefingSnapshot => ({
    id: row.id,
    subject: row.subject,
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
