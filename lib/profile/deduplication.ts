import { randomUUID } from "crypto";
import {
  detectMetric,
  type AwardItem,
  type BulletTypology,
  type BulletVariant,
  type CertificationItem,
  type EducationInput,
  type ProjectInput,
  type WorkExperienceInput,
} from "@/lib/validations/profile";
import {
  cleanProjectUrl,
  getProjectBaseName,
  normalizeProjectName,
  sanitizeBulletText,
} from "@/lib/utils/format";
import {
  areDatePointsCompatible,
  areDateRangesCompatible,
  normalizeDateString,
  resolveGranularDate,
} from "@/lib/utils/date";

export const MAX_PRIMARY_PROJECT_BULLETS = 15;
export const MAX_PRIMARY_EXPERIENCE_BULLETS = 15;

const UNIVERSAL_STOPWORDS = new Set([
  "the", "and", "with", "for", "from", "that", "this", "into", "across",
  "using", "their", "them", "line", "word", "users", "each",
  "which", "then", "per", "via", "under", "over", "allow", "allowing",
  "ensure", "ensuring", "tools", "such", "application", "system", "platform"
]);

/** Normalizes a string down to lowercase alphanumeric characters. */
export function normalizeString(str: string | null | undefined): string {
  if (!str) return "";
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Extracts substantive non-stopword tokens of length > 2. */
export function tokenizeThematicWords(text: string | null | undefined): Set<string> {
  if (!text) return new Set();
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !UNIVERSAL_STOPWORDS.has(w))
  );
}

/** Computes standard Jaccard token overlap between two sets. */
export function calculateJaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const item of setB) {
    if (setA.has(item)) shared++;
  }
  const unionSize = setA.size + setB.size - shared;
  return unionSize > 0 ? shared / unionSize : 0;
}

/** Computes Szymkiewicz–Simpson overlap (containment) coefficient. */
export function calculateOverlapCoefficient(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const item of setB) {
    if (setA.has(item)) shared++;
  }
  const minSize = Math.min(setA.size, setB.size);
  return minSize > 0 ? shared / minSize : 0;
}

/** Checks whether two bullets describe the same subsystem or task (overlap >= 50%). */
export function hasThematicOverlap(
  bulletA: string | null | undefined,
  bulletB: string | null | undefined,
  threshold = 0.5
): boolean {
  if (!bulletA || !bulletB) return false;
  const tokensA = tokenizeThematicWords(bulletA);
  const tokensB = tokenizeThematicWords(bulletB);
  if (tokensA.size === 0 || tokensB.size === 0) return false;

  let shared = 0;
  for (const t of tokensB) {
    if (tokensA.has(t)) shared++;
  }
  const minSize = Math.min(tokensA.size, tokensB.size);
  return minSize > 0 && shared / minSize >= threshold;
}

/** Generic organizational / institutional nouns that should not by themselves confirm a match. */
export const GENERIC_ORG_TOKENS = new Set([
  "inc", "incorporated", "llc", "ltd", "corp", "corporation", "co", "company",
  "university", "college", "school", "institute", "institution", "academy",
  "department", "division", "foundation", "hospital", "center", "centre",
  "group", "services", "system", "systems", "team", "technologies",
  "technology", "association", "lab", "labs", "laboratory", "club", "society"
]);

const PREPOSITION_CONJUNCTION_STOPWORDS = new Set([
  "of", "in", "at", "on", "by", "for", "from", "with", "and", "the", "a", "an", "to"
]);

/**
 * Extracts substantive entity tokens and generates acronyms/initialisms for multi-word phrases.
 * Universal and career-agnostic: generates acronyms mathematically from words without hardcoding.
 */
