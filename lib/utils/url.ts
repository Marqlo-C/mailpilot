/** Hosts used for account tracking and resume-header contact links. */
export const PROFILE_DOMAIN_KEYS = [
  "github.com",
  "linkedin.com",
  "joinhandshake.com",
  "handshake.com",
  "indeed.com",
  "glassdoor.com",
] as const;

export type ProfileAccountKind =
  | "github"
  | "linkedin"
  | "handshake"
  | "indeed"
  | "glassdoor"
  | "portfolio"
  | "website";

const MARKDOWN_LINK = /^\[([^\]]*)\]\(([^)]+)\)$/;

const PROFILE_URL_PATTERN =
  /(?<![A-Za-z0-9.@])(?:https?:\/\/|www\.)[^\s<>"'`]+|(?<![A-Za-z0-9.@])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>"'`]*)?/gi;

const FILE_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "txt",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "zip",
  "html",
  "css",
  "js",
  "json",
  "xml",
  "csv",
  "svg",
]);

function stripEdgePunctuation(value: string): string {
  return value.replace(/^[<(]+/, "").replace(/[.,;:)]+$/g, "").trim();
}

function hostOf(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0] ?? "";
}

function isGithubPagesHost(value: string): boolean {
  return /^[a-z0-9-]+\.github\.io(?:[/?#]|$)/i.test(
    value.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "")
  );
}

function isBareProfileHost(value: string): boolean {
  const lower = value.trim().toLowerCase().replace(/^www\./, "");
  if (isGithubPagesHost(lower)) return true;
  return PROFILE_DOMAIN_KEYS.some(
    (domain) =>
      lower === domain ||
      lower.startsWith(`${domain}/`) ||
      lower.startsWith(`${domain}?`)
  );
}

/**
 * Turns a bare profile host or messy link into an https URL.
 * Leaves relative paths, email addresses, and non-URLs unchanged.
 */
export function normalizeProfileUrl(raw: string): string {
  const trimmed = stripEdgePunctuation(raw);
  if (!trimmed) return "";

  const markdown = MARKDOWN_LINK.exec(trimmed);
  if (markdown) {
    const label = markdown[1] ?? "";
    const href = normalizeProfileUrl(markdown[2] ?? "");
    const normalizedLabel = isBareProfileHost(label)
      ? normalizeProfileUrl(label)
      : label;
    return href ? `[${normalizedLabel}](${href})` : trimmed;
  }

  if (/^(mailto:|tel:|javascript:|#)/i.test(trimmed)) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.includes("@") || trimmed.startsWith("/") || trimmed.startsWith("?")) {
    return trimmed;
  }

  if (
    isBareProfileHost(trimmed) ||
    /^[a-z0-9-]+(\.[a-z0-9-]+)+(?:[/?#].*)?$/i.test(trimmed)
  ) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function looksLikePhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  const letters = value.replace(/[^a-z]/gi, "");
  return digits.length >= 7 && letters.length === 0;
}

/**
 * True when a string is an http(s) URL whose hostname has a dotted, non-numeric domain.
 * Phone numbers and other non-URL text fail.
 */
export function isVerifiedProfileUrl(raw: string): boolean {
  const trimmed = raw.trim();
  let accepted = false;
  if (trimmed && !looksLikePhone(trimmed)) {
    const markdown = MARKDOWN_LINK.exec(trimmed);
    const candidate = markdown?.[2]?.trim() || trimmed;
    if (!looksLikePhone(candidate)) {
      const normalized = normalizeProfileUrl(candidate);
      if (/^https?:\/\//i.test(normalized)) {
        try {
          const hostname = new URL(normalized).hostname.replace(/\.$/, "");
          const tld = hostname.split(".").pop() ?? "";
          const numericHost = hostname.split(".").every((label) => /^\d+$/.test(label));
          accepted =
            hostname.includes(".") &&
            !numericHost &&
            /^[a-z]{2,}$/i.test(tld) &&
            !FILE_EXTENSIONS.has(tld.toLowerCase());
        } catch {
          accepted = false;
        }
      }
    }
  }
  // #region agent log
  fetch("http://127.0.0.1:7809/ingest/151252f8-c719-4220-ad29-b58c7990906d",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"3c315a"},body:JSON.stringify({sessionId:"3c315a",location:"lib/utils/url.ts:isVerifiedProfileUrl",message:"url check",data:{accepted},timestamp:Date.now(),hypothesisId:"H1"})}).catch(()=>{});
  // #endregion
  return accepted;
}

/**
 * Pulls protocol URLs, markdown hrefs, and bare profile domains out of text.
 */
export function extractProfileLinksFromText(rawText: string): string[] {
  if (!rawText) return [];
  const unique = new Map<string, string>();

  const remember = (candidate: string) => {
    const cleaned = stripEdgePunctuation(candidate);
    const normalized = normalizeProfileUrl(cleaned);
    if (!normalized || !/^https?:\/\//i.test(normalized)) return;
    const tld = hostOf(normalized).split(".").pop() ?? "";
    if (FILE_EXTENSIONS.has(tld)) return;
    const key = normalized.replace(/\/+$/, "").toLowerCase();
    if (!unique.has(key)) unique.set(key, normalized.replace(/\/+$/, ""));
  };

  for (const match of rawText.matchAll(PROFILE_URL_PATTERN)) {
    if (match[0]) remember(match[0]);
  }
  for (const match of rawText.matchAll(/\[[^\]]*]\(([^)\s]+)\)/g)) {
    if (match[1]) remember(match[1]);
  }

  return [...unique.values()];
}

