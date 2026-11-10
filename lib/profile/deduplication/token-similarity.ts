import {
  detectMetric,
  type BulletTypology,
} from "@/lib/validations/profile.schema";
import { normalizeProjectName } from "@/lib/utils/format";

export const UNIVERSAL_STOPWORDS = new Set([
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

export const PREPOSITION_CONJUNCTION_STOPWORDS = new Set([
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

  if (words.length >= 2) {
    const fullAcronym = words.map((w) => w[0]).join("");
    if (fullAcronym.length >= 2 && fullAcronym.length <= 6) {
      acronyms.add(fullAcronym);
      allTokens.add(fullAcronym);
    }

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

  if (normA && normB && normA === normB) {
    return { score: 1.0, isMatch: true, overlap: 1.0, jaccard: 1.0 };
  }

  if (normA && normB && normA.length >= 5 && normB.length >= 5) {
    if (normA.includes(normB) || normB.includes(normA)) {
      return { score: 0.95, isMatch: true, overlap: 0.95, jaccard: 0.95 };
    }
  }

  const entityA = tokenizeEntityWords(cleanA);
  const entityB = tokenizeEntityWords(cleanB);

  let sharedDistinctive = 0;
  for (const w of entityB.distinctiveTokens) {
    if (entityA.distinctiveTokens.has(w)) sharedDistinctive++;
  }
  const minDistinctive = Math.min(entityA.distinctiveTokens.size, entityB.distinctiveTokens.size);
  const distinctiveOverlap = minDistinctive > 0 ? sharedDistinctive / minDistinctive : 0;
  const jaccard = calculateJaccardSimilarity(entityA.distinctiveTokens, entityB.distinctiveTokens);

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

  const unsharedA = Array.from(entityA.distinctiveTokens).filter(
    (w) => !entityB.distinctiveTokens.has(w) && !entityB.acronyms.has(w)
  );
  const unsharedB = Array.from(entityB.distinctiveTokens).filter(
    (w) => !entityA.distinctiveTokens.has(w) && !entityA.acronyms.has(w)
  );
  const hasWordConflict = unsharedA.length > 0 && unsharedB.length > 0;

  if (hasAcronymLink && !hasWordConflict) {
    return { score: 0.85, isMatch: true, overlap: 1.0, jaccard: Math.max(jaccard, 0.5) };
  }

  if (distinctiveOverlap >= 0.70 && minDistinctive >= 1 && !hasWordConflict) {
    return { score: Math.max(jaccard, distinctiveOverlap * 0.85), isMatch: true, overlap: distinctiveOverlap, jaccard };
  }

  return { score: Math.max(jaccard, distinctiveOverlap * 0.5), isMatch: false, overlap: distinctiveOverlap, jaccard };
}

export const TYPOLOGY_PATTERNS: Record<Exclude<BulletTypology, "METRIC_QUANTITATIVE">, RegExp> = {
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
 */
export function classifyBulletTypologies(text: string | null | undefined): BulletTypology[] {
  if (!text || !text.trim()) {
    return ["EXECUTION_DELIVERY"];
  }

  const results: BulletTypology[] = [];

  if (detectMetric(text)) {
    results.push("METRIC_QUANTITATIVE");
  }

  for (const [typology, pattern] of Object.entries(TYPOLOGY_PATTERNS) as [
    Exclude<BulletTypology, "METRIC_QUANTITATIVE">,
    RegExp
  ][]) {
    if (typology === "EXECUTION_DELIVERY") continue;
    if (pattern.test(text)) {
      results.push(typology);
    }
  }

  if (results.length === 0 || TYPOLOGY_PATTERNS.EXECUTION_DELIVERY.test(text)) {
    results.push("EXECUTION_DELIVERY");
  }

  return Array.from(new Set(results)).slice(0, 3);
}

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

  const subtitleMatch = normalizedTitle.match(/\s*[-–—:|]\s*(.+)$/);
  if (subtitleMatch && subtitleMatch[1]) {
    const subtitleWords = subtitleMatch[1].trim().split(/\s+/).filter((w) => w.length > 2);
    if (subtitleWords.length >= 2 && subtitleMatch[1].trim().length >= 6) {
      score += 3.0;
    }
  }

  const isAllLower = normalizedTitle === normalizedTitle.toLowerCase();
  const isSlug = /^[a-z0-9_-]+$/.test(normalizedTitle);
  if (!isAllLower && !isSlug && /^[A-Z]/.test(normalizedTitle)) {
    score += 2.0;
  }

  if (options?.origin === "HUMAN_VERIFIED") {
    score += 1.0;
  }

  if (options?.description && options.description.trim().length >= 20) {
    score += 1.5;
  }

  if (/\b[a-z0-9_.-]+\/[a-z0-9_.-]+\b/i.test(normalizedTitle)) {
    score -= 3.0;
  }
  if (/\.(?:py|tsx?|jsx?|ipynb|git|md|json)\b/i.test(normalizedTitle)) {
    score -= 3.0;
  }
  if (/\b(?:final|v\d+|temp|tmp|homework|hw|assignment|scratch|test|submission)\b/i.test(normalizedTitle)) {
    score -= 2.0;
  }

  return { score, normalizedTitle };
}

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

  if (optionsA?.origin === "HUMAN_VERIFIED" && optionsB?.origin !== "HUMAN_VERIFIED") {
    return weightedA.normalizedTitle;
  }
  if (optionsB?.origin === "HUMAN_VERIFIED" && optionsA?.origin !== "HUMAN_VERIFIED") {
    return weightedB.normalizedTitle;
  }

  return weightedA.normalizedTitle.length >= weightedB.normalizedTitle.length
    ? weightedA.normalizedTitle
    : weightedB.normalizedTitle;
}

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
