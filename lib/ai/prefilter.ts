/**
 * Lightweight job-email prefilter: keyword regexes + stemmed synonym expansion.
 * Keeps sync/classify gates aligned without LLM cost.
 */

/** How many chars of snippet/body to scan for job signals (beyond the old 1k). */
export const PREFILTER_SCAN_CHARS = 4000;

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
    // hiring → hir + e heuristic not needed; keep "hir"/"hire" via synonyms
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

/**
 * Compact concept map: core stem → related stems/forms.
 * Matching any expanded stem counts as a job-signal hit.
 */
export const STEM_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  hire: ["hiring", "recruit", "recruiting", "staff", "staffing", "sourc", "talent"],
  hiring: ["hire", "recruit", "staff", "sourc", "talent"],
  recruit: ["hire", "hiring", "staff", "sourc", "talent", "headhunt"],
  role: ["position", "opportunit", "gig", "opening", "job", "career"],
  position: ["role", "opportunit", "opening", "job"],
  job: ["career", "role", "position", "opening", "gig", "opportunit"],
  career: ["job", "role", "profession"],
  opportunit: ["role", "opening", "position", "gig"],
  opening: ["role", "position", "job", "opportunit"],
  appli: ["applicant", "candidac", "candidat"],
  applicant: ["appli", "candidat"],
  candidat: ["appli", "applicant", "candidac"],
  interview: ["screen", "onsite", "loop"],
  offer: ["compensation", "package"],
  assess: ["hackerrank", "codesignal", "codility", "takehome"],
};

/** Stems that alone (or via synonym expansion) indicate job-related mail. */
const CORE_JOB_STEMS = new Set<string>([
  "job",
  "career",
  "role",
  "position",
  "opening",
  "opportunit",
  "hire",
  "hiring",
  "recruit",
  "staff",
  "sourc",
  "talent",
  "appli",
  "applicant",
  "candidat",
  "candidac",
  "interview",
  "offer",
  "assess",
  "onsite",
  "hackerrank",
  "codesignal",
  "codility",
  "greenhouse",
  "workday",
  "ashbyhq",
  "linkedin",
  "indeed",
  "glassdoor",
  "ziprecruiter",
  "wellfound",
  "handshake",
  "recruiter",
  "headhunt",
  "gig",
]);

export const JOB_EMAIL_KEYWORD_PATTERNS: RegExp[] = [
  // 1. Core Job & Opportunity Nouns / Stems (handles plurals)
  /\b(job|jobs|career|careers|role|roles|position|positions|opening|openings)\b/i,
  /opportunit/i,

  // 2. Hiring & Direct Sourcing Hooks
  /\b(we'?re hiring|we are hiring|now hiring|join (our|the) team)\b/i,
  /\b(saw your|came across your|found your|viewed your)\s+(profile|github|portfolio|work|experience|linkedin)\b/i,
  /\b(open to|interested in)\s+(a new|new|exploring)?\s*(role|roles|opportunit|chat|discussing|position)/i,
  /\b(talent acquisition|technical recruiter|sourcer|headhunter|executive search)\b/i,
  /\b(intro|exploratory|quick)\s+(call|chat|screen|conversation)\b/i,

  // 3. Application Lifecycle & ATS Statuses
  /\b(application|applied|applicant|candidacy|candidate)\b/i,
  /\b(thank you for|thanks for)\s+(applying|your application|your interest)\b/i,
  /\b(application\s+(?:received|submitted|sent|confirmed|status|update))\b/i,
  /\b(interview|interviewing|phone screen|tech screen|onsite|hiring manager)\b/i,
  /\b(next steps|moving forward|status update)\b/i,
  /\b(offer letter|job offer|offer of employment)\b/i,
  /\b(regret to inform|other candidates|not moving forward)\b/i,

  // 4. Online Assessments (OAs) & Screening Platforms
  /\b(hackerrank|codesignal|coderpad|karat|byteboard|codility|take-home|online assessment)\b/i,

  // 5. ATS Providers & Job Boards / Portals
  /\b(greenhouse|lever\.co|ashbyhq|workday|myworkdayjobs|smartrecruiters|icims|jobvite|bamboohr|rippling|pinpointhq|workable|breezy\.hr)\b/i,
  /\b(linkedin|indeed|glassdoor|dice\.com|ziprecruiter|wellfound|angel\.co|joinhandshake|handshake)\b/i,
];

export const DIGEST_SENDER_HINTS = [
  "glassdoor",
  "indeed",
  "linkedin",
  "jobs@",
  "noreply@",
  "no-reply@",
  "jobalert",
  "alerts@",
  "greenhouse",
  "lever.co",
  "workday",
  "ashbyhq",
  "smartrecruiters",
  "icims",
] as const;

/** LinkedIn / ATS confirmation: "your application was sent to Acme". */
export const APPLICATION_SENT_TO_RE =
  /(?:your\s+)?application\s+(?:was\s+|has\s+been\s+)?sent\s+to\s+(.+?)(?:\s*[-–|·]|$)/i;

const APPLIED_SIGNAL_RE =
  /\b(?:you\s+applied|applied\s+on\b|application\s+(?:submitted|sent|received|viewed|confirmed)|status\s*:\s*applied|application\s+status\s*:\s*applied|thank you for (?:your )?appl|thanks for (?:your )?appl)\b/i;

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
      // Prefix soft-match for stems like "opportunit" / "recruit"
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
  if (APPLICATION_SENT_TO_RE.test(subject)) return true;
  if (APPLIED_SIGNAL_RE.test(subject)) return true;
  if (bodyOrSnippet && APPLIED_SIGNAL_RE.test(bodyOrSnippet.slice(0, 2000))) {
    return true;
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