/** Maps a URL to the account slot it should fill. */
export function categorizeProfileUrl(url: string): ProfileAccountKind {
  const host = hostOf(normalizeProfileUrl(url));
  const lower = normalizeProfileUrl(url).toLowerCase();
  if (host.endsWith(".github.io") || lower.includes(".github.io")) return "portfolio";
  if (host === "github.com" || host.endsWith(".github.com")) return "github";
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) return "linkedin";
  if (
    host === "joinhandshake.com" ||
    host.endsWith(".joinhandshake.com") ||
    host === "handshake.com" ||
    host.endsWith(".handshake.com")
  ) {
    return "handshake";
  }
  if (host === "indeed.com" || host.endsWith(".indeed.com")) return "indeed";
  if (host === "glassdoor.com" || host.endsWith(".glassdoor.com")) return "glassdoor";
  return "website";
}

/** True for a github.com profile root, not a repository path or github.io site. */
export function githubProfileRoot(url: string): string | null {
  const normalized = normalizeProfileUrl(url);
  if (!/^https?:\/\//i.test(normalized)) return null;
  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== "github.com") return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length !== 1 || !parts[0]) return null;
    return `https://github.com/${parts[0]}`;
  } catch {
    return null;
  }
}

export function isGithubProfileUrl(url: string): boolean {
  return githubProfileRoot(url) !== null;
}

/** First GitHub profile root printed in text, including bare `github.com/name` lines. */
export function githubProfileUrlInText(text: string): string | null {
  for (const url of extractProfileLinksFromText(text)) {
    const root = githubProfileRoot(url);
    if (root) return root;
  }
  return null;
}

/** Handshake and Indeed stay on the profile and stay out of resume headers. */
export function isResumeHeaderLink(url: string): boolean {
  const kind = categorizeProfileUrl(url);
  return kind !== "handshake" && kind !== "indeed";
}

export function accountLabelForUrl(url: string): string {
  switch (categorizeProfileUrl(url)) {
    case "github":
      return "GitHub";
    case "linkedin":
      return "LinkedIn";
    case "handshake":
      return "Handshake";
    case "indeed":
      return "Indeed";
    case "glassdoor":
      return "Glassdoor";
    case "portfolio":
      return "Portfolio";
    default:
      return "Website";
  }
}