export function tokenizeEntityWords(text: string | null | undefined): {
  words: string[];
  allTokens: Set<string>;
  distinctiveTokens: Set<string>;
  acronyms: Set<string>;
} {
  const allTokens = new Set<string>();
  const distinctiveTokens = new Set<string>();
  const acronyms = new Set<string>();

  if (!text) return { words: [], allTokens, distinctiveTokens, acronyms };

  // Strip possessives and punctuation, then split into words
  const words = text
    .toLowerCase()
    .replace(/'s\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !PREPOSITION_CONJUNCTION_STOPWORDS.has(w) && !UNIVERSAL_STOPWORDS.has(w));

  for (const w of words) {
    if (w.length > 1) {
      allTokens.add(w);
      if (!GENERIC_ORG_TOKENS.has(w)) {
        distinctiveTokens.add(w);
      }
    }
  }

  // Generate initialisms from multi-word sequences (e.g. "United States Navy" -> "usn", "us")
  if (words.length >= 2) {
    const fullAcronym = words.map((w) => w[0]).join("");
    if (fullAcronym.length >= 2 && fullAcronym.length <= 6) {
      acronyms.add(fullAcronym);
      allTokens.add(fullAcronym);
    }

    // Leading 2-word geographic/organizational prefix acronym (e.g. "united states" in "united states navy" -> "us")
    if (words.length >= 3) {
      const prefixAcronym = words.slice(0, 2).map((w) => w[0]).join("");
      if (prefixAcronym.length >= 2) {
        acronyms.add(prefixAcronym);
        allTokens.add(prefixAcronym);
      }
    }
  }

  return { words, allTokens, distinctiveTokens, acronyms };
}

const LEGAL_SUFFIX_RE =
  /,?\s*\b(inc(?:orporated)?|llc|ltd|corp(?:oration)?|gmbh|co|llp|plc|p\.?c\.?)\b\.?$/i;

export function stripLegalSuffixes(company: string | null | undefined): string {
  if (!company) return "";
  return company.replace(LEGAL_SUFFIX_RE, "").trim();
}

/**
 * Computes career-agnostic similarity between two entity names (companies, institutions, issuers).
 * Evaluates exact match, substring inclusion, token containment, and acronym overlap.
 */
export function calculateEntitySimilarity(
  nameA: string | null | undefined,
  nameB: string | null | undefined
): {
  score: number;
  isMatch: boolean;
  overlap: number;
  jaccard: number;
} {
  if (!nameA || !nameB) {
    return { score: 0, isMatch: false, overlap: 0, jaccard: 0 };
  }

  const cleanA = stripLegalSuffixes(nameA);
  const cleanB = stripLegalSuffixes(nameB);
  const normA = normalizeString(cleanA);
  const normB = normalizeString(cleanB);

  // Exact normalized match
  if (normA && normB && normA === normB) {
    return { score: 1.0, isMatch: true, overlap: 1.0, jaccard: 1.0 };
  }

  // Contiguous substring match for long entity names (length >= 5)
  if (normA && normB && normA.length >= 5 && normB.length >= 5) {
    if (normA.includes(normB) || normB.includes(normA)) {
      return { score: 0.95, isMatch: true, overlap: 0.95, jaccard: 0.95 };
    }
  }

  const entityA = tokenizeEntityWords(cleanA);
  const entityB = tokenizeEntityWords(cleanB);

  // Distinctive word overlap
  let sharedDistinctive = 0;
  for (const w of entityB.distinctiveTokens) {
    if (entityA.distinctiveTokens.has(w)) sharedDistinctive++;
  }
  const minDistinctive = Math.min(entityA.distinctiveTokens.size, entityB.distinctiveTokens.size);
  const distinctiveOverlap = minDistinctive > 0 ? sharedDistinctive / minDistinctive : 0;
  const jaccard = calculateJaccardSimilarity(entityA.distinctiveTokens, entityB.distinctiveTokens);

  // Acronym link check
  let hasAcronymLink = false;
  for (const ac of entityB.acronyms) {
    if (entityA.words.includes(ac) || normA === ac) {
      hasAcronymLink = true;
      break;
    }
  }
  if (!hasAcronymLink) {
    for (const ac of entityA.acronyms) {
      if (entityB.words.includes(ac) || normB === ac) {
        hasAcronymLink = true;
        break;
      }
    }
  }

  // Check for conflicting distinctive words (e.g. Navy vs Army)
  const unsharedA = Array.from(entityA.distinctiveTokens).filter(
    (w) => !entityB.distinctiveTokens.has(w) && !entityB.acronyms.has(w)
  );
  const unsharedB = Array.from(entityB.distinctiveTokens).filter(
    (w) => !entityA.distinctiveTokens.has(w) && !entityA.acronyms.has(w)
  );
  const hasWordConflict = unsharedA.length > 0 && unsharedB.length > 0;

  // Acronym matching branch
  if (hasAcronymLink && !hasWordConflict) {
    return { score: 0.85, isMatch: true, overlap: 1.0, jaccard: Math.max(jaccard, 0.5) };
  }

  // High substantive token overlap without conflict
  if (distinctiveOverlap >= 0.70 && minDistinctive >= 1 && !hasWordConflict) {
    return { score: Math.max(jaccard, distinctiveOverlap * 0.85), isMatch: true, overlap: distinctiveOverlap, jaccard };
  }

  return { score: Math.max(jaccard, distinctiveOverlap * 0.5), isMatch: false, overlap: distinctiveOverlap, jaccard };
}

/* -------------------------------------------------------------------------
 * 1. 8-Dimension Universal Typology Classifier (100% Career Agnostic)
 * ------------------------------------------------------------------------- */

const TYPOLOGY_PATTERNS: Record<Exclude<BulletTypology, "METRIC_QUANTITATIVE">, RegExp> = {
  INNOVATION_PRODUCT_OWNERSHIP:
    /\b(?:pioneer(?:ed|ing|s)?|architect(?:ed|ing|s)?|found(?:ed|ing|er)?|launch(?:ed|ing|es)?|conceptualiz(?:ed|ing|es)?|prototyp(?:ed|ing|es)?|patent(?:ed|ing|s)?|originat(?:ed|ing|es)?|invent(?:ed|ing|s)?|conceived?|devised?|bootstrapp(?:ed|ing))\b/i,
  LEADERSHIP_COORDINATION:
    /\b(?:spearhead(?:ed|ing|s)?|lead(?:ing)?|led|guid(?:ed|ing|es)?|mentor(?:ed|ing|s)?|supervis(?:ed|ing|es)?|direct(?:ed|ing|s)?|manag(?:ed|ing|es)?|coordinat(?:ed|ing|es)?|delegat(?:ed|ing|es)?|chair(?:ed|ing|s)?|head(?:ed|ing)?|oversaw|oversee(?:ing|s)?|recruit(?:ed|ing|s)?|train(?:ed|ing|s)?|champion(?:ed|ing|s)?|orchestrat(?:ed|ing|es|ion)?|cross-?functional)\b/i,
  PROCESS_OPTIMIZATION:
    /\b(?:streamlin(?:ed|ing|es)?|overhaul(?:ed|ing|s)?|standardiz(?:ed|ing|es)?|accelerat(?:ed|ing|es)?|consolidat(?:ed|ing|es)?|refactor(?:ed|ing|es)?|moderniz(?:ed|ing|es)?|automat(?:ed|ing|es)?|bottleneck|reduc(?:ed|ing|es)?\s+\w*\s*(?:latency|overhead|waste|cost|time|errors?)|optimiz(?:ed|ing|es)?)\b/i,
  RESEARCH_ANALYSIS:
    /\b(?:evaluat(?:ed|ing|es)?|audit(?:ed|ing|s)?|benchmark(?:ed|ing|s)?|analyz(?:ed|ing|es)?|investigat(?:ed|ing|es)?|formulat(?:ed|ing|es)?|diagnos(?:ed|ing|es)?|modeled?|modeling|forecast(?:ed|ing|s)?|synthesiz(?:ed|ing|es)?|assessed?|assessing)\b/i,
  GOVERNANCE_COMPLIANCE_QUALITY:
    /\b(?:complian(?:ce|t)|secur(?:ed|ing|ity)|harden(?:ed|ing|s)?|enforc(?:ed|ing|es)?|hipaa|soc-?2|osha|gdpr|safet(?:y|guard)|risk|mitigat(?:ed|ing|es)?|cryptograph(?:ic|y)?|authoriz(?:ed|ing|ation)|authenticat(?:ed|ing|ion)|qa|qualit\w*\s+assur(?:ance)?|guardrails?|unit\s*test(?:ed|ing|s)?)\b/i,
  CLIENT_STAKEHOLDER:
    /\b(?:client(?:s)?|stakeholder(?:s)?|partner(?:ed|ing|s)?|patient(?:s)?|survivor(?:s)?|customer(?:s)?|advoca(?:cy|te|ted|ting)|negotiat(?:ed|ing|es)?|vendor(?:s)?|present(?:ed|ing|s)?\s+to|board\s+(?:of\s+directors|members)|liaison)\b/i,
  EXECUTION_DELIVERY:
    /\b(?:engineer(?:ed|ing|s)?|develop(?:ed|ing|s)?|construct(?:ed|ing|s)?|author(?:ed|ing|s)?|implement(?:ed|ing|es)?|build(?:ing|s)?|built|execut(?:ed|ing|es)?|program(?:med|ming|s)?|deploy(?:ed|ing|s)?|deliver(?:ed|ing|s)?|maintain(?:ed|ing|s)?|integrat(?:ed|ing|es)?|configured?|configuring|crafted?)\b/i,
};

/**
 * Classifies a bullet into 1-3 universal functional typologies.
 * Guaranteed to return at least one typology tag (falls back safely to EXECUTION_DELIVERY).
 */
export function classifyBulletTypologies(text: string | null | undefined): BulletTypology[] {
  if (!text || !text.trim()) {
    return ["EXECUTION_DELIVERY"];
  }

  const results: BulletTypology[] = [];

  // 1. Metric / Quantitative check
  if (detectMetric(text)) {
    results.push("METRIC_QUANTITATIVE");
  }

  // 2. Specialized Functional Archetypes
  for (const [typology, pattern] of Object.entries(TYPOLOGY_PATTERNS) as [
    Exclude<BulletTypology, "METRIC_QUANTITATIVE">,
    RegExp
  ][]) {
    if (typology === "EXECUTION_DELIVERY") continue;
    if (pattern.test(text)) {
      results.push(typology);
    }
  }

  // 3. Execution Delivery or Baseline Fallback
  if (results.length === 0 || TYPOLOGY_PATTERNS.EXECUTION_DELIVERY.test(text)) {
    results.push("EXECUTION_DELIVERY");
  }

  // Cap at 3 multi-tags, preserving unique tags
  return Array.from(new Set(results)).slice(0, 3);
}

/* -------------------------------------------------------------------------
 * 2. Title Weight & Polish Scorer
 * ------------------------------------------------------------------------- */

export function calculateTitleWeight(
  title: string | null | undefined,
  options?: {
    origin?: string;
    description?: string;
  }
): { score: number; normalizedTitle: string } {
  if (!title || !title.trim()) {
    return { score: 0, normalizedTitle: "" };
  }

  const normalizedTitle = normalizeProjectName(title);
  let score = 1.0;

  // Subtitle delimiter detection (e.g. "SafeHaven – Disguised Domestic Violence Platform")
  const subtitleMatch = normalizedTitle.match(/\s*[-–—:|]\s*(.+)$/);
  if (subtitleMatch && subtitleMatch[1]) {
    const subtitleWords = subtitleMatch[1].trim().split(/\s+/).filter((w) => w.length > 2);
    if (subtitleWords.length >= 2 && subtitleMatch[1].trim().length >= 6) {
      score += 3.0;
    }
  }

  // Clean title casing bonus (avoiding all-lowercase or snake/kebab slugs)
  const isAllLower = normalizedTitle === normalizedTitle.toLowerCase();
  const isSlug = /^[a-z0-9_-]+$/.test(normalizedTitle);
  if (!isAllLower && !isSlug && /^[A-Z]/.test(normalizedTitle)) {
    score += 2.0;
  }

  // Human verified anchor bonus
  if (options?.origin === "HUMAN_VERIFIED") {
    score += 1.0;
  }

  // Supportive rich repository/project description bonus
  if (options?.description && options.description.trim().length >= 20) {
    score += 1.5;
  }

  // Penalties for technical noise and file extensions
  if (/\b[a-z0-9_.-]+\/[a-z0-9_.-]+\b/i.test(normalizedTitle)) {
    score -= 3.0; // Raw repo slug like user/repo
  }
  if (/\.(?:py|tsx?|jsx?|ipynb|git|md|json)\b/i.test(normalizedTitle)) {
    score -= 3.0; // Leaked file extension
  }
  if (/\b(?:final|v\d+|temp|tmp|homework|hw|assignment|scratch|test|submission)\b/i.test(normalizedTitle)) {
    score -= 2.0; // Submission or temporary noise
  }

  return { score, normalizedTitle };
}

/**
 * Compares two titles and resolves the title with higher descriptive weight.
 */
export function resolveBestProjectTitle(
  titleA: string,
  titleB: string,
  optionsA?: { origin?: string; description?: string },
  optionsB?: { origin?: string; description?: string }
): string {
  const weightedA = calculateTitleWeight(titleA, optionsA);
  const weightedB = calculateTitleWeight(titleB, optionsB);

  const diff = weightedA.score - weightedB.score;
  if (Math.abs(diff) >= 0.5) {
    return diff > 0 ? weightedA.normalizedTitle : weightedB.normalizedTitle;
  }

  // Tie-breakers:
  // 1. Prefer human-verified origin
  if (optionsA?.origin === "HUMAN_VERIFIED" && optionsB?.origin !== "HUMAN_VERIFIED") {
    return weightedA.normalizedTitle;
  }
  if (optionsB?.origin === "HUMAN_VERIFIED" && optionsA?.origin !== "HUMAN_VERIFIED") {
    return weightedB.normalizedTitle;
  }

  // 2. Prefer more descriptive non-noise length
  return weightedA.normalizedTitle.length >= weightedB.normalizedTitle.length
    ? weightedA.normalizedTitle
    : weightedB.normalizedTitle;
}

/* -------------------------------------------------------------------------
 * 3. 4-Signal Project Similarity Engine ($S \in [0.0, 1.0]$)
 * ------------------------------------------------------------------------- */

export function calculateProjectSimilarity(
  a: Partial<ProjectInput> & { name: string },
  b: Partial<ProjectInput> & { name: string }
): { score: number; isMatch: boolean; reason: string } {
  let score = 0;
  const reasons: string[] = [];

  // Signal 1: Repository / URL Identity
  const urlA = a.link ? cleanProjectUrl(a.link).toLowerCase() : "";
  const urlB = b.link ? cleanProjectUrl(b.link).toLowerCase() : "";
  const urlMatch = Boolean(urlA && urlB && urlA === urlB);
  if (urlMatch) {
    score += 0.50;
    reasons.push("Exact repo URL match");
  }

  // Signal 2: Base Name & Root Prefix Identity
  const baseA = normalizeString(getProjectBaseName(a.name));
  const baseB = normalizeString(getProjectBaseName(b.name));
  const baseMatch = Boolean(baseA && baseB && baseA === baseB && baseA.length >= 3);
  let basePrefixMatch = false;
  if (baseMatch) {
    score += 0.50;
    reasons.push(`Base name match (${baseA})`);
  } else if (baseA && baseB && baseA.length >= 4 && baseB.length >= 4) {
    if (baseA.startsWith(baseB) || baseB.startsWith(baseA)) {
      basePrefixMatch = true;
      score += 0.40;
      reasons.push(`Base name root prefix match (${baseA.slice(0, 8)})`);
    }
  }

  // Exact full name match
  const nameNormA = normalizeString(a.name);
  const nameNormB = normalizeString(b.name);
  if (nameNormA && nameNormB && nameNormA === nameNormB) {
    score += 0.50;
    reasons.push("Exact normalized name match");
  }

  // Signal 3: Substantive Name Token Overlap (Jaccard + Szymkiewicz–Simpson Containment)
  const tokensA = tokenizeThematicWords(a.name);
  const tokensB = tokenizeThematicWords(b.name);
  const tokenJaccard = calculateJaccardSimilarity(tokensA, tokensB);
  const tokenOverlap = calculateOverlapCoefficient(tokensA, tokensB);
  const compositeTokenScore = Math.max(tokenJaccard, tokenOverlap * 0.85);

  if (compositeTokenScore > 0) {
    score += compositeTokenScore * 0.35;
    reasons.push(`Token similarity (${(compositeTokenScore * 100).toFixed(0)}%)`);
  }

  // Leading distinct token anchor check (first non-stopword word)
  const firstWordA = Array.from(tokensA)[0];
  const firstWordB = Array.from(tokensB)[0];
  const leadingRootMatch = Boolean(
    firstWordA && firstWordB && firstWordA === firstWordB && firstWordA.length >= 4
  );
  if (leadingRootMatch && !baseMatch && score < 0.85) {
    score += 0.25;
    reasons.push(`Leading anchor token match (${firstWordA})`);
  }

  // Signal 4: Technology Stack Affinity & Contradiction Penalty
  const techA = new Set((a.technologies || []).map((t) => normalizeString(t)).filter(Boolean));
  const techB = new Set((b.technologies || []).map((t) => normalizeString(t)).filter(Boolean));
  let hasStackContradiction = false;
  if (techA.size > 0 && techB.size > 0) {
    const techJaccard = calculateJaccardSimilarity(techA, techB);
    if (techJaccard > 0) {
      score += techJaccard * 0.20;
      reasons.push(`Stack overlap (${(techJaccard * 100).toFixed(0)}%)`);
    } else if (techA.size >= 2 && techB.size >= 2) {
      // Both list distinct technical stacks without any overlap
      score -= 0.35;
      hasStackContradiction = true;
      reasons.push("Disjoint stack contradiction penalty");
    }
  }

  // Subsystem Bullet Probe for Borderline / Probable Matches
  const hasSharedNameToken =
    tokenJaccard > 0 ||
    tokenOverlap > 0 ||
    (tokensA.size > 0 && Array.from(tokensB).some((t) => tokensA.has(t)));
  if ((score >= 0.20 || hasSharedNameToken) && score < 0.65) {
    let sharedSubsystem = false;
    for (const bA of a.bullets || []) {
      for (const bB of b.bullets || []) {
        if (hasThematicOverlap(bA, bB, 0.40)) {
          sharedSubsystem = true;
          break;
        }
      }
      if (sharedSubsystem) break;
    }
    if (sharedSubsystem) {
      score += 0.45;
      reasons.push("Subsystem bullet probe confirmed match");
    }
  }

  const isMatch =
    !hasStackContradiction &&
    (score >= 0.50 ||
      (baseMatch && score >= 0.40) ||
      (basePrefixMatch && score >= 0.45) ||
      (leadingRootMatch && tokenOverlap >= 0.50) ||
      (urlMatch && (baseMatch || score >= 0.40)));
  return {
    score: Math.max(0, Math.min(1.0, score)),
    isMatch,
    reason: reasons.join("; ") || "Insufficient similarity",
  };
}

/* -------------------------------------------------------------------------
 * 4. Bullet Information Density Evaluator
 * ------------------------------------------------------------------------- */

export function computeBulletDensity(bullet: string): number {
  if (!bullet) return 0;
  let density = 0;
  if (detectMetric(bullet)) density += 3.0;

  const words = bullet.trim().split(/\s+/).filter(Boolean);
  density += Math.min(3.0, words.length / 8);

  const typologies = classifyBulletTypologies(bullet);
  density += typologies.length * 0.5;

  return density;
}

/* -------------------------------------------------------------------------
 * 5. Project Bullet & Variant Reconciliation
 * ------------------------------------------------------------------------- */

export function reconcileProjectBullets(
  primaryBullets: string[],
  incomingBullets: string[],
  primaryVariants: BulletVariant[] = [],
  incomingVariants: BulletVariant[] = [],
  primaryOrigin?: string,
  incomingOrigin?: string,
  primaryBulletOrigins?: Record<string, string>,
  incomingBulletOrigins?: Record<string, string>
): {
  bullets: string[];
  variants: BulletVariant[];
  bulletOrigins: Record<string, string>;
} {
  const getBulletOrigin = (
    bullet: string,
    explicitOrigins?: Record<string, string>,
    fallbackOrigin?: string
  ): "HUMAN_VERIFIED" | "GITHUB_INFERRED" => {
    const found = explicitOrigins?.[bullet];
    if (found === "GITHUB_INFERRED" || found === "HUMAN_VERIFIED") {
      return found;
    }
    return fallbackOrigin === "GITHUB_INFERRED" ? "GITHUB_INFERRED" : "HUMAN_VERIFIED";
  };

  const isPrimaryAllInferred =
    primaryOrigin === "GITHUB_INFERRED" &&
    primaryBullets.every(
      (b) => getBulletOrigin(b, primaryBulletOrigins, primaryOrigin) === "GITHUB_INFERRED"
    );

  const isIncomingAllInferred =
    incomingOrigin === "GITHUB_INFERRED" &&
    incomingBullets.every(
      (b) => getBulletOrigin(b, incomingBulletOrigins, incomingOrigin) === "GITHUB_INFERRED"
    );

  // Case 1: Pure GitHub-to-GitHub re-sync. Refresh bullets cleanly to prevent infinite bloat.
  if (isPrimaryAllInferred && isIncomingAllInferred && incomingBullets.length > 0) {
    const refreshedBullets = incomingBullets.slice(0, MAX_PRIMARY_PROJECT_BULLETS);
    const refreshedOrigins: Record<string, string> = {};
    for (const b of refreshedBullets) {
      refreshedOrigins[b] = "GITHUB_INFERRED";
    }
    return {
      bullets: refreshedBullets,
      variants: [...primaryVariants, ...incomingVariants],
      bulletOrigins: refreshedOrigins,
    };
  }

  // General Case: Unified Bullet-level reconciliation
  // Preserves human-verified primary bullets verbatim, attaches overlapping inferred
  // bullets as companion variants with dynamic Szymkiewicz–Simpson confidence scores,
  // and adds non-overlapping distinct capabilities as additive primary bullets up to 15.
  const resultBullets: string[] = [...primaryBullets];
  const resultVariants: BulletVariant[] = [...primaryVariants, ...incomingVariants];
  const resultOrigins: Record<string, string> = { ...(primaryBulletOrigins || {}) };

  for (const b of primaryBullets) {
    if (typeof b === "string" && b && !resultOrigins[b]) {
      resultOrigins[b] = getBulletOrigin(b, primaryBulletOrigins, primaryOrigin);
    }
  }

  for (const incBullet of incomingBullets) {
    const trimmedInc = incBullet.trim();
    if (!trimmedInc) continue;

    const incOrigin = getBulletOrigin(trimmedInc, incomingBulletOrigins, incomingOrigin);

    // 1. Exact string duplicate check
    const exactIndex = resultBullets.findIndex(
      (b) => normalizeString(b) === normalizeString(trimmedInc)
    );
    if (exactIndex >= 0) {
      const existingExact = resultBullets[exactIndex]!;
      if (incOrigin === "HUMAN_VERIFIED" && resultOrigins[existingExact] !== "HUMAN_VERIFIED") {
        resultOrigins[existingExact] = "HUMAN_VERIFIED";
      }
      continue;
    }

    // Check if duplicate of an existing variant
    const isVariantExact = resultVariants.some(
      (v) => normalizeString(v.text) === normalizeString(trimmedInc)
    );
    if (isVariantExact) continue;

    // 2. Thematic overlap check: find best matching anchor among primary bullets
    let overlappingIndex = -1;
    let highestOverlap = 0;
    const incTokens = tokenizeThematicWords(trimmedInc);

    for (let i = 0; i < resultBullets.length; i++) {
      const bTokens = tokenizeThematicWords(resultBullets[i]!);
      const ov = calculateOverlapCoefficient(bTokens, incTokens);
      if (ov >= 0.50 && ov > highestOverlap) {
        highestOverlap = ov;
        overlappingIndex = i;
      }
    }

    if (overlappingIndex >= 0) {
      const existingAnchor = resultBullets[overlappingIndex]!;
      const anchorOrigin =
        resultOrigins[existingAnchor] ||
        getBulletOrigin(existingAnchor, primaryBulletOrigins, primaryOrigin);

      const dynamicScore = Math.min(1.0, Math.max(0.50, Number(highestOverlap.toFixed(2))));

      // Case A: Both human-verified
      if (anchorOrigin === "HUMAN_VERIFIED" && incOrigin === "HUMAN_VERIFIED") {
        if (highestOverlap >= 0.60) {
          resultBullets[overlappingIndex] = trimmedInc;
          resultOrigins[trimmedInc] = "HUMAN_VERIFIED";
          delete resultOrigins[existingAnchor];

          for (const v of resultVariants) {
            if (v.shadowOf === existingAnchor) {
              v.shadowOf = trimmedInc;
            }
          }

          resultVariants.push({
            id: `rev-human-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            text: existingAnchor,
            origin: "HUMAN_VERIFIED",
            typologies: classifyBulletTypologies(existingAnchor),
            confidenceScore: 1.0,
            shadowOf: trimmedInc,
            supersededAt: new Date().toISOString(),
            status: "ARCHIVED_REVISION",
          });
        } else {
          if (resultBullets.length < MAX_PRIMARY_PROJECT_BULLETS) {
            resultBullets.push(trimmedInc);
            resultOrigins[trimmedInc] = "HUMAN_VERIFIED";
          } else {
            resultVariants.push({
              id: `var-prim-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              text: trimmedInc,
              origin: "HUMAN_VERIFIED",
              typologies: classifyBulletTypologies(trimmedInc),
              confidenceScore: 1.0,
              status: "ACTIVE_VARIANT",
            });
          }
        }
      }
      // Case B: Existing human, incoming inferred -> human stays primary!
      else if (anchorOrigin === "HUMAN_VERIFIED" && incOrigin === "GITHUB_INFERRED") {
        resultVariants.push({
          id: `var-inf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          text: trimmedInc,
          origin: "GITHUB_INFERRED",
          typologies: classifyBulletTypologies(trimmedInc),
          confidenceScore: dynamicScore,
          shadowOf: existingAnchor,
          status: "ACTIVE_VARIANT",
        });
      }
      // Case C: Existing inferred, incoming human -> human displaces inferred!
      else if (anchorOrigin === "GITHUB_INFERRED" && incOrigin === "HUMAN_VERIFIED") {
        resultBullets[overlappingIndex] = trimmedInc;
        resultOrigins[trimmedInc] = "HUMAN_VERIFIED";
        delete resultOrigins[existingAnchor];

        for (const v of resultVariants) {
          if (v.shadowOf === existingAnchor) {
            v.shadowOf = trimmedInc;
          }
        }

        resultVariants.push({
          id: `var-inf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          text: existingAnchor,
          origin: "GITHUB_INFERRED",
          typologies: classifyBulletTypologies(existingAnchor),
          confidenceScore: dynamicScore,
          shadowOf: trimmedInc,
          status: "ACTIVE_VARIANT",
        });
      }
      // Case D: Both inferred
      else {
        const existingDensity = computeBulletDensity(existingAnchor);
        const incDensity = computeBulletDensity(trimmedInc);
        const incIsBetter =
          incDensity > existingDensity ||
          (incDensity === existingDensity && trimmedInc.length > existingAnchor.length);

        if (incIsBetter) {
          resultBullets[overlappingIndex] = trimmedInc;
          resultOrigins[trimmedInc] = "GITHUB_INFERRED";
          delete resultOrigins[existingAnchor];

          for (const v of resultVariants) {
            if (v.shadowOf === existingAnchor) {
              v.shadowOf = trimmedInc;
            }
          }

          resultVariants.push({
            id: `var-inf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            text: existingAnchor,
            origin: "GITHUB_INFERRED",
            typologies: classifyBulletTypologies(existingAnchor),
            confidenceScore: dynamicScore,
            shadowOf: trimmedInc,
            status: "ACTIVE_VARIANT",
          });
        } else {
          resultVariants.push({
            id: `var-inf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            text: trimmedInc,
            origin: "GITHUB_INFERRED",
            typologies: classifyBulletTypologies(trimmedInc),
            confidenceScore: dynamicScore,
            shadowOf: existingAnchor,
            status: "ACTIVE_VARIANT",
          });
        }
      }
    } else {
      // 3. Non-overlapping bullet -> Additive capability up to MAX_PRIMARY_PROJECT_BULLETS (15)
      if (resultBullets.length < MAX_PRIMARY_PROJECT_BULLETS) {
        resultBullets.push(trimmedInc);
        resultOrigins[trimmedInc] = incOrigin;
      } else {
        resultVariants.push({
          id: `var-overflow-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          text: trimmedInc,
          origin: incOrigin,
          typologies: classifyBulletTypologies(trimmedInc),
          confidenceScore: 0.80,
          status: "ACTIVE_VARIANT",
        });
      }
    }
  }

  return {
    bullets: resultBullets.slice(0, MAX_PRIMARY_PROJECT_BULLETS),
    variants: resultVariants,
    bulletOrigins: resultOrigins,
  };
}

/* -------------------------------------------------------------------------
 * 6. Project Card Reconciler & Universal Collection Deduplicator
 * ------------------------------------------------------------------------- */

export function reconcileProjectPair(
  target: ProjectInput,
  incoming: ProjectInput
): ProjectInput {
  const bestTitle = resolveBestProjectTitle(
    target.name,
    incoming.name,
    { origin: target.origin, description: target.description },
    { origin: incoming.origin, description: incoming.description }
  );

  const finalDesc =
    (target.origin === "HUMAN_VERIFIED" ? target.description : null) ||
    incoming.description ||
    target.description ||
    "";

  // Merge unique technologies preserving case
  const techMap = new Map<string, string>();
  for (const t of [...(target.technologies || []), ...(incoming.technologies || [])]) {
    const key = normalizeString(t);
    if (key && !techMap.has(key)) techMap.set(key, t.trim());
  }

  // Preserve best repository link
  const link = target.link || incoming.link || null;

  const finalDescNorm = normalizeString(finalDesc);
  const isDescriptionBullet = (bullet: string) => {
    if (!finalDescNorm) return false;
    const bNorm = normalizeString(bullet);
    return (
      bNorm === finalDescNorm ||
      (finalDescNorm.length >= 10 && bNorm.startsWith(finalDescNorm))
    );
  };

  // Reconcile bullets and companion variants
  const bulletResolution = reconcileProjectBullets(
    target.bullets || [],
    incoming.bullets || [],
    target.variants || [],
    incoming.variants || [],
    target.origin,
    incoming.origin,
    target.bulletOrigins,
    incoming.bulletOrigins
  );

  const cleanBullets = bulletResolution.bullets
    .map(sanitizeBulletText)
    .filter((b) => !isDescriptionBullet(b));

  const bulletOrigins = bulletResolution.bulletOrigins;

  // Origin is HUMAN_VERIFIED if any primary bullet or entry is human verified
  const hasHumanBullet =
    cleanBullets.some((b) => bulletOrigins[b] === "HUMAN_VERIFIED") ||
    target.origin === "HUMAN_VERIFIED" ||
    incoming.origin === "HUMAN_VERIFIED";

  const origin: ProjectInput["origin"] = hasHumanBullet
    ? "HUMAN_VERIFIED"
    : "GITHUB_INFERRED";

  return {
    id: target.id || incoming.id,
    name: bestTitle,
    description: finalDesc,
    technologies: Array.from(techMap.values()),
    link,
    bullets: cleanBullets,
    bulletOrigins,
    variants: bulletResolution.variants,
    origin,
  };
}

/**
 * Universally deduplicates a collection of projects.
 * Self-deduplicates within a single list, or merges incoming projects into an existing set.
 */
export function deduplicateProjectCollection(
  projects: ProjectInput[],
  options?: { preserveRawNames?: boolean }
): ProjectInput[] {
  const consolidated: ProjectInput[] = [];

  for (const proj of projects) {
    if (!proj.name || !proj.name.trim()) continue;

    const matchIndex = consolidated.findIndex((existing) => {
      const similarity = calculateProjectSimilarity(existing, proj);
      return similarity.isMatch;
    });

    if (matchIndex >= 0) {
      consolidated[matchIndex] = reconcileProjectPair(consolidated[matchIndex]!, proj);
    } else {
      const cleanName = options?.preserveRawNames
        ? proj.name
        : normalizeProjectName(proj.name);
      const descNorm = normalizeString(proj.description);
      const filteredBullets = (proj.bullets || [])
        .map(sanitizeBulletText)
        .filter((b) => {
          if (!descNorm) return true;
          const bNorm = normalizeString(b);
          return (
            bNorm !== descNorm &&
            !(descNorm.length >= 10 && bNorm.startsWith(descNorm))
          );
        })
        .slice(0, MAX_PRIMARY_PROJECT_BULLETS);

      const bulletOrigins: Record<string, string> = {
        ...(proj.bulletOrigins || {}),
      };
      for (const b of filteredBullets) {
        if (!bulletOrigins[b]) {
          bulletOrigins[b] = proj.origin || "HUMAN_VERIFIED";
        }
      }

      const projOrigin = proj.origin || "HUMAN_VERIFIED";
      consolidated.push({
        ...proj,
        name: cleanName,
        origin: projOrigin,
        bullets: filteredBullets,
        bulletOrigins,
        variants: proj.variants || [],
      });
    }
  }

  return consolidated.sort((a, b) =>
    (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" })
  );
}

/* -------------------------------------------------------------------------
 * 7. Work Experience Role & Promotion Matching
 * ------------------------------------------------------------------------- */

/**
 * Checks whether two work experiences describe the same tenure and role.
 * Accurately prevents merging promotions (distinct roles at the same employer).
 */
export function isWorkExperienceMatch(
  a: Partial<WorkExperienceInput> & { company: string },
  b: Partial<WorkExperienceInput> & { company: string }
): boolean {
  if (!a.company || !b.company) return false;

  // 1. Check Category (Work vs Leadership vs Volunteer vs Clinical vs Activities)
  const catA = (a.category || "Work").toLowerCase();
  const catB = (b.category || "Work").toLowerCase();
  if (catA !== catB) return false;

  // 2. Company Affinity Check (Probabilistic multi-signal)
  const compSim = calculateEntitySimilarity(a.company, b.company);
  if (!compSim.isMatch) return false;

  // 3. Date range safety (different time spans, e.g. 2012-2020 vs 2012-2022, represent distinct tenures)
  const rangeA = { start: a.startDate, end: a.endDate };
  const rangeB = { start: b.startDate, end: b.endDate };
  if (!areDateRangesCompatible(rangeA, rangeB)) {
    return false;
  }

  // 4. Sequential promotion check (distinct start dates at same employer with different titles)
  const startA = a.startDate?.trim() || "";
  const startB = b.startDate?.trim() || "";
  if (startA && startB && !areDatePointsCompatible(startA, startB)) {
    // Distinct start dates at same employer with different role titles = distinct promotion
    return false;
  }

  // 5. Role title comparison
  const roleA = normalizeString(a.role);
  const roleB = normalizeString(b.role);
  if (roleA && roleB && roleA === roleB) return true;

  // 6. Role token similarity (handling minor title differences / punctuation)
  if (a.role && b.role) {
    const roleSim = calculateEntitySimilarity(a.role, b.role);
    if (roleSim.isMatch && roleSim.overlap >= 0.70) {
      return true;
    }
  }

  // 7. Subsystem / Bullet probe check
  if (a.bullets?.length && b.bullets?.length) {
    for (const bA of a.bullets) {
      const textA = typeof bA === "string" ? bA : bA.rawText;
      for (const bB of b.bullets) {
        const textB = typeof bB === "string" ? bB : bB.rawText;
        if (hasThematicOverlap(textA, textB, 0.40)) {
          return true;
        }
      }
    }
  }

  // 8. If one role title is a subset or missing
  if (!roleA || !roleB || roleA.includes(roleB) || roleB.includes(roleA)) {
    return true;
  }

  return false;
}

/**
 * Reconciles two matching work experiences without dropping bullets.
 */
export function reconcileWorkExperiencePair(
  target: WorkExperienceInput,
  incoming: WorkExperienceInput
): WorkExperienceInput {
  const existingBulletMap = new Map<string, typeof target.bullets[number]>();
  for (const b of target.bullets) {
    existingBulletMap.set(normalizeString(b.rawText), b);
  }

  const mergedBullets = [...target.bullets];

  for (const incBullet of incoming.bullets) {
    const norm = normalizeString(incBullet.rawText);
    if (!norm) continue;

    const existingMatch = existingBulletMap.get(norm);
    if (!existingMatch) {
      // Check thematic overlap against existing bullets
      let overlapIndex = -1;
      let highestOverlap = 0;
      const incTokens = tokenizeThematicWords(incBullet.rawText);

      for (let i = 0; i < mergedBullets.length; i++) {
        const bTokens = tokenizeThematicWords(mergedBullets[i]!.rawText);
        const ov = calculateOverlapCoefficient(bTokens, incTokens);
        if (ov >= 0.40 && ov > highestOverlap) {
          highestOverlap = ov;
          overlapIndex = i;
        }
      }

      if (overlapIndex >= 0) {
        // High thematic overlap between human bullets: incoming recency takes lead, old saved as variant
        const oldBullet = mergedBullets[overlapIndex]!;
        const idClash = mergedBullets.some((b, idx) => idx !== overlapIndex && b.id === incBullet.id);
        const resolvedId = idClash
          ? `exp-b-${randomUUID().slice(0, 8)}`
          : incBullet.id;

        mergedBullets[overlapIndex] = {
          ...incBullet,
          id: resolvedId,
          typologies: incBullet.typologies?.length
            ? incBullet.typologies
            : classifyBulletTypologies(incBullet.rawText),
          variants: [
            ...(oldBullet.variants || []),
            {
              id: `rev-exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              text: oldBullet.rawText,
              origin: "HUMAN_VERIFIED",
              typologies: oldBullet.typologies?.length
                ? oldBullet.typologies
                : classifyBulletTypologies(oldBullet.rawText),
              confidenceScore: 1.0,
              supersededAt: new Date().toISOString(),
              status: "ARCHIVED_REVISION",
            },
          ],
        };
      } else if (mergedBullets.length < MAX_PRIMARY_EXPERIENCE_BULLETS) {
        const idClash = mergedBullets.some((b) => b.id === incBullet.id);
        const resolvedId = idClash
          ? `exp-b-${randomUUID().slice(0, 8)}`
          : incBullet.id;

        mergedBullets.push({
          ...incBullet,
          id: resolvedId,
          typologies: incBullet.typologies?.length
            ? incBullet.typologies
            : classifyBulletTypologies(incBullet.rawText),
        });
      }
    }
  }

  return {
    ...target,
    role: target.role || incoming.role,
    location: target.location || incoming.location || null,
    category: target.category || incoming.category || "Work",
    startDate:
      resolveGranularDate(target.startDate, incoming.startDate) ||
      target.startDate ||
      incoming.startDate ||
      "Present",
    endDate: resolveGranularDate(target.endDate, incoming.endDate),
    bullets: mergedBullets.slice(0, MAX_PRIMARY_EXPERIENCE_BULLETS),
  };
}

