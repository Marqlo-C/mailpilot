/**
 * ============================================================================
 * SINGLE SOURCE OF TRUTH (SSOT): GROUNDED METRICS & HEURISTIC SPOTTER
 *
 * Provides career-agnostic metric unit taxonomies, heuristic document scanning,
 * and post-inference grounding verification.
 * ============================================================================
 */

/**
 * Universal metric unit groups categorized across physical and conceptual dimensions.
 * Consolidates all units in one place for easy modification and extension.
 */
export const METRIC_UNIT_GROUPS = {
  TIME: [
    "ms",
    "s",
    "sec",
    "seconds?",
    "mins?",
    "minutes?",
    "hours?",
    "days?",
    "weeks?",
    "months?",
    "years?",
  ],
  RATES: [
    "%",
    "percent",
    "fps",
    "hz",
    "khz",
    "mhz",
    "ghz",
    "req/s",
    "reqs?/sec",
    "rps",
    "qps",
    "tps",
    "items/s",
    "events/s",
  ],
  DATA_CAPACITY: [
    "b",
    "kb",
    "mb",
    "gb",
    "tb",
    "bytes?",
    "bits?",
    "records?",
    "samples?",
    "tokens?",
  ],
  GEOMETRY_BOUNDS: [
    "columns?",
    "rows?",
    "dimensions?",
    "features?",
    "degrees?",
    "grid",
    "tiers?",
    "layers?",
  ],
  SYSTEM_COUNT: [
    "endpoints?",
    "markets?",
    "nodes?",
    "workers?",
    "threads?",
    "cores?",
    "clusters?",
    "keys?",
    "services?",
  ],
  PHYSICAL_ENGINEERING: [
    "v",
    "w",
    "ma",
    "psi",
    "db",
    "km",
    "mi",
    "m",
  ],
} as const;

/** Units that are non-word characters like % */
const SYMBOL_UNITS = ["%", "percent"];

/** Flattened list of word-based metric units */
const WORD_UNITS_FLAT = Object.values(METRIC_UNIT_GROUPS)
  .flat()
  .filter((u) => !SYMBOL_UNITS.includes(u));

/** Global regex for extracting all metric tokens across a document (with optional single adjective) */
const GLOBAL_UNIT_SCANNER_REGEX = new RegExp(
  `\\b(\\d+(?:\\.\\d+)?)[\\s-]*(?:[a-zA-Z]{3,15}\\s+)?(%|percent|(?:${WORD_UNITS_FLAT.join("|")})\\b)`,
  "gi"
);

/** Dimensional bounds regex (e.g. 6x7, 64x64, 1920x1080) */
const DIMENSIONAL_BOUNDS_REGEX = /\b(\d+)\s*[xX×]\s*(\d+)\b/g;

/** Formatted large numbers (e.g. 10,000 or 1,000,000) */
const FORMATTED_LARGE_NUMBER_REGEX = /\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g;

/** Common 4-digit years to ignore as metrics */
const YEAR_REGEX = /\b(?:19\d\d|20\d\d)\b/;

/** Common version patterns to ignore as metrics (e.g. v1.0, 15.0, Next.js 15) */
const VERSION_CONTEXT_REGEX = /\b(?:v|version|next(?:\.js)?|react|node(?:\.js)?|python)\s*\d+/i;

/** Synthetic corporate percentage gain clauses to strip if ungrounded */
const SYNTHETIC_PERCENTAGE_CLAUSE_REGEX =
  /\s*(?:by|with)\s+\d+(?:\.\d+)?%\s*(?:efficiency|improvement|gain|speedup|reduction|accuracy|performance|increase|decrease)?/gi;

/**
 * Extracts grounded numerical metrics and engineering parameters from raw documentation.
 * Returns a deduplicated, clean array of detected anchors (e.g. ["150ms", "3 endpoints", "6x7"]).
 */
