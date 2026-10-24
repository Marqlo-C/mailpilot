import { categorizeProfileUrl, isResumeHeaderLink, isVerifiedProfileUrl } from "./url";
import {
  extractLocationFromText,
  US_STATES_AND_TERRITORIES,
  VALID_STATE_CODES,
} from "./location";

/** Strip protocol / www / .git / trailing punctuation for human-readable URL display. */
export function cleanDisplayUrl(url: string | null | undefined): string {
  if (!url) return "";
  return url
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "")
    .replace(/\.+$/, "");
}

/** Formats a project link cleanly without protocol, www, or trailing .git / slashes. */
export function cleanProjectUrl(url: string | null | undefined): string {
  if (!url) return "";
  return cleanDisplayUrl(url);
}

/** Role line. The workplace is included only when one was captured. */
export function formatExperienceHeading(
  role?: string | null,
  company?: string | null,
  location?: string | null
): string {
  const title = role?.trim() ?? "";
  const org = company?.trim() ?? "";
  const place = location?.trim() ?? "";
  const parts = [title];
  if (org && org.toLowerCase() !== title.toLowerCase()) parts.push(org);
  if (place) parts.push(place);
  return parts.filter(Boolean).join(" · ");
}

/** Degree line without repeating a major that is already inside the degree name. */
export function formatEducationTitle(
  degree?: string | null,
  fieldOfStudy?: string | null
): string {
  const deg = degree?.trim() || "";
  const rawField = fieldOfStudy?.trim() || "";
  if (!deg && !rawField) return "";
  if (!rawField) return deg;
  if (!deg) return rawField;
  const field = rawField.replace(/^in\s+/i, "").trim();
  if (!field) return deg;
  if (deg.toLowerCase().includes(field.toLowerCase())) return deg;
  const minorLead = /^minor\s+in\s+/i.test(rawField);
  const mode = deg.toLowerCase().endsWith(" in")
    ? "space"
    : minorLead || /\bin\b/i.test(deg)
      ? "comma"
      : "in";
  if (mode === "space") return `${deg} ${field}`;
  if (mode === "comma") return `${deg}, ${field}`;
  return `${deg} in ${field}`;
}

/**
 * Education date line.
 * A finished range stays a range. An open enrollment ends at Present.
 * A target date on an unfinished record is prefixed with Expected.
 */
export function formatEducationDates(education: {
  startDate?: string | null;
  graduationDate?: string | null;
  endDate?: string | null;
  status?: string | null;
}): string {
  const start = education.startDate?.trim() ?? "";
  const end = (education.graduationDate || education.endDate)
    ?.replace(/^(?:expected|anticipated)\s+/i, "")
    .trim() ?? "";
  const status = education.status ?? "GRADUATED";
  if (start && end) return `${start} – ${end}`;
  if (start && status === "IN_PROGRESS") return `${start} – Present`;
  if (!start && end && status === "IN_PROGRESS") return `Expected ${end}`;
  if (end) return end;
  return start;
}

/** Short label for an unfinished education record. */
export function educationProgressLabel(education: {
  startDate?: string | null;
  graduationDate?: string | null;
  endDate?: string | null;
  status?: string | null;
}): "In Progress" | "Expected" | null {
  if (education.status !== "IN_PROGRESS") return null;
  const start = education.startDate?.trim() ?? "";
  const end = (education.graduationDate || education.endDate)?.trim() ?? "";
  if (!start && end) return "Expected";
  return "In Progress";
}

/** Parent institution with a constituent school in parentheses. */
export function formatSchoolName(
  school: string,
  subSchool?: string | null
): string {
  const parent = school.trim();
  const child = subSchool?.trim() || "";
  if (!parent) return child;
  if (!child) return parent;
  if (parent.toLowerCase().includes(child.toLowerCase())) return parent;
  return `${parent} (${child})`;
}

/** Case-insensitive dedupe of contact strings; preserves first-seen order. */
export function dedupeContactItems(
  items: Array<string | null | undefined>
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of items) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(trimmed);
    }
  }

  return result;
}

type ProfileContactExtras = {
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  portfolioUrl?: string | null;
  websiteUrl?: string | null;
  linkedWebsite?: string | null;
  linkedGithub?: string | null;
  linkedLinkedin?: string | null;
};

const COMMON_NON_US_COUNTRIES = new Set([
  "uk", "united kingdom", "england", "scotland", "wales", "great britain",
  "canada", "germany", "france", "australia", "new zealand", "japan",
  "india", "singapore", "ireland", "netherlands", "sweden", "switzerland",
  "brazil", "mexico", "spain", "italy", "israel", "china", "taiwan",
  "south korea", "korea", "poland", "austria", "belgium", "denmark",
  "finland", "norway", "us", "usa", "united states"
]);