/**
 * Universally deduplicates a collection of work experiences.
 */
export function deduplicateWorkExperienceCollection(
  experiences: WorkExperienceInput[]
): WorkExperienceInput[] {
  const consolidated: WorkExperienceInput[] = [];

  for (const exp of experiences) {
    if (!exp.company || !exp.company.trim()) continue;

    const matchIndex = consolidated.findIndex((existing) =>
      isWorkExperienceMatch(existing, exp)
    );

    if (matchIndex >= 0) {
      consolidated[matchIndex] = reconcileWorkExperiencePair(
        consolidated[matchIndex]!,
        exp
      );
    } else {
      consolidated.push({
        ...exp,
        startDate: normalizeDateString(exp.startDate) || exp.startDate,
        endDate: normalizeDateString(exp.endDate) ?? exp.endDate,
        bullets: exp.bullets.map((b) => ({
          ...b,
          typologies: b.typologies?.length
            ? b.typologies
            : classifyBulletTypologies(b.rawText),
        })),
      });
    }
  }

  return consolidated;
}

/* -------------------------------------------------------------------------
 * 8. Education Program Deduplication
 * ------------------------------------------------------------------------- */

/**
 * Normalizes degree level to a canonical tier for career-agnostic comparison.
 */
export function normalizeDegreeLevel(degree: string | null | undefined): string | null {
  if (!degree) return null;
  const lower = degree.toLowerCase();
  if (/\b(?:bachelor|bachelors|b\.?s\.?|b\.?a\.?|b\.?s\.?e\.?|b\.?f\.?a\.?|b\.?b\.?a\.?|b\.?eng)\b/i.test(lower)) return "bachelor";
  if (/\b(?:master|masters|m\.?s\.?|m\.?a\.?|m\.?b\.?a\.?|m\.?s\.?c\.?|m\.?f\.?a\.?|m\.?eng|m\.?p\.?s\.?)\b/i.test(lower)) return "master";
  if (/\b(?:doctor|doctorate|ph\.?d\.?|m\.?d\.?|j\.?d\.?|ed\.?d\.?)\b/i.test(lower)) return "doctorate";
  if (/\b(?:associate|associates|a\.?a\.?|a\.?s\.?|a\.?a\.?s\.?)\b/i.test(lower)) return "associate";
  return null;
}

