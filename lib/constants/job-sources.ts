/** Verbs commonly used by recruiters in cold outreach */
export const SOURCING_VERB_PHRASES = [
  "saw your",
  "came across your",
  "found your",
  "viewed your",
] as const;

/** Platforms or materials referenced in sourcing messages */
export const SOURCING_PROFILE_TARGETS = [
  "profile",
  "portfolio",
  "work",
  "experience",
  "linkedin",
  "github",
  "behance",
  "dribbble",
] as const;

/** Regex matching cold sourcing hooks across diverse career tracks */
export const SOURCING_HOOK_PATTERN = new RegExp(
  `\\b(${SOURCING_VERB_PHRASES.join("|")})\\s+(${SOURCING_PROFILE_TARGETS.join("|")})\\b`,
  "i"
);

/** Application lifecycle tokens for subject searches */
export const LIFECYCLE_SUBJECT_KEYWORDS = [
  "application",
  "applied",
  "interview",
  "status",
  "assessment",
  '"thank you"',
] as const;

/** Job board & recruiter alert subject triggers */
export const DIGEST_SUBJECT_PHRASES = [
  '"job alert"',
  '"jobs for you"',
  '"new jobs"',
  '"recommended jobs"',
  "hiring",
  "opportunity",
] as const;

/** Exact phrases indicating application submission/confirmation */
export const CONFIRMATION_EXACT_PHRASES = ['"thank you for applying"'] as const;

/** Common mailbox local-parts associated with automated notifications */
export const AUTOMATED_MAILBOX_PREFIXES = [
  "jobs@",
  "noreply@",
  "no-reply@",
  "jobalert",
  "alerts@",
] as const;

/** Sourcing and recruiter outreach phrases */
export const OUTREACH_PHRASES = [
  "we're hiring",
  "we are hiring",
  "now hiring",
  "join the team",
  "join our team",
  "open to a new role",
  "intro call",
  "intro chat",
] as const;

/** Recruitment and talent professional titles */
export const RECRUITER_TITLES = [
  "talent acquisition",
  "recruiter",
  "sourcer",
  "headhunter",
  "executive search",
  "staffing specialist",
] as const;

/** Job and opening nouns used by the keyword prefilter */
export const JOB_OPPORTUNITY_NOUNS = [
  "job",
  "jobs",
  "career",
  "careers",
  "role",
  "roles",
  "position",
  "positions",
  "opening",
  "openings",
] as const;

/** Prefix that matches opportunity / opportunities without a word boundary */
export const OPPORTUNITY_STEM = "opportunit";

/** People and records named in application mail */
export const APPLICATION_ACTOR_TERMS = [
  "application",
  "applied",
  "applicant",
  "candidacy",
  "candidate",
] as const;

/** Application status, lifecycle, screening, offer, and rejection terms */
export const LIFECYCLE_STATUS_TERMS = [
  "application received",
  "application submitted",
  "application sent",
  "application confirmed",
  "application status",
  "application update",
  "phone screen",
  "skills assessment",
  "hiring manager",
  "offer letter",
  "job offer",
  "offer of employment",
  "next steps",
  "moving forward",
  "status update",
  "interview",
  "interviewing",
  "onsite",
  "skills test",
  "questionnaire",
  "work sample",
  "take-home",
  "online assessment",
  "assessment",
  "regret to inform",
  "other candidates",
  "not moving forward",
] as const;

/** Words that follow "application" in a status line */
export const APPLICATION_STATUS_WORDS = [
  "received",
  "submitted",
  "sent",
  "confirmed",
  "status",
  "update",
] as const;

/** Leads for thank-you application mail */
export const APPLICATION_THANKS_LEADS = ["thank you for", "thanks for"] as const;

/** Targets that follow a thank-you lead */
export const APPLICATION_THANKS_TARGETS = [
  "applying",
  "your application",
  "your interest",
] as const;

/** Interest leads in recruiter outreach */
export const OUTREACH_INTEREST_LEADS = ["open to", "interested in"] as const;

/** Optional modifiers between an interest lead and the target */
export const OUTREACH_INTEREST_MODIFIERS = ["a new", "new", "exploring"] as const;

/** Targets that complete an interest outreach line */
export const OUTREACH_INTEREST_TARGETS = [
  "role",
  "roles",
  "opportunit",
  "chat",
  "discussing",
  "position",
] as const;

