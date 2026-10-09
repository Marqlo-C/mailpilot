/**
 * Lightweight job-email prefilter: keyword regexes + stemmed synonym expansion.
 * Keeps sync/classify gates aligned without LLM cost.
 * Vocabulary lives in lib/constants/job-sources.ts.
 */

import {
  APPLICATION_ACTOR_PATTERN,
  APPLICATION_SENT_TO_RE,
  APPLICATION_STATUS_UPDATE_PATTERN,
  APPLICATION_THANKS_PATTERN,
  ATS_DOMAIN_PATTERN,
  CONFIRMATION_SIGNAL_PATTERNS,
  CORE_HIRING_STEMS,
  DIGEST_SENDER_HINTS,
  HIRING_ANNOUNCEMENT_PATTERN,
  HIRING_STEM_SYNONYMS,
  JOB_BOARD_DOMAIN_PATTERN,
  JOB_BOARD_KEYWORDS,
  JOB_OPPORTUNITY_NOUN_PATTERN,
  LIFECYCLE_STATUS_PATTERN,
  OPPORTUNITY_STEM_PATTERN,
  OUTREACH_INTEREST_PATTERN,
  OUTREACH_MEETING_PATTERN,
  OUTREACH_PHRASE_PATTERN,
  RECRUITER_TITLE_PATTERN,
  SOURCING_HOOK_PATTERN,
} from "@/lib/constants/job-sources";

export { APPLICATION_SENT_TO_RE, DIGEST_SENDER_HINTS };

/** How many chars of snippet/body to scan for job signals (beyond the old 1k). */
export const PREFILTER_SCAN_CHARS = 4000;

/** How many chars of body to scan for an applied confirmation. */
const CONFIRMATION_BODY_SCAN_CHARS = 2000;

/**
 * Algorithmic English suffix stemmer — strips common suffixes in microseconds.
 * Order matters: longer suffixes first.
 */