/**
 * Checks whether two education entries describe the same degree program.
 */
export function isEducationMatch(
  a: Partial<EducationInput> & { institution: string },
  b: Partial<EducationInput> & { institution: string }
): boolean {
  if (!a.institution || !b.institution) return false;

  // 1. Institution similarity (handling abbreviations, acronyms, and institutional variations)
  const instSim = calculateEntitySimilarity(a.institution, b.institution);
  if (!instSim.isMatch) return false;

  // 2. SubSchool distinction (e.g. Wharton vs School of Engineering)
  const subA = normalizeString(a.subSchool ?? "");
  const subB = normalizeString(b.subSchool ?? "");
  if (subA && subB && subA !== subB) return false;

  // 3. Degree tier comparison (BS vs MS vs PhD must not collapse)
  const levelA = normalizeDegreeLevel(a.degree);
  const levelB = normalizeDegreeLevel(b.degree);
  if (levelA && levelB && levelA !== levelB) {
    return false;
  }

  // 4. Exact degree strings
  const degA = normalizeString(a.degree ?? "");
  const degB = normalizeString(b.degree ?? "");
  if (degA && degB && degA === degB) return true;

  // 5. Field of study alignment
  const fieldA = normalizeString(a.fieldOfStudy ?? "");
  const fieldB = normalizeString(b.fieldOfStudy ?? "");
  if (fieldA && fieldB) {
    const fieldSim = calculateEntitySimilarity(a.fieldOfStudy, b.fieldOfStudy);
    if (!fieldSim.isMatch && fieldA !== fieldB) {
      return false;
    }
  }

  // 6. Date range compatibility check
  const rangeA = { start: a.startDate, end: a.graduationDate || a.endDate };
  const rangeB = { start: b.startDate, end: b.graduationDate || b.endDate };
  if (!areDateRangesCompatible(rangeA, rangeB)) {
    if (degA !== degB) return false;
  }

  return true;
}