/** Openers for a short recruiter meeting ask */
export const OUTREACH_MEETING_OPENERS = ["intro", "exploratory", "quick"] as const;

/** Meeting types that follow an outreach opener */
export const OUTREACH_MEETING_TYPES = [
  "call",
  "chat",
  "screen",
  "conversation",
] as const;

/**
 * Core job stem vocabulary for stemming matches.
 * Board names stay in JOB_BOARD_KEYWORDS and are combined at match time.
 */
export const CORE_HIRING_STEMS = [
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
  "assessment",
  "evaluat",
  "test",
  "screen",
  "onsite",
  "recruiter",
  "headhunt",
  "gig",
] as const;

/** Stem synonym equivalence mapping used by the prefilter expander */
export const HIRING_STEM_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
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
  assess: ["assessment", "evaluation", "questionnaire", "screen", "test"],
};

/** Keywords/brand names for subject line and stem matching */
export const JOB_BOARD_KEYWORDS = [
  "linkedin",
  "indeed",
  "glassdoor",
  "ziprecruiter",
  "handshake",
  "jobleads",
  "careerbuilder",
  "snagajob",
  "monster",
  "wellfound",
  "dice",
  "workday",
  "greenhouse",
  "lever",
] as const;

/** Major job board and aggregator domains (universal + specialized) */
export const UNIVERSAL_JOB_BOARD_DOMAINS = [
  "linkedin.com",
  "indeed.com",
  "glassdoor.com",
  "ziprecruiter.com",
  "joinhandshake.com",
  "handshake.com",
  "jobleads.com",
  "careerbuilder.com",
  "monster.com",
  "snagajob.com",
  "wellfound.com",
  "dice.com",
] as const;

/** Enterprise ATS sender domains */
export const ENTERPRISE_ATS_DOMAINS = [
  "greenhouse.io",
  "lever.co",
  "workday.com",
  "myworkdayjobs.com",
  "ashbyhq.com",
  "smartrecruiters.com",
  "icims.com",
  "jobvite.com",
  "bamboohr.com",
  "rippling.com",
  "workable.com",
  "breezy.hr",
] as const;

/** Mailbox prefixes plus board and ATS domains that mark digest senders */
export const DIGEST_SENDER_HINTS = [
  ...AUTOMATED_MAILBOX_PREFIXES,
  ...UNIVERSAL_JOB_BOARD_DOMAINS,
  ...ENTERPRISE_ATS_DOMAINS,
] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Matches a job-board domain mentioned in a message. */
export const JOB_BOARD_DOMAIN_PATTERN = new RegExp(
  `(?:${UNIVERSAL_JOB_BOARD_DOMAINS.map(escapeRegExp).join("|")})`,
  "i"
);

/** Matches an ATS domain mentioned in a message. */
export const ATS_DOMAIN_PATTERN = new RegExp(
  `(?:${ENTERPRISE_ATS_DOMAINS.map(escapeRegExp).join("|")})`,
  "i"
);

function boundedPhrasePattern(phrases: readonly string[]): RegExp {
  return new RegExp(
    `\\b(?:${phrases.map(escapeRegExp).join("|")})\\b`,
    "i"
  );
}

export const JOB_OPPORTUNITY_NOUN_PATTERN = boundedPhrasePattern(
  JOB_OPPORTUNITY_NOUNS
);

export const OPPORTUNITY_STEM_PATTERN = new RegExp(OPPORTUNITY_STEM, "i");

