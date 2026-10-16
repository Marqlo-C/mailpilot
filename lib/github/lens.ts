import { normalizeProjectName } from "@/lib/utils/format";
import type { GitHubRawRepo, ProjectItem } from "./schema.ssot";

/**
 * Normalizes a GitHub handle, profile URL, or repository link into a clean handle.
 */
export function normalizeGitHubUsername(usernameOrUrl: string): string {
  const raw = usernameOrUrl.trim().replace(/\/+$/, "");
  if (!raw) throw new Error("GitHub username or URL is required");

  try {
    if (raw.includes("github.com")) {
      const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0]) return parts[0].replace(/^@/, "");
    }
  } catch {
    // Fall back to handle extraction
  }

  return raw.replace(/^@/, "").split("/")[0] ?? raw;
}

/**
 * Regex identifying low-signal chores that must be excluded from technical bullets.
 */
export const LOW_SIGNAL_CHORE_REGEX =
  /(?:set(?:ting)?\s+up|configur(?:ed?|ing)|creat(?:ed?|ing))\s+(?:environment\s+variables?|\.env|local\s+config(?:uration)?|ports?|local\s+tokens?)|(?:setting\s+ports?)|(?:filesystem\s+hygiene|organiz(?:ed?|ing)\s+assets|creat(?:ed?|ing)\s+folders?|clean(?:ed?|ing)?\s+up\s+repositor(?:y|ies)?)|(?:screen\s*recordings?|screenshots?|demo\s+scripts?|demonstration\s+artifacts?)|(?:install(?:ed?|ing)\s+dependencies|configur(?:ed?|ing)\s+code\s+linters?|code\s+formatting|eslint|prettier)/i;

/**
 * Sanitizes a single bullet string by:
 * 1. Stripping leading bullet markers (•, -, *, etc.)
 * 2. Stripping leading/trailing wrapping quotes
 * 3. Balancing/stripping unclosed backticks while preserving matched pairs
 * 4. Stripping leading/trailing quotes from code symbols, file paths, and package names
 * 5. Cleaning up orphan punctuation marks (orphan commas before periods, double periods, etc.)
 * 6. Ensuring proper terminal punctuation
 */
export function sanitizeBulletString(bullet: string): string {
  let cleaned = bullet.trim();
  if (!cleaned) return "";

  // 1. Strip leading bullet markers
  cleaned = cleaned.replace(/^[\s•\-\*]+\s*/, "");

  // 2. Strip leading and trailing quotes from the whole bullet
  cleaned = cleaned.replace(/^["'“‘]+|["'”’]+$/g, "").trim();

  // 3. Balance unclosed or mismatched backticks
  const backtickCount = (cleaned.match(/`/g) || []).length;
  if (backtickCount % 2 !== 0) {
    const placeholder = "___BT_PAIR___";
    const pairs: string[] = [];
    const masked = cleaned.replace(/`([^`\n]+)`/g, (_m, content) => {
      pairs.push(content);
      return `${placeholder}${pairs.length - 1}___`;
    });
    // Strip remaining orphan backticks
    const stripped = masked.replace(/`/g, "");
    // Restore matched pairs
    cleaned = stripped.replace(
      new RegExp(`${placeholder}(\\d+)___`, "g"),
      (_m, idx) => `\`${pairs[Number(idx)]}\``
    );
  }

  // 4. Strip quotes around code symbols, file paths, and package names (e.g. 'express', "FastAPI", 'src/app')
  cleaned = cleaned.replace(
    /(^|[\s(])["'“‘](@?[a-zA-Z0-9_\-./]+)["'”’]?(?=[\s),.;:!?]|$)/g,
    "$1$2"
  );

  // If stray unclosed double quotes remain, remove them
  const doubleCount = (cleaned.match(/"/g) || []).length;
  if (doubleCount % 2 !== 0) {
    cleaned = cleaned.replace(/"/g, "");
  }

  // If stray unclosed single quotes (not contractions like it's, don't, user's) remain, clean them
  const nonContractionSingles = cleaned.match(/(?:^|\s)'|'(?:\s|[.,;:!?]|$)/g);
  if (nonContractionSingles && nonContractionSingles.length % 2 !== 0) {
    cleaned = cleaned.replace(/(^|\s)'|'(?=[.,;:!?]|\s|$)/g, "$1");
  }

  // 5. Clean up orphan punctuation marks
  cleaned = cleaned
    .replace(/\s+([.,;:!?])/g, "$1") // Remove space before punctuation
    .replace(/([,:;])\s*\./g, ".")   // Orphan comma/colon before period -> period
    .replace(/\s*-\s*\./g, ".")      // Orphan dash before period -> period
    .replace(/\.{2,}(?!\.)/g, ".")   // Duplicate periods (not ellipsis) -> single period
    .replace(/[,:;]{2,}/g, (m) => m[0]!) // Duplicate commas/colons -> single
    .trim();

  // 6. Ensure terminal punctuation
  if (cleaned && !/[.!?]$/.test(cleaned)) {
    cleaned += ".";
  }

  return cleaned;
}

/**
 * Transforms a raw GitHub repository and its technical analysis into a validated ProjectItem.
 * Strictly isolates repository description from bullets and eliminates low-signal chores.
 */
export function adaptRepoToProjectItem(params: {
  repo: GitHubRawRepo;
  bullets: string[];
  inferredTechnologies?: string[];
  manifestTechnologies?: string[];
}): ProjectItem {
  const { repo, bullets, inferredTechnologies = [], manifestTechnologies = [] } = params;

  const mergedTechs = [
    ...new Set([...inferredTechnologies, ...manifestTechnologies]),
  ].filter(Boolean);

  const rawDescription = repo.description?.trim() || "";
  const normalizedDesc = rawDescription.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Sanitize all bullets
  const sanitizedBullets = (bullets || [])
    .map(sanitizeBulletString)
    .filter(Boolean);

  // Strictly enforce separation: filter out low-signal chores and any bullets that duplicate or wrap repo.description
  const filteredBullets = sanitizedBullets.filter((bullet) => {
    // 1. Omit low-signal developer setup chores
    if (LOW_SIGNAL_CHORE_REGEX.test(bullet)) {
      return false;
    }

    // 2. Omit duplicate or echo of repo description
    if (!normalizedDesc) return true;
    const bulletNorm = bullet.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (bulletNorm === normalizedDesc) return false;

    const cleanRepoName = repo.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (
      bulletNorm.includes(normalizedDesc) &&
      (bulletNorm.startsWith(cleanRepoName) ||
        bulletNorm.startsWith(`engineeredandmaintained${cleanRepoName}`) ||
        bulletNorm.startsWith(`implementedcorecomputationalpipelinefor${cleanRepoName}`))
    ) {
      return false;
    }

    return true;
  });

  return {
    name: normalizeProjectName(repo.name),
    description: repo.description || "Open-source repository on GitHub",
    link: repo.html_url,
    technologies: mergedTechs.length > 0 ? mergedTechs : manifestTechnologies,
    bullets: filteredBullets,
    origin: "GITHUB_INFERRED",
  };
}