export function reconcileEducationPair(
  target: EducationInput,
  incoming: EducationInput
): EducationInput {
  return {
    ...target,
    degree: target.degree || incoming.degree,
    subSchool: target.subSchool || incoming.subSchool,
    fieldOfStudy: target.fieldOfStudy || incoming.fieldOfStudy,
    startDate:
      resolveGranularDate(target.startDate, incoming.startDate) ||
      target.startDate ||
      incoming.startDate ||
      "Present",
    graduationDate: resolveGranularDate(target.graduationDate, incoming.graduationDate),
    status:
      incoming.status && incoming.status !== "GRADUATED"
        ? incoming.status
        : target.status ?? incoming.status ?? "GRADUATED",
    gpa: target.gpa || incoming.gpa,
    honors: [...(target.honors ?? []), ...(incoming.honors ?? [])].filter(
      (honor, index, list) =>
        list.findIndex((item) => item.toLowerCase() === honor.toLowerCase()) === index
    ),
    coursework: [...(target.coursework ?? []), ...(incoming.coursework ?? [])].filter(
      (course, index, list) =>
        list.findIndex((item) => item.toLowerCase() === course.toLowerCase()) === index
    ),
  };
}

export function deduplicateEducationCollection(
  education: EducationInput[]
): EducationInput[] {
  const consolidated: EducationInput[] = [];
  for (const ed of education) {
    if (!ed.institution || !ed.institution.trim()) continue;
    const matchIndex = consolidated.findIndex((e) => isEducationMatch(e, ed));
    if (matchIndex >= 0) {
      consolidated[matchIndex] = reconcileEducationPair(consolidated[matchIndex]!, ed);
    } else {
      consolidated.push({
        ...ed,
        startDate: normalizeDateString(ed.startDate) || ed.startDate,
        graduationDate: normalizeDateString(ed.graduationDate) || ed.graduationDate,
      });
    }
  }
  return consolidated;
}