const COMMON_CANADIAN_PROVINCES = new Set([
  "ab", "bc", "mb", "nb", "nl", "ns", "nt", "nu", "on", "pe", "qc", "sk", "yt",
  "alberta", "british columbia", "manitoba", "new brunswick", "newfoundland",
  "nova scotia", "ontario", "quebec", "saskatchewan"
]);

const CODE_FILE_EXTENSIONS = new Set([
  "js", "ts", "jsx", "tsx", "py", "java", "cpp", "c", "h", "cs", "rb", "go",
  "rs", "php", "sh", "html", "css", "json", "xml", "yaml", "yml", "md", "sql"
]);

/**
 * Validates whether a candidate string is an authentic geographic or remote location
 * rather than a serialized skill, programming language, or technical keyword.
 */
export function isAuthenticLocation(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 60) return false;

  // Reject code, skill tokens, and formatting symbols
  if (/[<>{}()[\];*+&_=$^%#~/\\]/.test(trimmed)) return false;

  const lower = trimmed.toLowerCase();

  // 1. Standalone workplace/geographic modes
  if (/^(remote|hybrid|on-site|onsite|worldwide|relocating)$/i.test(lower)) {
    return true;
  }
  if (/^remote,\s*(us|usa|worldwide|uk|ca|eu)$/i.test(lower)) {
    return true;
  }

  // 2. Metropolitan area descriptors
  if (/\b(metro\s+area|greater\s+area|bay\s+area|area|region)\b/i.test(lower)) {
    if (!/\b(data|cloud|systems?|software|devops|full\s*stack|backend|frontend)\b/i.test(lower)) {
      return true;
    }
  }

  // 3. Comma-separated location: e.g. "City, State" or "City, Country"
  if (trimmed.includes(",")) {
    const parts = trimmed.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 3 || parts.length < 2) return false;

    const last = parts[parts.length - 1]!.toLowerCase();
    const isStateCode = /^[a-z]{2}$/i.test(last) && VALID_STATE_CODES.has(last.toUpperCase());
    const isUsState = last in US_STATES_AND_TERRITORIES;
    const isCountry = COMMON_NON_US_COUNTRIES.has(last);
    const isCanadianProvince = COMMON_CANADIAN_PROVINCES.has(last);

    if (isStateCode || isUsState || isCountry || isCanadianProvince) {
      const first = parts[0]!;
      if (/^[a-zA-Z\s.-]+$/.test(first)) {
        if (!/\b(python|react|java|docker|kubernetes|aws|sql|linux|git|node|angular|vue|c\+\+|rust|golang|ruby)\b/i.test(first)) {
          return true;
        }
      }
    }
    return false;
  }

  // 4. Standalone state or country
  if (lower in US_STATES_AND_TERRITORIES || COMMON_NON_US_COUNTRIES.has(lower)) {
    return true;
  }

  // 5. Text extraction fallback from location normalizer
  const extracted = extractLocationFromText(trimmed);
  if (extracted.city && (extracted.state || extracted.isRemote)) {
    return true;
  }

  return false;
}

/**
 * Validates whether a candidate string is an authentic resume contact header item:
 * email address, phone number, verified URL/profile link, or geographic location.
 * Drops rogue technical skills, tools, and libraries.
 */