/** Covers "we're hiring", "were hiring", "we are hiring", "now hiring", and "join our/the team". */
export const HIRING_ANNOUNCEMENT_PATTERN =
  /\b(?:we'?re hiring|we are hiring|now hiring|join (?:our|the) team)\b/i;

export const OUTREACH_PHRASE_PATTERN = boundedPhrasePattern(OUTREACH_PHRASES);

export const OUTREACH_INTEREST_PATTERN = new RegExp(
  `\\b(?:${OUTREACH_INTEREST_LEADS.map(escapeRegExp).join("|")})\\s+(?:${OUTREACH_INTEREST_MODIFIERS.map(escapeRegExp).join("|")})?\\s*(?:${OUTREACH_INTEREST_TARGETS.map(escapeRegExp).join("|")})`,
  "i"
);

export const RECRUITER_TITLE_PATTERN = boundedPhrasePattern(RECRUITER_TITLES);

export const OUTREACH_MEETING_PATTERN = new RegExp(
  `\\b(?:${OUTREACH_MEETING_OPENERS.join("|")})\\s+(?:${OUTREACH_MEETING_TYPES.join("|")})\\b`,
  "i"
);

export const APPLICATION_ACTOR_PATTERN = boundedPhrasePattern(
  APPLICATION_ACTOR_TERMS
);

export const APPLICATION_THANKS_PATTERN = new RegExp(
  `\\b(?:${APPLICATION_THANKS_LEADS.map(escapeRegExp).join("|")})\\s+(?:${APPLICATION_THANKS_TARGETS.map(escapeRegExp).join("|")})\\b`,
  "i"
);

export const APPLICATION_STATUS_UPDATE_PATTERN = new RegExp(
  `\\b(?:application\\s+(?:${APPLICATION_STATUS_WORDS.join("|")}))\\b`,
  "i"
);

export const LIFECYCLE_STATUS_PATTERN = boundedPhrasePattern(
  LIFECYCLE_STATUS_TERMS
);

/** LinkedIn / ATS confirmation: "your application was sent to Acme". Capture group is the employer. */
export const APPLICATION_SENT_TO_RE =
  /(?:your\s+)?application\s+(?:was\s+|has\s+been\s+)?sent\s+to\s+(.+?)(?:\s*[-–|·]|$)/i;

/**
 * Applied, submitted, and thank-you confirmation signals.
 * Covers "you applied", "application was sent", status lines, and
 * "thank you for applying" / "thank you for your application".
 */
export const APPLIED_SIGNAL_RE =
  /\b(?:you\s+applied|applied\s+on\b|application\s+(?:submitted|sent|received|viewed|confirmed)|status\s*:\s*applied|application\s+status\s*:\s*applied|thank you for (?:your )?(?:applying|application)|thanks for (?:your )?(?:applying|application)|(?:your\s+)?application\s+(?:was\s+|has\s+been\s+)?sent(?:\s+to)?)\b/i;

/** Employer capture plus the broader applied-signal pattern. */
export const CONFIRMATION_SIGNAL_PATTERNS = [
  APPLICATION_SENT_TO_RE,
  APPLIED_SIGNAL_RE,
] as const;

export function matchesConfirmationSignal(text: string): boolean {
  return CONFIRMATION_SIGNAL_PATTERNS.some((pattern) => pattern.test(text));
}

export interface JobSearchQueryOptions {
  days?: number;
  excludeTrashAndSpam?: boolean;
}

export const KNOWN_JOB_DOMAINS_SET = new Set<string>([
  ...UNIVERSAL_JOB_BOARD_DOMAINS,
  ...ENTERPRISE_ATS_DOMAINS,
]);

export function isKnownJobDomain(hostnameOrUrl: string): boolean {
  const lower = hostnameOrUrl.toLowerCase();
  return Array.from(KNOWN_JOB_DOMAINS_SET).some((domain) =>
    lower.includes(domain)
  );
}

/**
 * Builds the canonical Gmail search query for scanning job-related emails.
 */
export function buildJobSearchQuery(options: JobSearchQueryOptions = {}): string {
  const { days, excludeTrashAndSpam } = options;

  const subjectTokens = [
    ...LIFECYCLE_SUBJECT_KEYWORDS,
    ...DIGEST_SUBJECT_PHRASES,
    ...JOB_BOARD_KEYWORDS,
  ].join(" OR ");

  const confirmations = CONFIRMATION_EXACT_PHRASES.join(" OR ");

  const senderDomains = [
    ...UNIVERSAL_JOB_BOARD_DOMAINS,
    ...ENTERPRISE_ATS_DOMAINS,
  ].join(" OR ");

  const base = `(subject:(${subjectTokens}) OR ${confirmations} OR from:(${senderDomains}))`;
  const prefix = typeof days === "number" ? `newer_than:${days}d ` : "";
  const suffix = excludeTrashAndSpam ? " -in:trash -in:spam" : "";

  return `${prefix}${base}${suffix}`;
}

export function buildHistoricalJobSearchQuery(days: number): string {
  return buildJobSearchQuery({ days });
}