/* -------------------------------------------------------------------------
 * 9. Credential & Certification Deduplication
 * ------------------------------------------------------------------------- */

export function isCertificationMatch(
  a: CertificationItem,
  b: CertificationItem
): boolean {
  if (!a.name || !b.name) return false;

  const normA = normalizeString(a.name);
  const normB = normalizeString(b.name);
  if (normA && normB && normA === normB) return true;

  const nameSim = calculateEntitySimilarity(a.name, b.name);
  if (nameSim.isMatch && nameSim.overlap >= 0.70) {
    if (a.issuer && b.issuer) {
      const issuerSim = calculateEntitySimilarity(a.issuer, b.issuer);
      if (!issuerSim.isMatch && issuerSim.score < 0.40) return false;
    }
    if (a.date && b.date && !areDatePointsCompatible(a.date, b.date)) {
      return false;
    }
    return true;
  }

  return false;
}

export function reconcileCertificationPair(
  target: CertificationItem,
  incoming: CertificationItem
): CertificationItem {
  return {
    ...target,
    issuer: target.issuer || incoming.issuer,
    date: resolveGranularDate(target.date, incoming.date),
    url: target.url || incoming.url,
  };
}

export function deduplicateCertificationCollection(
  certifications: CertificationItem[]
): CertificationItem[] {
  const consolidated: CertificationItem[] = [];
  for (const cert of certifications) {
    if (!cert.name || !cert.name.trim()) continue;
    const matchIndex = consolidated.findIndex((c) => isCertificationMatch(c, cert));
    if (matchIndex >= 0) {
      consolidated[matchIndex] = reconcileCertificationPair(consolidated[matchIndex]!, cert);
    } else {
      consolidated.push({
        ...cert,
        date: normalizeDateString(cert.date) || cert.date,
      });
    }
  }
  return consolidated;
}