export function isAuthenticContactItem(item: string | null | undefined): boolean {
  if (!item) return false;
  const trimmed = item.trim();
  if (!trimmed) return false;

  // 1. Authentic Email
  if (/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(trimmed)) {
    return true;
  }

  // 2. Authentic Phone Number
  const digits = trimmed.replace(/\D/g, "");
  const letters = trimmed.replace(/[^a-zA-Z]/g, "");
  if (
    digits.length >= 7 &&
    digits.length <= 15 &&
    (letters.length === 0 || /^ext\.?\s*\d+$/i.test(letters) || /^x\s*\d+$/i.test(letters))
  ) {
    if (/^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]*(?:\s*(?:ext|x)\.?\s*\d+)?$/i.test(trimmed)) {
      return true;
    }
  }

  // 3. Authentic Web URL / Profile link
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  if (isVerifiedProfileUrl(withProtocol)) {
    try {
      const url = new URL(withProtocol);
      const host = url.hostname.toLowerCase();
      if (host.includes(".")) {
        const tld = host.split(".").pop() ?? "";
        if (tld && !CODE_FILE_EXTENSIONS.has(tld)) {
          if (!/[<>{}()[\];*]/.test(trimmed)) {
            if (isResumeHeaderLink(withProtocol)) {
              return true;
            }
          }
        }
      }
    } catch {
      // Not a valid URL
    }
  }

  // 4. Authentic Geographic Location
  if (isAuthenticLocation(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Sanitizes a composite contact header line, removing any orphaned technical skills,
 * tools, libraries, or invalid metadata that may have bled into the contact bar.
 */
export function sanitizeResumeContactLine(
  contactLine: string | null | undefined
): string {
  if (!contactLine) return "";
  const trimmed = contactLine.trim();
  if (!trimmed) return "";

  const delimiter = trimmed.includes(" • ")
    ? " • "
    : trimmed.includes(" | ")
      ? " | "
      : trimmed.includes(" · ")
        ? " · "
        : trimmed.includes("\n")
          ? "\n"
          : null;

  const rawElements = delimiter
    ? trimmed.split(delimiter)
    : [trimmed];

  const validElements = dedupeContactItems(
    rawElements
      .map((item) => item.trim())
      .filter((item) => isAuthenticContactItem(item))
  );

  return validElements.join(" • ");
}

/**
 * Builds a single contact header line from profile fields.
 * Validates each item strictly against authentic email, phone, URL, and location patterns.
 */
export function buildResumeContactLine(profile: {
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  links?: Array<{ name?: string | null; url: string }> | null;
  [key: string]: unknown;
}): string {
  const extras = profile as ProfileContactExtras;
  const linkUrls = (profile.links ?? [])
    .map((link) => link.url)
    .filter((url) => isVerifiedProfileUrl(url))
    .filter((url) => isResumeHeaderLink(url))
    .filter((url) => {
      const kind = categorizeProfileUrl(url);
      return (
        kind === "github" ||
        kind === "linkedin" ||
        kind === "portfolio" ||
        kind === "website"
      );
    });

  const candidates = [
    profile.email,
    profile.phone,
    profile.location,
    cleanDisplayUrl(extras.linkedinUrl ?? extras.linkedLinkedin),
    cleanDisplayUrl(extras.githubUrl ?? extras.linkedGithub),
    cleanDisplayUrl(
      extras.portfolioUrl || extras.websiteUrl || extras.linkedWebsite
    ),
    ...linkUrls.map((url) => cleanDisplayUrl(url)),
  ];

  const verified = candidates
    .map((item) => item?.trim())
    .filter((item): item is string => Boolean(item) && isAuthenticContactItem(item));

  return dedupeContactItems(verified).join(" • ");
}

export const KNOWN_PROJECT_ACRONYMS: Record<string, string> = {
  api: "API",
  cli: "CLI",
  ui: "UI",
  ux: "UX",
  rest: "REST",
  ai: "AI",
  ml: "ML",
  db: "DB",
  sql: "SQL",
  sla: "SLA",
  kv: "KV",
  smtp: "SMTP",
  saas: "SaaS",
  p2p: "P2P",
  iot: "IoT",
  sdk: "SDK",
  "ci/cd": "CI/CD",
  "ci-cd": "CI/CD",
  cicd: "CI/CD",
  http: "HTTP",
  https: "HTTPS",
  json: "JSON",
  xml: "XML",
  css: "CSS",
  html: "HTML",
  aws: "AWS",
  gcp: "GCP",
  llm: "LLM",
  url: "URL",
  etl: "ETL",
  rpc: "RPC",
  grpc: "gRPC",
  graphql: "GraphQL",
};

const TITLE_STOP_WORDS = new Set([
  "and",
  "or",
  "for",
  "of",
  "in",
  "to",
  "on",
  "at",
  "with",
  "by",
  "a",
  "an",
  "the",
]);

/**
 * Normalizes raw repository slugs, GitHub/GitLab URLs, or project names into clean Title Case
 * while preserving acronyms (API, CLI, KV, CI/CD, etc.) and camelCase/PascalCase brand names.
 */
export function normalizeProjectName(
  rawNameOrUrl: string | null | undefined
): string {
  if (!rawNameOrUrl) return "";
  let text = rawNameOrUrl.trim();
  if (!text) return "";

  // 1. Strip URL/Path bloat: protocol, query, hashes, .git extension, and domains
  text = text.replace(/^https?:\/\//i, "");
  text = text.replace(/[?#].*$/, "");
  text = text.replace(/\.git$/i, "");
  text = text.replace(/\/(?:tree|blob|archive|releases|raw)\/.*$/i, "");

  // If it's a domain path (e.g. github.com/owner/repo or gitlab.com/owner/repo)
  if (/^(?:www\.)?(?:github\.com|gitlab\.com|bitbucket\.org)\//i.test(text)) {
    text = text.replace(
      /^(?:www\.)?(?:github\.com|gitlab\.com|bitbucket\.org)\//i,
      ""
    );
    const segments = text.split("/").filter(Boolean);
    if (segments.length > 0) {
      text = segments[segments.length - 1]!;
    }
  } else if (!text.includes(" ") && text.includes("/")) {
    // If it's a slug path like "owner/repo-name"
    const segments = text.split("/").filter(Boolean);
    if (segments.length > 0) {
      text = segments[segments.length - 1]!;
    }
  }

  // Strip trailing slashes and periods
  text = text.replace(/[\/.]+$/, "");

  // 2. Pre-normalize CI/CD before hyphen splitting
  text = text.replace(/\bci[-_]+cd\b/gi, "CI/CD");

  // 3. De-kebab & De-snake:
  // Convert underscores and multiple hyphens to spaces unless the text is already spaced and capitalized (e.g. "Real-Time").
  const isAlreadySpacedAndCased =
    text.includes(" ") &&
    /[A-Z]/.test(text) &&
    !text.includes("_") &&
    !/--/.test(text) &&
    !/[a-z]-[a-z]/.test(text);

  if (!isAlreadySpacedAndCased) {
    text = text.replace(/[_-]+/g, " ");
  }

  // Clean redundant whitespace
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "";

  // 4. Smart Title-Casing & Acronym Preservation
  const normalizedTokens = tokens.map((token, index) => {
    // Preserve intact CI/CD
    if (/^ci\/cd$/i.test(token)) {
      return "CI/CD";
    }

    const lower = token.toLowerCase();

    // Check exact known acronyms
    if (KNOWN_PROJECT_ACRONYMS[lower]) {
      return KNOWN_PROJECT_ACRONYMS[lower]!;
    }

    // Preserve words with internal casing (e.g., FastAPI, PyTorch, GraphQL, Next.js)
    if (/[a-z][A-Z]/.test(token)) {
      return token;
    }

    // Preserve short all-caps words (2-4 chars, e.g., NASA, AWS)
    if (
      token.length >= 2 &&
      token.length <= 4 &&
      token === token.toUpperCase() &&
      /^[A-Z]+$/.test(token)
    ) {
      return token;
    }

    // Handle small stop words if not first or last token
    if (index > 0 && index < tokens.length - 1 && TITLE_STOP_WORDS.has(lower)) {
      return lower;
    }

    // Standard Title-Case
    return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
  });

  return normalizedTokens.join(" ");
}

/**
 * Extracts the core base name of a project by stripping taglines, subtitles,
 * and descriptors separated by dashes, hyphens, colons, or pipes.
 * e.g., "SafeHaven – Disguised Platform" -> "SafeHaven"
 * e.g., "Embergency - Wildfire Response Tool" -> "Embergency"
 */
export function getProjectBaseName(name: string | null | undefined): string {
  if (!name) return "";
  const parts = name.trim().split(/\s*[-–—:|]\s*/);
  const first = parts[0]?.trim() || "";
  return first || name.trim();
}

export const TITLE_CASE_LOWERCASE_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "but",
  "by",
  "en",
  "etc",
  "etc.",
  "for",
  "from",
  "if",
  "in",
  "into",
  "nor",
  "of",
  "off",
  "on",
  "onto",
  "or",
  "per",
  "so",
  "the",
  "to",
  "unto",
  "up",
  "upon",
  "via",
  "vs",
  "vs.",
  "with",
  "yet",
]);

/**
 * Capitalizes the first letters of words in status pills following title casing,
 * keeping minor words (such as "of", "and", "etc.") lowercase unless leading.
 */
export function formatStatusPillTitle(text: string): string {
  if (!text) return text ?? "";

  const tokens = text.split(/(\s+)/);
  let hasSeenLeadingToken = false;

  return tokens
    .map((token) => {
      if (/^\s+$/.test(token)) {
        return token;
      }

      const isFirstToken = !hasSeenLeadingToken;
      hasSeenLeadingToken = true;

      if (!/[a-zA-Z]/.test(token)) {
        return token;
      }

      const cleanWord = token
        .toLowerCase()
        .replace(/^[^a-zA-Z]+|[^a-zA-Z0-9.]+$/g, "");

      if (!isFirstToken && TITLE_CASE_LOWERCASE_WORDS.has(cleanWord)) {
        return token.toLowerCase();
      }

      return token.replace(/[a-zA-Z]/, (c) => c.toUpperCase());
    })
    .join("");
}

