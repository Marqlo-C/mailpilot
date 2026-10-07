/**
 * Zero-cost geographic normalizer and compatibility matcher.
 * Resolves variations like "Sacramento, CA", "Sacramento", and "Sacramento, California".
 */

const US_STATES_AND_TERRITORIES: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  newhampshire: "NH",
  newjersey: "NJ",
  newmexico: "NM",
  newyork: "NY",
  northcarolina: "NC",
  northdakota: "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  rhodeisland: "RI",
  southcarolina: "SC",
  southdakota: "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  westvirginia: "WV",
  wisconsin: "WI",
  wyoming: "WY",
  districtofcolumbia: "DC",
  puertorico: "PR",
  guam: "GU",
  usvirginislands: "VI",
  americansamoa: "AS",
  northernmarianas: "MP",
};

const VALID_STATE_CODES = new Set(Object.values(US_STATES_AND_TERRITORIES));

export type ParsedLocation = {
  city: string;
  state: string | null;
  isRemote: boolean;
};

export function parseLocation(raw: string | null | undefined): ParsedLocation {
  if (!raw) {
    return { city: "", state: null, isRemote: false };
  }

  let text = raw.toLowerCase().trim();

  // 1. Detect and strip remote/workplace context
  const isRemote = /\b(remote|work from home|wfh)\b/i.test(text);
  text = text
    .replace(/\b(remote|hybrid|on-site|onsite|work from home|wfh)\b/gi, " ")
    .replace(/[()[\]{}]/g, " ")
    .trim();

  // 2. Tokenize by common delimiters (e.g., "Sacramento, CA", "San Jose - California")
  const parts = text
    .split(/[,/·|–—-]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return { city: "", state: null, isRemote };
  }

  const city = parts[0]!.replace(/[^a-z0-9\s]/g, "").trim();
  let state: string | null = null;

  if (parts.length > 1) {
    const rawState = parts[1]!.replace(/[^a-z]/g, "");
    const upperState = rawState.toUpperCase();

    if (VALID_STATE_CODES.has(upperState)) {
      state = upperState;
    } else if (US_STATES_AND_TERRITORIES[rawState]) {
      state = US_STATES_AND_TERRITORIES[rawState]!;
    }
  }

  return { city, state, isRemote };
}

/**
 * Checks if two location strings represent the same geographic opportunity.
 * Returns true if they match or if either is unspecified/remote.
 * Returns false if there is a definitive city or state conflict.
 */
export function isLocationCompatible(
  locA: string | null | undefined,
  locB: string | null | undefined
): boolean {
  if (!locA || !locB) return true;

  const a = parseLocation(locA);
  const b = parseLocation(locB);

  // If both denote remote or either lacks a city, allow match
  if (a.isRemote || b.isRemote || !a.city || !b.city) {
    return true;
  }

  // Explicit state conflict (e.g. CA vs NC)
  if (a.state && b.state && a.state !== b.state) {
    return false;
  }

  // City compatibility: exact match or containment (e.g. "Sacramento" vs "Greater Sacramento")
  const cityMatch =
    a.city === b.city ||
    a.city.includes(b.city) ||
    b.city.includes(a.city);

  return cityMatch;
}
