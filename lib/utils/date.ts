/**
 * Universal date normalization, parsing, and range compatibility engine.
 * 100% career-agnostic and multi-tenant.
 */

export const STANDARD_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
] as const;

export type StandardMonth = (typeof STANDARD_MONTHS)[number];

const MONTH_MAP: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const OPEN_ENDED_REGEX = /^(?:present|current|ongoing|now|to date)$/i;

export interface ParsedDateInfo {
  year: number | null;
  month: number | null; // 1-12 or null
  isOpenEnded: boolean;
  raw: string;
}

/**
 * Normalizes any date string containing a month to standard 3-letter format: "Mmm YYYY" (e.g. "Aug 2012").
 * Preserves year-only dates (e.g. "2012"), "Present", and expected prefixes.
 */
export function normalizeDateString(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;

  if (OPEN_ENDED_REGEX.test(trimmed)) return "Present";

  const prefixMatch = trimmed.match(/^(expected|anticipated|class of)\s+(.+)$/i);
  if (prefixMatch && prefixMatch[1] && prefixMatch[2]) {
    const sub = normalizeDateString(prefixMatch[2]);
    const p = prefixMatch[1].charAt(0).toUpperCase() + prefixMatch[1].slice(1).toLowerCase();
    return sub ? `${p} ${sub}` : trimmed;
  }

  const yearMatch = trimmed.match(/\b(19\d\d|20\d\d)\b/);
  if (!yearMatch || !yearMatch[1]) return trimmed;
  const year = yearMatch[1];

  // 1. Text month (e.g. "August 2012", "Aug. 2012", "Sept 2021")
  const monthMatch = trimmed.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i
  );
  if (monthMatch && monthMatch[1]) {
    const key = monthMatch[1].toLowerCase().slice(0, 3);
    const mNum = MONTH_MAP[key];
    if (mNum && mNum >= 1 && mNum <= 12) {
      return `${STANDARD_MONTHS[mNum - 1]} ${year}`;
    }
  }

  // 2. Numeric month YYYY-MM or YYYY/MM (e.g. "2012-08")
  const yyyymm = trimmed.match(new RegExp(`\\b${year}[-/](\\d{1,2})\\b`));
  if (yyyymm && yyyymm[1]) {
    const mNum = parseInt(yyyymm[1], 10);
    if (mNum >= 1 && mNum <= 12) {
      return `${STANDARD_MONTHS[mNum - 1]} ${year}`;
    }
  }

  // 3. Numeric month MM-YYYY or MM/YYYY (e.g. "08/2012", "8/2012")
  const mmyyyy = trimmed.match(new RegExp(`\\b(\\d{1,2})[-/]${year}\\b`));
  if (mmyyyy && mmyyyy[1]) {
    const mNum = parseInt(mmyyyy[1], 10);
    if (mNum >= 1 && mNum <= 12) {
      return `${STANDARD_MONTHS[mNum - 1]} ${year}`;
    }
  }

  return year;
}

/**
 * Extracts structured year, month, and open-ended status from a date string.
 */
export function parseDateInfo(raw: string | null | undefined): ParsedDateInfo | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (OPEN_ENDED_REGEX.test(trimmed)) {
    return { year: null, month: null, isOpenEnded: true, raw: "Present" };
  }

  const yearMatch = trimmed.match(/\b(19\d\d|20\d\d)\b/);
  const year = yearMatch && yearMatch[1] ? parseInt(yearMatch[1], 10) : null;

  let month: number | null = null;
  const monthMatch = trimmed.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i
  );
  if (monthMatch && monthMatch[1]) {
    const key = monthMatch[1].toLowerCase().slice(0, 3);
    month = MONTH_MAP[key] ?? null;
  } else if (year) {
    const yyyymm = trimmed.match(new RegExp(`\\b${year}[-/](\\d{1,2})\\b`));
    if (yyyymm && yyyymm[1]) {
      const m = parseInt(yyyymm[1], 10);
      if (m >= 1 && m <= 12) month = m;
    } else {
      const mmyyyy = trimmed.match(new RegExp(`\\b(\\d{1,2})[-/]${year}\\b`));
      if (mmyyyy && mmyyyy[1]) {
        const m = parseInt(mmyyyy[1], 10);
        if (m >= 1 && m <= 12) month = m;
      }
    }
  }

  return { year, month, isOpenEnded: false, raw: trimmed };
}

/**
 * Checks if two individual date points are non-contradictory.
 * E.g. "2012" and "Aug 2012" are compatible (same year, one is more granular).
 * "2012" and "2014" are incompatible (different years).
 */
export function areDatePointsCompatible(
  dateA: string | null | undefined,
  dateB: string | null | undefined
): boolean {
  const pA = parseDateInfo(dateA);
  const pB = parseDateInfo(dateB);
  if (!pA || !pB) return true; // Missing date is non-contradictory

  if (pA.isOpenEnded && pB.isOpenEnded) return true;
  if (pA.isOpenEnded !== pB.isOpenEnded && (pA.year != null || pB.year != null)) {
    return false;
  }

  if (pA.year != null && pB.year != null) {
    if (pA.year !== pB.year) return false;
    // Same year: if both specify months, verify month proximity (within 1 month)
    if (pA.month != null && pB.month != null) {
      return Math.abs(pA.month - pB.month) <= 1;
    }
    // One has a month and the other is year-only: compatible
    return true;
  }

  return true;
}

/**
 * Resolves the more granular date representation between two matching dates.
 * Prefers month + year (e.g. "Aug 2012") over coarse year-only (e.g. "2012").
 */
export function resolveGranularDate(
  dateA: string | null | undefined,
  dateB: string | null | undefined
): string | null {
  const pA = parseDateInfo(dateA);
  const pB = parseDateInfo(dateB);
  if (!pA && !pB) return null;
  if (!pA) return normalizeDateString(dateB);
  if (!pB) return normalizeDateString(dateA);

  const normA = normalizeDateString(dateA);
  const normB = normalizeDateString(dateB);

  // If one has month granularity and the other is year-only, prefer the one with month
  if (pA.month != null && pB.month == null) return normA;
  if (pB.month != null && pA.month == null) return normB;

  return normB || normA;
}

/**
 * Evaluates whether two date ranges represent the same time range.
 * E.g. "2012 - 2020" and "Aug 2012 - Jun 2020" are considered the same.
 * "2012 - 2020" and "2012 - 2022" are considered different tenures.
 */
export function areDateRangesCompatible(
  rangeA: { start?: string | null; end?: string | null },
  rangeB: { start?: string | null; end?: string | null }
): boolean {
  const startMatch = areDatePointsCompatible(rangeA.start, rangeB.start);
  const endMatch = areDatePointsCompatible(rangeA.end, rangeB.end);
  return startMatch && endMatch;
}
