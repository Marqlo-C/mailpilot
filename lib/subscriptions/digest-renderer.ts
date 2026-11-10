import { readFileSync } from "fs";
import { join } from "path";
import { isKnownJobDomain } from "@/lib/constants/job-sources";
import { faviconUrlForDomain, getCleanDomain } from "@/lib/utils/domain";

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
  if (isKnownJobDomain(lower)) {
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

const BRAND_FONT_FILE =
  "fonts/DupletRounded-Bold-BF6606345a47d2e.woff2";
const BRAND_LOGO_FILE = "logos/transparent-logo-only.png";

let cachedBrandFontDataUri: string | null = null;
let cachedBrandLogoDataUri: string | null = null;

/** Inline woff2 so preview iframes / undeployed prod URLs still render Duplet. */
export function getBrandFontDataUri(): string {
  if (cachedBrandFontDataUri) return cachedBrandFontDataUri;
  const abs = join(process.cwd(), "public", BRAND_FONT_FILE);
  const buf = readFileSync(abs);
  cachedBrandFontDataUri = `data:font/woff2;base64,${buf.toString("base64")}`;
  return cachedBrandFontDataUri;
}

/** Inline local mark so briefing HTML always uses public/logos/transparent-logo-only.png. */
export function getBrandLogoDataUri(): string {
  if (cachedBrandLogoDataUri) return cachedBrandLogoDataUri;
  const abs = join(process.cwd(), "public", BRAND_LOGO_FILE);
  const buf = readFileSync(abs);
  cachedBrandLogoDataUri = `data:image/png;base64,${buf.toString("base64")}`;
  return cachedBrandLogoDataUri;
}

export function resolveAppUrl(): string {
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

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatReceivedAt(date: Date | null): string {
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

export function formatSenderList(cards: DigestCard[]): string {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    const key = card.fromEmail.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const label =
      card.from && !card.from.includes("@") ? card.from : card.fromEmail;
    names.push(label);
  }
  if (names.length === 0) return "your subscriptions";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function senderInitials(name: string): string {
  const words = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0]![0] ?? ""}${words[1]![0] ?? ""}`.toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase() || "MP";
}

export function renderSenderChip(card: DigestCard): string {
  const name =
    card.from && !card.from.includes("@") ? card.from : card.fromEmail;
  const domain = getCleanDomain(card.fromEmail);
  const logoUrl = domain ? faviconUrlForDomain(domain) : null;
  const mark = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="" width="36" height="36" style="display:block;width:36px;height:36px;border:0;border-radius:12px;object-fit:cover;" />`
    : `<div style="width:36px;height:36px;line-height:36px;text-align:center;font-size:12px;font-weight:700;color:#0F766E;background:#CCFBF1;border-radius:12px;">${escapeHtml(senderInitials(name))}</div>`;

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:100%;margin:0 0 14px 0;table-layout:fixed;">
      <tr>
        <td valign="middle" width="36" height="36" style="width:36px;height:36px;border-radius:12px;overflow:hidden;background:#F0FDFA;border:1px solid #E2E8F0;">
          ${mark}
        </td>
        <td valign="middle" class="mp-break" style="padding-left:10px;min-width:0;">
          <p class="mp-break" style="margin:0;font-size:13px;line-height:1.25;font-weight:600;color:#0F172A;">${escapeHtml(name)}</p>
          <p class="mp-break" style="margin:2px 0 0 0;font-size:12px;line-height:1.25;color:#64748B;">${escapeHtml(card.fromEmail)}</p>
        </td>
      </tr>
    </table>`;
}

export function renderCtaButton(href: string, label: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 0 0;">
      <tr>
        <td bgcolor="#0F172A" style="background:#0F172A;border-radius:999px;">
          <a href="${escapeHtml(href)}" style="display:inline-block;padding:11px 20px;font-size:13px;line-height:1.2;font-weight:600;text-decoration:none;color:#FFFFFF;border-radius:999px;">${escapeHtml(label)}</a>
        </td>
      </tr>
    </table>`;
}

export function renderUpdateItem(card: DigestCard): string {
  const ctaLabel = actionLinkLabel(card.primaryLink);
  const received = formatReceivedAt(card.receivedAt);
  const cta = card.primaryLink
    ? renderCtaButton(card.primaryLink, ctaLabel)
    : "";

  const body = `
    ${renderSenderChip(card)}
    <h3 class="mp-break" style="margin:0 0 8px 0;font-family:Georgia,'Times New Roman',Times,serif;font-size:22px;line-height:1.28;font-weight:700;letter-spacing:-0.015em;color:#0F172A;">${escapeHtml(card.subject)}</h3>
    ${
      received
        ? `<p style="margin:0 0 12px 0;font-size:12px;line-height:1.4;font-weight:500;letter-spacing:0.02em;color:#94A3B8;">${escapeHtml(received)}</p>`
        : ""
    }
    <p class="mp-break" style="margin:0;font-size:15px;line-height:1.65;color:#475569;">${escapeHtml(card.summary)}</p>
    ${cta}`;

  if (card.heroImageUrl) {
    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:100%;margin:0 0 18px 0;background:#FFFFFF;border:1px solid #E7E5E4;border-radius:22px;overflow:hidden;">
        <tr>
          <td style="padding:0;font-size:0;line-height:0;border-radius:22px 22px 0 0;">
            <img src="${escapeHtml(card.heroImageUrl)}" alt="" width="544" style="display:block;width:100%;max-width:100%;height:auto;border:0;" />
          </td>
        </tr>
        <tr>
          <td style="padding:22px 22px 24px 22px;min-width:0;">
            ${body}
          </td>
        </tr>
      </table>`;
  }

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:100%;margin:0 0 18px 0;background:#FFFFFF;border:1px solid #E7E5E4;border-radius:22px;">
      <tr>
        <td style="padding:22px 22px 24px 22px;min-width:0;">
          ${body}
        </td>
      </tr>
    </table>`;
}

export function buildBriefingHtml(
  cards: DigestCard[],
  opts: { rangeLabel: string; recipientEmail: string; appUrl?: string }
): string {
  const appUrl = (opts.appUrl ?? resolveAppUrl()).replace(/\/+$/, "");
  const logoOnlySrc = getBrandLogoDataUri();
  const brandFontDataUri = getBrandFontDataUri();
  const brandFontStack =
    "'Duplet Rounded',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const brandMarkPx = 79;
  const brandWordmarkPx = 50;
  const subscriptionsUrl = `${appUrl}/subscriptions`;
  const sendersLabel = formatSenderList(cards);
  const updateCount = cards.length;
  const updateLabel = `${updateCount} update${updateCount === 1 ? "" : "s"}`;

  const cardsHtml =
    cards.length > 0
      ? cards
          .map(
            (card) => `
          <tr>
            <td style="padding:0;">
              ${renderUpdateItem(card)}
            </td>
          </tr>`
          )
          .join("")
      : `
          <tr>
            <td style="padding:28px 24px;background:#FFFFFF;border:1px solid #E7E5E4;border-radius:22px;font-size:15px;line-height:1.6;color:#64748B;">
              No messages found in this window.
            </td>
          </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>Mail Pilot Snapshot</title>
  <style type="text/css">
    @font-face {
      font-family: 'Duplet Rounded';
      font-style: normal;
      font-weight: 700;
      font-display: swap;
      src: url('${brandFontDataUri}') format('woff2');
    }
    html, body {
      margin: 0 auto !important;
      padding: 0 !important;
      width: 100% !important;
      background: #F8F8F7 !important;
      color: #0F172A;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    table, td {
      border-collapse: collapse;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      -ms-interpolation-mode: bicubic;
    }
    a {
      text-decoration: none;
    }
    .mp-brand-wordmark {
      font-family: ${brandFontStack} !important;
      font-weight: 700 !important;
      letter-spacing: -0.035em !important;
    }
    @media only screen and (max-width: 620px) {
      .mp-shell {
        width: 100% !important;
        max-width: 100% !important;
      }
      .mp-pad {
        padding-left: 16px !important;
        padding-right: 16px !important;
      }
      .mp-card-pad {
        padding: 18px 18px 20px 18px !important;
      }
      .mp-break {
        overflow-wrap: anywhere !important;
        word-break: break-word !important;
      }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#F8F8F7;">
  <div style="display:none;font-size:1px;color:#F8F8F7;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${escapeHtml(opts.rangeLabel)} snapshot · ${updateLabel} from ${escapeHtml(sendersLabel)}.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8F8F7;">
    <tr>
      <td align="center" style="padding:32px 12px 48px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="mp-shell" style="max-width:590px;width:100%;">
          <tr>
            <td style="padding:0 0 24px 0;text-align:center;">
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto 12px auto;">
                <tr>
                  <td align="center" valign="middle" style="padding:0;line-height:1;font-size:0;">
                    <a href="${escapeHtml(appUrl)}" style="display:inline-block;text-decoration:none;">
                      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                        <tr>
                          <td valign="middle" style="padding-right:12px;line-height:1;font-size:0;">
                            <img src="${logoOnlySrc}" alt="Mail Pilot" width="${brandMarkPx}" style="display:inline-block;width:${brandMarkPx}px;max-width:${brandMarkPx}px;height:auto;border:0;vertical-align:middle;" />
                          </td>
                          <td valign="middle" style="line-height:1;">
                            <span class="mp-brand-wordmark" style="font-family:${brandFontStack};font-size:${brandWordmarkPx}px;line-height:1;font-weight:700;color:#0F172A;letter-spacing:-0.035em;display:inline-block;vertical-align:middle;">Mail Pilot</span>
                          </td>
                        </tr>
                      </table>
                    </a>
                  </td>
                </tr>
              </table>
              <h1 class="mp-break" style="margin:0 0 6px 0;font-size:20px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;color:#0F172A;">${escapeHtml(opts.rangeLabel)} Snapshot</h1>
              <p class="mp-break" style="margin:0;font-size:13px;line-height:1.4;color:#64748B;">
                ${updateLabel} curated from ${escapeHtml(sendersLabel)}.
              </p>
            </td>
          </tr>
          ${cardsHtml}
          <tr>
            <td style="padding:24px 8px 0 8px;text-align:center;">
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto 12px auto;">
                <tr>
                  <td style="background:#E2E8F0;border-radius:999px;">
                    <a href="${escapeHtml(subscriptionsUrl)}" style="display:inline-block;padding:9px 18px;font-size:12px;line-height:1.2;font-weight:600;color:#334155;text-decoration:none;">Open Subscriptions In Mail Pilot →</a>
                  </td>
                </tr>
              </table>
              <div class="mp-break" style="font-size:12px;line-height:1.6;color:#94A3B8;">
                Original emails included in this snapshot were moved to Trash after delivery.<br />
                Delivered to ${escapeHtml(opts.recipientEmail)}.
                <a href="${escapeHtml(subscriptionsUrl)}" style="color:#64748B;text-decoration:underline;">Manage subscriptions</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
