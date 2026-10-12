/**
 * Lightweight job-email prefilter: 3-tier multi-vector signal triage engine.
 * Arbitrates lifecycle signals, vector scores (+H vs +N), and structural reality proof.
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
  matchesConfirmationSignal,
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

export const AUTOMATED_SYSTEM_NOTICE_PATTERNS = [
  /\b(?:run|build|workflow|pipeline|deployment|job)\s+(?:failed|errored|cancelled)\b/i,
  /\b(?:ci|cd)\s+(?:alert|failure|notification|& deployment)\b/i,
  /\b(?:who|people|\d+)\s+viewed\s+your\s+profile\b/i,
  /\bsecurity\s+(?:alert|notice):\s*(?:unauthorized|new\s+sign-?in|password\s+reset)\b/i,
  /\bunauthorized\s+sign-?in\b/i,
];

export const COMMERCIAL_PROMOTION_PATTERNS = [
  /\b\d{1,2}%\s+off\b/i,
  /\b(?:save|discount)\s+(?:up\s+to\s+)?(?:\$\d+|\d{1,2}%)\b/i,
  /\b(?:coupon|promo|discount)\s+code\b/i,
  /\b(?:bogo|buy\s+one\s+get\s+one)\b/i,
  /\bfree\s+(?:shipping|delivery|gift|sample|chips?|steaks?|meals?|treats?|food)\b/i,
  /\b(?:flash\s+sale|clearance\s+sale|limited\s+time\s+offer|daily\s+deals?|special\s+offer|exclusive\s+deal)\b/i,
  /\b(?:pre-?order|shop\s+now|order\s+now|buy\s+now)\b/i,
  /\b(?:now\s+leasing|leasing\s+up|apartment\s+homes?|rent\s+specials?)\b/i,
  /\b(?:hardware|laptop|pizza|flight|hotel|airline|vacation)\s+(?:sale|deals?|tickets?|packages?)\b/i,
  /\bjoin\s+the\s+fight\b/i,
  /\b(?:rog\s+gaming|gaming\s+setup)\b/i,
];

export const NON_JOB_SUBJECT_PATTERNS = [
  /run failed:/i,
  /build failed:/i,
  /workflow run/i,
  /ci & deployment/i,
  /(?:\d+\s+)?people viewed your profile/i,
  /who viewed your profile/i,
  /join the fight/i,
  /save up to/i,
  /coupon/i,
  /unauthorized/i,
  /x rog gaming/i,
  /rog gaming/i,
];

export const PROMOTIONAL_MARKERS_PATTERN = new RegExp(
  "\\b(" +
    [
      "\\d+%(?:\\s+off)?",
      "%\\s+off",
      "free\\s+shipping",
      "special\\s+offer",
      "limited\\s+time\\s+offer",
      "flash\\s+sale",
      "clearance(?:\\s+sale)?",
      "black\\s+friday",
      "cyber\\s+monday",
      "coupon(?:\\s+code)?",
      "promo(?:\\s+code)?",
      "discount(?:\\s+code)?",
      "save\\s+(?:\\$\\d+|up\\s+to|\\d+%)",
      "shop\\s+now",
      "buy\\s+now",
      "order\\s+now",
      "pre-?order(?:\\s+now|\\s+today)?",
      "flight\\s+deals?",
      "hotel\\s+deals?",
      "airline\\s+tickets?",
      "vacation\\s+packages?",
      "hardware\\s+sale",
      "laptop\\s+deals?",
      "pizza\\s+deals?",
      "cashback",
      "exclusive\\s+deal",
    ].join("|") +
  ")\\b",
  "i"
);

export type TriageDecision = {
  isJobCandidate: boolean;
  reason:
    | "LIFECYCLE_CONFIRMED"
    | "HIGH_HIRING_SIGNAL"
    | "COMMERCIAL_NOISE"
    | "SYSTEM_ALERT"
    | "INSUFFICIENT_PROOF";
  hiringScore: number;
  noiseScore: number;
};

export function evaluateEmailTriage(input: {
  subject: string;
  body?: string | null;
  snippet?: string | null;
  fromEmail?: string | null;
}): TriageDecision {
  const { subject, body = "", snippet = "", fromEmail = "" } = input;
  const fullText = `${subject}\n${snippet}\n${body?.slice(0, 2000) ?? ""}`;

  // TIER 1: IRONCLAD LIFECYCLE PASS
  if (
    matchesConfirmationSignal(subject) ||
    APPLICATION_SENT_TO_RE.test(subject) ||
    hasApplicationConfirmationSignal(subject, snippet || body) ||
    /\b(?:interview\s+invitation|schedule\s+(?:your\s+)?interview|phone\s+screen|assessment\s+invitation)\b/i.test(
      subject
    )
  ) {
    return {
      isJobCandidate: true,
      reason: "LIFECYCLE_CONFIRMED",
      hiringScore: 10,
      noiseScore: 0,
    };
  }

  // TIER 2: VECTOR SCORING
  let systemNoiseScore = 0;
  let commercialNoiseScore = 0;
  let hiringScore = 0;

  for (const pattern of AUTOMATED_SYSTEM_NOTICE_PATTERNS) {
    if (pattern.test(subject)) systemNoiseScore += 3;
    else if (pattern.test(fullText)) systemNoiseScore += 1;
  }
  if (NON_JOB_SUBJECT_PATTERNS.some((re) => re.test(subject))) {
    systemNoiseScore += 3;
  }

  for (const pattern of COMMERCIAL_PROMOTION_PATTERNS) {
    if (pattern.test(subject)) commercialNoiseScore += 2;
    else if (pattern.test(fullText)) commercialNoiseScore += 1;
  }
  if (PROMOTIONAL_MARKERS_PATTERN.test(subject)) {
    commercialNoiseScore += 2;
  } else if (
    body || snippet
      ? PROMOTIONAL_MARKERS_PATTERN.test(
          (snippet || body || "").slice(0, 1500)
        )
      : false
  ) {
    commercialNoiseScore += 1;
  }

  const noiseScore = systemNoiseScore + commercialNoiseScore;

  if (SOURCING_HOOK_PATTERN.test(fullText)) hiringScore += 2;
  if (ATS_DOMAIN_PATTERN.test(fullText)) hiringScore += 3;
  if (JOB_BOARD_DOMAIN_PATTERN.test(fullText)) hiringScore += 2;
  if (
    /\b(?:we(?:'re|\s+are)\s+hiring|now\s+hiring|join\s+our\s+team|job\s+opening|career\s+opportunity)\b/i.test(
      subject
    )
  ) {
    hiringScore += 2;
  }
  if (
    /\b(?:\$\d{2,3}(?:,\d{3})*|\$\d{2,3}k)\s*(?:-|to)\s*(?:\$\d{2,3}(?:,\d{3})*|\$\d{2,3}k|\d{2,3}k)\b/i.test(
      fullText
    )
  ) {
    hiringScore += 2;
  }
  if (
    looksLikeDigest(subject, fromEmail) ||
    /\b(?:top\s+picks?|recommended\s+jobs?|jobs?\s+for\s+you|jobs?\s+similar\s+to|job\s+matches?)\b/i.test(
      subject
    )
  ) {
    hiringScore += 2;
  }
  if (matchesJobEmailKeywords(subject, fullText)) {
    hiringScore += 2;
  }

  if (noiseScore >= 2 && hiringScore === 0) {
    const reason =
      systemNoiseScore > commercialNoiseScore
        ? "SYSTEM_ALERT"
        : "COMMERCIAL_NOISE";
    return {
      isJobCandidate: false,
      reason,
      hiringScore,
      noiseScore,
    };
  }

  if (hiringScore >= 2 && noiseScore === 0) {
    return {
      isJobCandidate: true,
      reason: "HIGH_HIRING_SIGNAL",
      hiringScore,
      noiseScore,
    };
  }

  // TIER 3: CONTESTED / BORDERLINE ARBITRATION
  const hasAtsProof = ATS_DOMAIN_PATTERN.test(fullText);
  const hasRecruiterProof = Boolean(
    fromEmail &&
      !/noreply|no-reply|alerts@|notifications@|news@|digest@/i.test(fromEmail) &&
      SOURCING_HOOK_PATTERN.test(fullText)
  );
  const hasCompProof =
    /\b(?:\$\d{2,3}(?:,\d{3})*|\$\d{2,3}k)\s*(?:-|to)\s*(?:\$\d{2,3}(?:,\d{3})*|\$\d{2,3}k|\d{2,3}k)\b/i.test(
      fullText
    );
  const isDigestWithJobBoard =
    looksLikeDigest(subject, fromEmail) &&
    (JOB_BOARD_DOMAIN_PATTERN.test(fullText) ||
      ATS_DOMAIN_PATTERN.test(fullText));

  // Heavy system alert or commercial noise without structural proof is rejected
  if (
    systemNoiseScore >= 3 ||
    (commercialNoiseScore >= 2 &&
      !hasAtsProof &&
      !hasRecruiterProof &&
      !hasCompProof)
  ) {
    const reason =
      systemNoiseScore >= commercialNoiseScore
        ? "SYSTEM_ALERT"
        : "COMMERCIAL_NOISE";
    return {
      isJobCandidate: false,
      reason,
      hiringScore,
      noiseScore,
    };
  }

  if (
    hasAtsProof ||
    hasRecruiterProof ||
    hasCompProof ||
    isDigestWithJobBoard
  ) {
    return {
      isJobCandidate: true,
      reason: "HIGH_HIRING_SIGNAL",
      hiringScore,
      noiseScore,
    };
  }

  return {
    isJobCandidate: false,
    reason: "INSUFFICIENT_PROOF",
    hiringScore,
    noiseScore,
  };
}

export function isPromotionalOrMarketingEmail(
  subject: string,
  bodyOrSnippet?: string | null,
  fromEmail?: string | null
): boolean {
  const triage = evaluateEmailTriage({
    subject,
    snippet: bodyOrSnippet,
    fromEmail,
  });
  return (
    !triage.isJobCandidate &&
    (triage.reason === "COMMERCIAL_NOISE" || triage.reason === "SYSTEM_ALERT")
  );
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
  return evaluateEmailTriage(input).isJobCandidate;
}
