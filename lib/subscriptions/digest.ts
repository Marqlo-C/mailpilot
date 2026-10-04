import type { gmail_v1 } from "googleapis";

import { faviconUrlForDomain, getCleanDomain } from "@/lib/domain";
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

/** Explicit width below this is treated as icon/avatar, not a preview image. */
const MIN_PREVIEW_WIDTH_PX = 120;

function resolveAppUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  if (process.env.VERCEL_URL?.trim()) {
    return `https://${process.env.VERCEL_URL.trim().replace(/\/+$/, "")}`;
  }
  return "https://mailpilot-prod.vercel.app";
}

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

/** Context-aware CTA copy for the primary action link. */
export function actionLinkLabel(url: string | null): string {
  if (!url) return "Open Update →";
  const lower = url.toLowerCase();
  if (/github\.com\/[^/]+\/[^/]+\/pull\//.test(lower)) {
    return "View Pull Request →";
  }
  if (/github\.com\/[^/]+\/[^/]+\/issues\//.test(lower)) {
    return "View on GitHub →";
  }
  if (lower.includes("github.com")) {
    return "View on GitHub →";
  }
  if (
    /linkedin\.com\/jobs|jobs\.|greenhouse\.io|lever\.co|ashbyhq\.com|wellfound\.com|indeed\.com|boards\.|careers\./.test(
      lower
    )
  ) {
    return "View Opportunity →";
  }
  if (
    /substack\.com|medium\.com|newsletter|blog|ghost\.io|beehiiv\.com|convertkit/.test(
      lower
    )
  ) {
    return "Read Post →";
  }
  return "Open Update →";
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

/** Strip tracking chrome / bot boilerplate before summarizing. */
export function cleanDigestSummaryText(raw: string): string {
  let text = raw
    .replace(/data:[a-z0-9+.-]+\/[a-z0-9+.-]+;base64,[a-z0-9+/=\s]+/gi, " ")
    .replace(/\[[^\]]{0,12}\]:\s*#[0-9a-f]{6,}\b/gi, " ")
    .replace(/\{?\s*"?[a-f0-9]{32,}"?\s*\}?/gi, " ")
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

function formatReceivedAt(date: Date | null): string {
  if (!date) return "";
  try {
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

type SenderGroup = {
  fromEmail: string;
  from: string;
  logoUrl: string | null;
  cards: DigestCard[];
};

function groupCardsBySender(cards: DigestCard[]): SenderGroup[] {
  const order: string[] = [];
  const map = new Map<string, SenderGroup>();
  for (const card of cards) {
    const key = card.fromEmail.toLowerCase();
    let group = map.get(key);
    if (!group) {
      const domain = getCleanDomain(card.fromEmail);
      group = {
        fromEmail: card.fromEmail,
        from: card.from,
        logoUrl: domain ? faviconUrlForDomain(domain) : null,
        cards: [],
      };
      map.set(key, group);
      order.push(key);
    } else if (
      group.from.includes("@") &&
      card.from &&
      !card.from.includes("@")
    ) {
      group.from = card.from;
    }
    group.cards.push(card);
  }
  return order.map((key) => map.get(key)!);
}

function senderInitials(name: string): string {
  const words = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0]![0] ?? ""}${words[1]![0] ?? ""}`.toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase() || "MP";
}

function renderSenderSquircle(group: SenderGroup): string {
  const inner = group.logoUrl
    ? `<img src="${escapeHtml(group.logoUrl)}" alt="" width="56" height="56" style="display:block;width:56px;height:56px;object-fit:cover;border:0;" />`
    : `<div style="width:56px;height:56px;line-height:56px;text-align:center;font-size:16px;font-weight:700;color:#0f766e;background:#f0fdfa;">${escapeHtml(senderInitials(group.from))}</div>`;
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 14px auto;">
      <tr>
        <td align="center" valign="middle" width="56" height="56" style="width:56px;height:56px;border-radius:16px;background:#ffffff;border:1px solid #e2e8f0;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
          ${inner}
        </td>
      </tr>
    </table>
    <p style="margin:0 0 2px 0;text-align:center;font-size:18px;line-height:1.3;font-weight:700;color:#0f172a;">${escapeHtml(group.from)}</p>
    <p style="margin:0 0 18px 0;text-align:center;font-size:12px;line-height:1.4;color:#64748b;">${escapeHtml(group.fromEmail)}</p>`;
}

function renderUpdateItem(card: DigestCard, index: number): string {
  const received = formatReceivedAt(card.receivedAt);
  const ctaLabel = actionLinkLabel(card.primaryLink);
  const meta = received
    ? `<span style="font-weight:700;color:#0d9488;">#${index}</span> <span style="color:#94a3b8;">·</span> <span style="color:#64748b;">${escapeHtml(received)}</span>`
    : `<span style="font-weight:700;color:#0d9488;">#${index}</span>`;
  const cta = card.primaryLink
    ? `<a href="${escapeHtml(card.primaryLink)}" style="display:inline-block;margin-top:12px;padding:7px 12px;border-radius:8px;border:1px solid #cbd5e1;background:#ffffff;color:#0f766e;font-size:12px;font-weight:600;text-decoration:none;">${escapeHtml(ctaLabel)}</a>`
    : "";

  const textCol = `
    <p style="margin:0 0 6px 0;font-size:12px;line-height:1.4;">${meta}</p>
    <h3 style="margin:0 0 6px 0;font-size:15px;line-height:1.35;font-weight:600;color:#0f172a;">${escapeHtml(card.subject)}</h3>
    <p style="margin:0;font-size:13px;line-height:1.55;color:#475569;">${escapeHtml(card.summary)}</p>
    ${cta}`;

  if (card.heroImageUrl) {
    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px 0;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
        <tr>
          <td valign="top" style="padding:16px 14px 16px 16px;">
            ${textCol}
          </td>
          <td valign="top" width="150" style="width:150px;padding:16px 16px 16px 0;">
            <img src="${escapeHtml(card.heroImageUrl)}" alt="" width="150" style="display:block;width:150px;max-width:150px;height:auto;border-radius:10px;object-fit:cover;border:1px solid #e2e8f0;" />
          </td>
        </tr>
      </table>`;
  }

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px 0;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
      <tr>
        <td style="padding:16px 18px;">
          ${textCol}
        </td>
      </tr>
    </table>`;
}

export function buildBriefingHtml(
  cards: DigestCard[],
  opts: { rangeLabel: string; recipientEmail: string; appUrl?: string }
): string {
  const appUrl = (opts.appUrl ?? resolveAppUrl()).replace(/\/+$/, "");
  const logoSrc = `${appUrl}/logos/transparent-color-wordmark-inline.png`;
  const groups = groupCardsBySender(cards);
  const updateLabel = `${cards.length} update${cards.length === 1 ? "" : "s"}`;

  const groupsHtml = groups
    .map((group) => {
      const items = group.cards
        .map((card, i) => renderUpdateItem(card, i + 1))
        .join("");
      return `
      <tr>
        <td style="padding:0 0 22px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;">
            <tr>
              <td style="padding:22px 18px 10px 18px;">
                ${renderSenderSquircle(group)}
                ${items}
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
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;">
    <tr>
      <td align="center" style="padding:28px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
          <tr>
            <td style="padding:0 0 18px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 1px 2px rgba(15,23,42,0.04);">
                <tr>
                  <td style="padding:18px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td valign="middle" style="vertical-align:middle;">
                          <img src="${escapeHtml(logoSrc)}" alt="Mail Pilot" height="28" style="display:block;height:28px;width:auto;border:0;" />
                        </td>
                        <td align="right" valign="middle" style="vertical-align:middle;">
                          <span style="display:inline-block;padding:5px 10px;border-radius:999px;border:1px solid #e2e8f0;background:#f8fafc;font-size:11px;font-weight:600;color:#475569;white-space:nowrap;">${escapeHtml(opts.rangeLabel)}</span>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:12px 0 0 0;font-size:13px;line-height:1.45;color:#64748b;">
                      <span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#ccfbf1;color:#0f766e;font-size:11px;font-weight:700;letter-spacing:0.02em;">${escapeHtml(updateLabel)}</span>
                      <span style="color:#94a3b8;"> · </span>
                      delivered to ${escapeHtml(opts.recipientEmail)}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${
            groupsHtml ||
            `<tr><td style="padding:20px;border:1px solid #e2e8f0;border-radius:16px;background:#ffffff;color:#64748b;font-size:14px;">No messages found in this window.</td></tr>`
          }
          <tr>
            <td style="padding:8px 4px 0 4px;font-size:11px;color:#94a3b8;line-height:1.55;">
              Original emails included in this briefing were moved to Trash after delivery.
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

  const appUrl = resolveAppUrl();
  const html = buildBriefingHtml(cards, {
    rangeLabel,
    recipientEmail,
    appUrl,
  });
  const subject = `Mail Pilot Briefing · ${cards.length} update${cards.length === 1 ? "" : "s"} · ${rangeLabel}`;
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