/* -------------------------------------------------------------------------
 * 10. Award & Honor Deduplication
 * ------------------------------------------------------------------------- */

export function isAwardMatch(
  a: AwardItem,
  b: AwardItem
): boolean {
  if (!a.title || !b.title) return false;

  const normA = normalizeString(a.title);
  const normB = normalizeString(b.title);
  if (normA && normB && normA === normB) return true;

  const titleSim = calculateEntitySimilarity(a.title, b.title);
  if (titleSim.isMatch && titleSim.overlap >= 0.70) {
    if (a.issuer && b.issuer) {
      const issuerSim = calculateEntitySimilarity(a.issuer, b.issuer);
      if (!issuerSim.isMatch && issuerSim.score < 0.40) return false;
    }
    if (a.date && b.date && !areDatePointsCompatible(a.date, b.date)) {
      return false;
    }
    return true;
  }

  return false;
}

export function reconcileAwardPair(
  target: AwardItem,
  incoming: AwardItem
): AwardItem {
  return {
    ...target,
    issuer: target.issuer || incoming.issuer,
    date: resolveGranularDate(target.date, incoming.date),
    description: target.description || incoming.description,
  };
}

export function deduplicateAwardCollection(
  awards: AwardItem[]
): AwardItem[] {
  const consolidated: AwardItem[] = [];
  for (const award of awards) {
    if (!award.title || !award.title.trim()) continue;
    const matchIndex = consolidated.findIndex((a) => isAwardMatch(a, award));
    if (matchIndex >= 0) {
      consolidated[matchIndex] = reconcileAwardPair(consolidated[matchIndex]!, award);
    } else {
      consolidated.push({
        ...award,
        date: normalizeDateString(award.date) || award.date,
      });
    }
  }
  return consolidated;
}
