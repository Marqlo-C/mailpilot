/**
 * SSOT: career-agnostic job-description section labels.
 * Aligned with section-classifier phrase families for teaser + modal parsing.
 */

export type JobSectionKind = "company" | "role" | "requirements" | "other";

export type PeeledSectionLabel = {
  kind: JobSectionKind;
  label: string;
  /** Remaining prose after the label; empty when the line was label-only. */
  body: string;
};

/** Ordered longest-first so "company description" wins over "description". */
const LABEL_PATTERNS: Array<{ kind: JobSectionKind; pattern: RegExp; canonical: string }> = [
  // Company about
  {
    kind: "company",
    pattern: /^(?:about\s+the\s+(?:company|organization|firm|business)|company\s+description|company\s+overview|who\s+we\s+are|our\s+story|our\s+mission|about\s+us)\b/i,
    canonical: "Company Description",
  },
  // Role / overview / responsibilities
  {
    kind: "role",
    pattern: /^(?:role\s+description|position\s+description|job\s+description|about\s+the\s+(?:role|job|position)|about\s+this\s+role|role\s+overview|job\s+overview|position\s+overview|what\s+you(?:'ll|’ll|\s+will)\s+do|the\s+day-?to-?day|key\s+responsibilities|responsibilities|duties|day\s+in\s+the\s+life|the\s+role|summary|overview)\b/i,
    canonical: "Role Description",
  },
  // Requirements
  {
    kind: "requirements",
    pattern: /^(?:minimum\s+qualifications|preferred\s+qualifications|basic\s+qualifications|required\s+qualifications|qualifications|requirements|great\s+to\s+have|nice\s+to\s+have|must\s+have|what\s+we(?:'re|’re|\s+are)\s+looking\s+for|what\s+you(?:'ll|’ll|\s+will)\s+bring)\b/i,
    canonical: "Qualifications",
  },
  // Other structural
  {
    kind: "other",
    pattern: /^(?:benefits|perks|compensation|what\s+we\s+offer|equal\s+opportunity|eeo)\b/i,
    canonical: "Benefits",
  },
];

const MARKDOWN_HEADING_RE = /^#{1,3}\s+/;
const BOLD_WRAPPED_RE = /^\*\*(.+)\*\*$/;

function normalizeSpaces(text: string): string {
  return text.replace(/[\u00A0\u2007\u202F]/g, " ").replace(/[ \t]+/g, " ").trim();
}

function stripWrappers(text: string): string {
  return normalizeSpaces(text)
    .replace(MARKDOWN_HEADING_RE, "")
    // Whole-line bold wrapper, or leading **Label** before prose.
    .replace(/^\*\*(.+?)\*\*(?=\s|$)/, "$1")
    .replace(/^\*\*(.+)\*\*$/, "$1")
    .trim();
}

/** Role-kind labels that may appear mid-string in glued digests. */
const MID_ROLE_LABEL_RE =
  /(?:^|[\n.!?]\s*)((?:role|position|job)\s+description|about\s+the\s+(?:role|job|position)|what\s+you(?:'ll|’ll|\s+will)\s+do)\b\s*[:\-–—]?\s*/i;

/**
 * Matches a known section label at the start of `text` (full line or leading peel).
 */
export function matchSectionLabel(
  text: string
): { kind: JobSectionKind; label: string; matchLength: number } | null {
  const cleaned = stripWrappers(text);
  if (!cleaned) return null;

  for (const entry of LABEL_PATTERNS) {
    const m = cleaned.match(entry.pattern);
    if (!m || m.index !== 0) continue;
    const matched = m[0].trim();
    return {
      kind: entry.kind,
      label: matched.replace(/\s+/g, " "),
      matchLength: matched.length,
    };
  }
  return null;
}

/**
 * True for short Title Case lines that look like section headers (not sentences).
 */
export function isTitleCaseSectionLabel(line: string): boolean {
  const cleaned = stripWrappers(line);
  if (!cleaned || /[.!?]$/.test(cleaned)) return false;
  if (cleaned.length > 60) return false;

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 6) return false;

  const titleCaseWords = words.filter((w) => /^[A-Z][A-Za-z'/’-]*$/.test(w));
  if (titleCaseWords.length < words.length) return false;

  // Prefer known labels; allow unknown Title Case only when every word is capitalized
  // and the line is short (structural header shape).
  if (matchSectionLabel(cleaned)) return true;
  return words.length <= 4 && cleaned.length <= 40;
}

/**
 * Peels a leading section label from a line that may also contain prose.
 *
 * @example
 * peelLeadingSectionLabel("Company Description Remolity, Inc. is…")
 * → { kind: "company", label: "Company Description", body: "Remolity, Inc. is…" }
 */
export function peelLeadingSectionLabel(line: string): PeeledSectionLabel | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const cleaned = stripWrappers(trimmed);
  const matched = matchSectionLabel(cleaned);
  if (!matched) {
    // Standalone Title Case unknown label (no body).
    if (isTitleCaseSectionLabel(cleaned) && !/\s{2,}|\s[a-z]/.test(cleaned.slice(1))) {
      // Only treat as label-only when the whole line is the label (no lowercase prose tail).
      const hasProseTail = /\s+[a-z0-9]/.test(cleaned) || /,\s*[A-Z]/.test(cleaned);
      if (!hasProseTail && cleaned.split(/\s+/).length <= 6) {
        return { kind: "other", label: cleaned, body: "" };
      }
    }
    return null;
  }

  let rest = cleaned.slice(matched.matchLength).trim();
  // Drop separators after the label (colon, dash, em-dash).
  rest = rest.replace(/^[:\-–—]+\s*/, "").trim();

  // If the "rest" is still Title Case with no sentence punctuation, treat as label-only.
  if (!rest) {
    return { kind: matched.kind, label: matched.label, body: "" };
  }

  // Require body to look like prose (starts with capital or quote, has lowercase, or is long).
  const looksLikeProse =
    rest.length >= 20 ||
    /^["'“]?[A-Z]/.test(rest) ||
    /[a-z]/.test(rest);
  if (!looksLikeProse && isTitleCaseSectionLabel(rest)) {
    return { kind: matched.kind, label: matched.label, body: "" };
  }

  return {
    kind: matched.kind,
    label: matched.label,
    body: rest,
  };
}

/**
 * True when the entire line is a structural section heading (no prose body).
 */
export function isSectionHeadingOnly(line: string): boolean {
  const peeled = peelLeadingSectionLabel(line);
  if (peeled && !peeled.body) return true;

  const cleaned = stripWrappers(line);
  if (BOLD_WRAPPED_RE.test(line.trim()) && matchSectionLabel(cleaned)) return true;

  const letters = cleaned.replace(/[^A-Za-z]/g, "");
  if (
    letters.length >= 8 &&
    letters === letters.toUpperCase() &&
    !/[.!?]$/.test(cleaned) &&
    cleaned.split(/\s+/).length <= 8
  ) {
    return true;
  }

  return isTitleCaseSectionLabel(cleaned) && !peeled?.body;
}

/**
 * Maps a heading string to a coarse kind for teaser ranking.
 */
export function kindForHeading(heading: string): JobSectionKind {
  const matched = matchSectionLabel(heading);
  if (matched) return matched.kind;

  const h = stripWrappers(heading).toLowerCase();
  if (/\b(?:company|organization|who we are|our mission|our story)\b/i.test(h)) {
    return "company";
  }
  if (/\b(?:qualifications|requirements|must have|nice to have|great to have)\b/i.test(h)) {
    return "requirements";
  }
  if (/\b(?:role|job|position|responsibilities|overview|what you)\b/i.test(h)) {
    return "role";
  }
  return "other";
}

const COMPANY_ABOUT_CUE_RE =
  /\bis a (?:modern |leading |global |remote )?(?:space |cloud |software |technology |job )?(?:infrastructure )?(?:company|platform|startup|organization|firm)\b/i;

/**
 * Strips leading known / Title Case section labels until prose remains.
 * Agnostic final sanitize for card teasers — does not care which section "won".
 *
 * @param text - Candidate teaser source (may still start with "Role Description …").
 */
export function stripLeadingSectionLabels(text: string): string {
  let current = normalizeSpaces(text);
  if (!current) return "";

  for (let i = 0; i < 5; i++) {
    const peeled = peelLeadingSectionLabel(current);
    if (!peeled || !peeled.body) break;
    current = normalizeSpaces(peeled.body);
  }

  return current;
}

/**
 * When a blob opens as company-About and later contains a role-kind label,
 * return the prose after that label so the teaser can start on role copy.
 * Otherwise returns the input unchanged (still run through stripLeadingSectionLabels).
 */
export function preferProseAfterSectionLabel(text: string): string {
  const current = normalizeSpaces(text);
  if (!current) return "";

  const leading = peelLeadingSectionLabel(current);
  const probe = leading?.body || current;
  const startsCompany =
    leading?.kind === "company" || COMPANY_ABOUT_CUE_RE.test(probe);

  if (!startsCompany) return current;

  // Search past the opening so a leading "Overview" / company label is not re-matched.
  const searchFrom = Math.min(40, Math.floor(current.length * 0.15));
  const slice = current.slice(searchFrom);
  const mid = MID_ROLE_LABEL_RE.exec(slice);
  if (!mid || mid.index === undefined) return current;

  const afterLabel = slice.slice(mid.index + mid[0].length).trim();
  return afterLabel.length >= 40 ? afterLabel : current;
}