export function lightStem(token: string): string {
  let w = token.toLowerCase().replace(/[^a-z0-9+#.']/g, "");
  if (w.length < 4) return w;

  if (w.endsWith("tion") && w.length > 6) return w.slice(0, -4);
  if (w.endsWith("sion") && w.length > 6) return w.slice(0, -4);
  if (w.endsWith("ness") && w.length > 6) return w.slice(0, -4);
  if (w.endsWith("ment") && w.length > 6) return w.slice(0, -4);
  if (w.endsWith("ing") && w.length > 5) {
    const base = w.slice(0, -3);
    return base.length >= 3 ? base : w;
  }
  if (w.endsWith("ies") && w.length > 5) return `${w.slice(0, -3)}y`;
  if (w.endsWith("ied") && w.length > 5) return `${w.slice(0, -3)}y`;
  if (w.endsWith("ely") && w.length > 5) return w.slice(0, -3);
  if (w.endsWith("ly") && w.length > 5) return w.slice(0, -2);
  if (w.endsWith("es") && w.length > 4) return w.slice(0, -2);
  if (w.endsWith("ed") && w.length > 4) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3) {
    return w.slice(0, -1);
  }
  return w;
}

/** Compact concept map: core stem → related stems/forms. */
export const STEM_SYNONYMS = HIRING_STEM_SYNONYMS;

/** Stems that alone (or via synonym expansion) indicate job-related mail. */
const CORE_JOB_STEMS = new Set<string>([
  ...CORE_HIRING_STEMS,
  ...JOB_BOARD_KEYWORDS,
]);

export const JOB_EMAIL_KEYWORD_PATTERNS: RegExp[] = [
  JOB_OPPORTUNITY_NOUN_PATTERN,
  OPPORTUNITY_STEM_PATTERN,
  HIRING_ANNOUNCEMENT_PATTERN,
  SOURCING_HOOK_PATTERN,
  OUTREACH_INTEREST_PATTERN,
  OUTREACH_PHRASE_PATTERN,
  RECRUITER_TITLE_PATTERN,
  OUTREACH_MEETING_PATTERN,
  APPLICATION_ACTOR_PATTERN,
  APPLICATION_THANKS_PATTERN,
  APPLICATION_STATUS_UPDATE_PATTERN,
  LIFECYCLE_STATUS_PATTERN,
  ATS_DOMAIN_PATTERN,
  JOB_BOARD_DOMAIN_PATTERN,
];

function expandStem(stem: string): Set<string> {
  const out = new Set<string>([stem]);
  for (const [key, vals] of Object.entries(STEM_SYNONYMS)) {
    const keyStem = lightStem(key);
    const valStems = vals.map((v) => lightStem(v));
    const related =
      stem === keyStem ||
      stem.startsWith(keyStem) ||
      keyStem.startsWith(stem) ||
      valStems.some((v) => v === stem || stem.startsWith(v) || v.startsWith(stem));
    if (!related) continue;
    out.add(keyStem);
    for (const v of valStems) out.add(v);
  }
  return out;
}

function tokenizeForStemMatch(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter((t) => t.length > 2);
}

/**
 * Stem + synonym expansion match against core job concepts.
 */
export function matchesStemmedJobConcepts(text: string): boolean {
  if (!text.trim()) return false;
  const tokens = tokenizeForStemMatch(text.slice(0, PREFILTER_SCAN_CHARS));
  for (const token of tokens) {
    const stem = lightStem(token);
    const expanded = expandStem(stem);
    for (const candidate of expanded) {
      if (CORE_JOB_STEMS.has(candidate)) return true;
      for (const core of CORE_JOB_STEMS) {
        if (
          core.length >= 4 &&
          (candidate.startsWith(core) || core.startsWith(candidate))
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Pre-filter: subject first, then snippet/body (up to PREFILTER_SCAN_CHARS),
 * using regex patterns OR stemmed synonym expansion.
 */
export function matchesJobEmailKeywords(
  subject: string,
  snippetOrBody?: string | null
): boolean {
  if (JOB_EMAIL_KEYWORD_PATTERNS.some((re) => re.test(subject))) {
    return true;
  }
  if (matchesStemmedJobConcepts(subject)) {
    return true;
  }
  if (!snippetOrBody) return false;
  const slice = snippetOrBody.slice(0, PREFILTER_SCAN_CHARS);
  if (JOB_EMAIL_KEYWORD_PATTERNS.some((re) => re.test(slice))) {
    return true;
  }
  return matchesStemmedJobConcepts(slice);
}

/** Backward-compatible alias — subject-only scan. */
export const matchesJobSubjectKeywords = (text: string) =>
  matchesJobEmailKeywords(text);

export function looksLikeDigest(
  subject: string,
  fromEmail?: string | null
): boolean {
  const hay = `${subject} ${fromEmail ?? ""}`.toLowerCase();
  return DIGEST_SENDER_HINTS.some((hint) => hay.includes(hint));
}

function hasApplicationConfirmationSignal(
  subject: string,
  bodyOrSnippet?: string | null
): boolean {
  for (const pattern of CONFIRMATION_SIGNAL_PATTERNS) {
    if (pattern.test(subject)) return true;
    if (pattern === APPLICATION_SENT_TO_RE) continue;
    if (
      bodyOrSnippet &&
      pattern.test(bodyOrSnippet.slice(0, CONFIRMATION_BODY_SCAN_CHARS))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Single gate used by sync + classifyJobEmail so webhook and LLM paths agree.
 */
export function shouldClassifyEmail(input: {
  subject: string;
  body?: string | null;
  snippet?: string | null;
  fromEmail?: string | null;
}): boolean {
  const scanText = [input.snippet, input.body].filter(Boolean).join("\n");
  if (matchesJobEmailKeywords(input.subject, scanText)) return true;
  if (looksLikeDigest(input.subject, input.fromEmail)) return true;
  if (hasApplicationConfirmationSignal(input.subject, scanText)) return true;
  return false;
}