export function extractGroundedDocumentMetrics(
  sourceText: string | null | undefined,
  maxItems = 10
): string[] {
  if (!sourceText || typeof sourceText !== "string") return [];

  const seen = new Set<string>();
  const results: string[] = [];

  // Helper to add unique candidate
  const addCandidate = (val: string) => {
    const clean = val.trim();
    const lower = clean.toLowerCase();
    if (!seen.has(lower) && results.length < maxItems) {
      seen.add(lower);
      results.push(clean);
    }
  };

  // 1. Scan for Number + Recognized Unit
  const unitMatches = sourceText.matchAll(GLOBAL_UNIT_SCANNER_REGEX);
  for (const m of unitMatches) {
    const rawNumber = m[1];
    const rawUnit = m[2];

    // Filter out 4-digit years (e.g., "2024 hours" if malformed)
    if (YEAR_REGEX.test(rawNumber) && rawNumber.length === 4) {
      continue;
    }

    addCandidate(`${rawNumber}${rawUnit.startsWith("%") ? "%" : " " + rawUnit}`);
    if (results.length >= maxItems) break;
  }

  // 2. Scan for Dimensional Bounds (e.g. 6x7)
  if (results.length < maxItems) {
    const dimMatches = sourceText.matchAll(DIMENSIONAL_BOUNDS_REGEX);
    for (const m of dimMatches) {
      addCandidate(`${m[1]}x${m[2]}`);
      if (results.length >= maxItems) break;
    }
  }

  // 3. Scan for Formatted Large Numbers (e.g. 10,000)
  if (results.length < maxItems) {
    const numMatches = sourceText.matchAll(FORMATTED_LARGE_NUMBER_REGEX);
    for (const m of numMatches) {
      addCandidate(m[0]);
      if (results.length >= maxItems) break;
    }
  }

  return results;
}

export interface MetricVerificationResult {
  bullet: string;
  isGrounded: boolean;
  hadHallucination: boolean;
  groundedNumbers: string[];
}

/**
 * Verifies whether numbers in a bullet are substantiated by the source document.
 * If an ungrounded synthetic percentage clause (e.g. "by 35% efficiency") is detected,
 * it is stripped cleanly without altering the underlying mechanical action.
 */
export function verifyAndScrubBulletMetrics(params: {
  bullet: string;
  sourceText?: string | null;
  discoveredMetrics?: string[];
}): MetricVerificationResult {
  let { bullet } = params;
  const { sourceText = "", discoveredMetrics = [] } = params;
  const normSource = (sourceText ?? "").toLowerCase();

  // Extract all numeric tokens from the bullet (even if immediately adjacent to units like 150ms)
  const bulletNumberMatches = bullet.match(/\b\d+(?:\.\d+)?/g) || [];
  const groundedNumbers: string[] = [];
  let hadHallucination = false;

  for (const num of bulletNumberMatches) {
    // Ignore 4-digit calendar years
    if (num.length === 4 && (num.startsWith("19") || num.startsWith("20"))) {
      continue;
    }

    // Check if the number literally exists in the source text or discovered list
    const isPresentInDoc = normSource.includes(num.toLowerCase());
    const isPresentInAnchors = discoveredMetrics.some((m) =>
      m.toLowerCase().includes(num.toLowerCase())
    );

    if (isPresentInDoc || isPresentInAnchors) {
      groundedNumbers.push(num);
    } else {
      hadHallucination = true;
    }
  }

  // If the bullet has ungrounded numbers, check if it contains a synthetic percentage clause
  if (hadHallucination) {
    const matchClause = bullet.match(SYNTHETIC_PERCENTAGE_CLAUSE_REGEX);
    if (matchClause) {
      for (const clause of matchClause) {
        // Only strip if the percentage number is ungrounded
        const numInClause = clause.match(/\d+(?:\.\d+)?/);
        if (numInClause && !normSource.includes(numInClause[0])) {
          bullet = bullet.replace(clause, "").trim();
          // Clean up any double spaces or dangling prepositions before punctuation
          bullet = bullet.replace(/\s{2,}/g, " ").replace(/\s+([,.;])/g, "$1");
        }
      }
    }
  }

  return {
    bullet,
    isGrounded: !hadHallucination,
    hadHallucination,
    groundedNumbers,
  };
}
