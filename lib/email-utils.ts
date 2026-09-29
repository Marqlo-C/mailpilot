/**
 * Shared helpers for cleaning inbound email identity / persona signals.
 */

const TITLE_TOKENS = new Set(
  [
    "recruiter",
    "recruiting",
    "recruitment",
    "talent",
    "acquisition",
    "hr",
    "human",
    "resources",
    "partner",
    "specialist",
    "coordinator",
    "sourcer",
    "sourcing",
    "staffing",
    "agency",
    "consultant",
    "manager",
    "director",
    "lead",
    "engineer",
    "engineering",
    "technical",
    "tech",
    "founder",
    "cofounder",
    "co-founder",
    "vp",
    "ceo",
    "cto",
    "head",
    "principal",
    "senior",
    "junior",
    "intern",
    "team",
    "people",
    "ops",
    "operations",
  ].map((t) => t.toLowerCase())
);

const GENERIC_MAILBOXES = new Set(
  [
    "careers",
    "career",
    "jobs",
    "job",
    "talent",
    "recruiting",
    "recruitment",
    "hr",
    "info",
    "hello",
    "contact",
    "team",
    "support",
    "noreply",
    "no-reply",
    "donotreply",
    "do-not-reply",
    "admin",
    "office",
    "mail",
    "notifications",
    "updates",
  ].map((t) => t.toLowerCase())
);

function capitalizeWord(word: string): string {
  const lower = word.toLowerCase();
  if (!lower) return word;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function looksLikeHandle(token: string): boolean {
  if (!token) return true;
  if (/\d/.test(token)) return true;
  if (/[^a-zA-Z'-]/.test(token)) return true;
  if (token.length < 2 || token.length > 24) return true;
  return false;
}

function emailLocalPart(fromEmail?: string | null): string | null {
  const email = (fromEmail ?? "").trim().toLowerCase();
  if (!email.includes("@")) return null;
  const local = email.split("@")[0]?.trim() ?? "";
  return local || null;
}

/**
 * Extract a human first name for greetings. Prefers a professional sign-off in
 * the email body/snippet (handles shared aliases like recruiting@company.com),
 * then From display name, then a person-like email local-part.
 * Returns null for handles, generic inboxes, or unparseable names.
 */
export function cleanRecruiterFirstName(
  fromName?: string | null,
  fromEmail?: string | null,
  bodyOrSnippet?: string | null
): string | null {
  const local = emailLocalPart(fromEmail);

  const fromSignoff = firstNameFromSignoff(bodyOrSnippet);
  if (fromSignoff) return fromSignoff;

  if (fromName?.trim()) {
    let cleaned = fromName
      .trim()
      .replace(/^["']+|["']+$/g, "")
      .replace(/\([^)]*\)/g, " ")
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/[,|]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Drop trailing title-like fragments: "Anaxtrix Sato - Technical Recruiter"
    cleaned = cleaned.split(/\s[-–—|@]\s/)[0]?.trim() ?? cleaned;

    const parts = cleaned
      .split(/\s+/)
      .map((p) => p.replace(/^[^\p{L}]+|[^\p{L}'-]+$/gu, ""))
      .filter(Boolean)
      .filter((p) => !TITLE_TOKENS.has(p.toLowerCase()));

    const first = parts[0] ?? "";
    if (
      first &&
      !looksLikeHandle(first) &&
      first.toLowerCase() !== local &&
      !GENERIC_MAILBOXES.has(first.toLowerCase())
    ) {
      return capitalizeWord(first);
    }
  }

  if (local) {
    if (GENERIC_MAILBOXES.has(local.replace(/[._+-]/g, ""))) {
      return null;
    }

    // firstname.lastname / firstname_lastname / firstname-lastname
    const dotted = local.match(/^([a-z]{2,24})[._-]([a-z]{2,24})$/i);
    if (dotted?.[1] && !looksLikeHandle(dotted[1])) {
      return capitalizeWord(dotted[1]);
    }

    // Reject bare handles like qtrain3 or single opaque tokens
    if (looksLikeHandle(local) || GENERIC_MAILBOXES.has(local)) {
      return null;
    }
  }

  return null;
}

const SIGNOFF_RE =
  /(?:^|\n)\s*(?:best(?:\s+regards)?|warm(?:est)?\s+regards|kind\s+regards|regards|thanks|thank you|cheers|sincerely|cordially|all the best)\s*[,!]?\s*\n+\s*([A-Za-z][A-Za-z'-]{1,23})(?:\s+[A-Za-z][A-Za-z'-]{1,23})?\s*(?:\n|$)/gi;

/**
 * Scan the tail of an email body/snippet for "Best,\nSarah"-style sign-offs.
 */
function firstNameFromSignoff(bodyOrSnippet?: string | null): string | null {
  const raw = (bodyOrSnippet ?? "").trim();
  if (!raw) return null;

  // Prefer the closing block where human signatures live.
  const tail = raw.slice(-1200);
  let match: RegExpExecArray | null = null;
  let last: RegExpExecArray | null = null;
  SIGNOFF_RE.lastIndex = 0;
  while ((match = SIGNOFF_RE.exec(tail)) !== null) {
    last = match;
  }
  const candidate = last?.[1]?.trim() ?? null;
  if (!candidate) return null;
  if (looksLikeHandle(candidate)) return null;
  if (GENERIC_MAILBOXES.has(candidate.toLowerCase())) return null;
  if (TITLE_TOKENS.has(candidate.toLowerCase())) return null;
  return capitalizeWord(candidate);
}

const TITLE_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\btechnical\s+recruiter\b/i, label: "Technical Recruiter" },
  { re: /\btalent\s+(?:acquisition\s+)?(?:partner|specialist|manager)\b/i, label: "Talent Partner" },
  { re: /\brecruiter\b/i, label: "Recruiter" },
  { re: /\b(?:vp|vice\s+president)\s+of\s+engineering\b/i, label: "VP of Engineering" },
  { re: /\bengineering\s+manager\b/i, label: "Engineering Manager" },
  { re: /\btech(?:nical)?\s+lead\b/i, label: "Tech Lead" },
  { re: /\bhead\s+of\s+engineering\b/i, label: "Head of Engineering" },
  { re: /\bfounder\b/i, label: "Founder" },
  { re: /\bcto\b/i, label: "CTO" },
];

/**
 * Best-effort sender title from snippet/body/signature text.
 */
export function extractSenderTitle(
  text?: string | null
): string | null {
  const hay = (text ?? "").slice(0, 4000);
  if (!hay.trim()) return null;
  for (const { re, label } of TITLE_PATTERNS) {
    if (re.test(hay)) return label;
  }
  return null;
}

export function isEngineeringSenderTitle(title?: string | null): boolean {
  if (!title) return false;
  return /\b(engineer|engineering|tech\s*lead|cto|founder|architect)\b/i.test(
    title
  );
}
