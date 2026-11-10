/**
 * GitHub Lens: Ingestion normalization, NLP bullet synthesis, and project adaptation.
 */

import { normalizeProjectName } from "@/lib/utils/format";
import {
  type GitHubRawRepo,
  type ProjectItem,
} from "./github.schema";
import { dedupeTools } from "./tools";
import { verifyAndScrubBulletMetrics } from "./metrics";
import {
  harmonizeCoordinatedVerbs,
  unrollPermissivePhrasing,
  unrollRoboticHeadingPrefix,
  diversifyLeadingVerbs,
} from "./nlp/verb-harmonizer";
import {
  auditBulletSubstantiveness,
  cleanTrivialPrimitives,
  deduplicateOrSynthesizeBullets,
  isUngroundedHallucination,
  stripFileSystemArtifacts,
  type ArchitecturalDimension,
  type AuditedBullet,
} from "./nlp/bullet-auditor";

export * from "./nlp/verb-harmonizer";
export * from "./nlp/bullet-auditor";

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
 * Sanitizes a single bullet string by stripping markers, quotes, math syntax,
 * file paths, and unrolling robotic headings.
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
    const stripped = masked.replace(/`/g, "");
    cleaned = stripped.replace(
      new RegExp(`${placeholder}(\\d+)___`, "g"),
      (_m, idx) => `\`${pairs[Number(idx)]}\``
    );
  }

  // 4. Strip LaTeX math notation and rogue math symbols
  cleaned = cleaned
    .replace(/\\text\s*\{([^}]+)\}/g, "$1")
    .replace(/\\(?:approx|sim)\b/g, "~")
    .replace(/\\le\b/g, "<=")
    .replace(/\\ge\b/g, ">=")
    .replace(/\\pm\b/g, "+/-")
    .replace(/\\times\b/g, "x")
    .replace(/\$([^$]+)\$/g, "$1")
    .replace(/\$\s*(\d+(?:\.\d+)?)\s*(ms|s|sec|min|hr|kb|mb|gb|tb|fps|qps|rps|hz|khz|mhz|ghz|px|%)\b/gi, "$1$2")
    .replace(/(\d+)\s+(ms|s|sec|min|hr|kb|mb|gb|tb|fps|qps|rps)\b/gi, "$1$2")
    .replace(/~\s*(\d)/g, "~$1");

  cleaned = cleaned.replace(/(^|\s)\$(\s|[.,;:!?]|$)/g, "$1$2");

  // 5. Strip low-signal physical source code filenames and directory paths
  cleaned = stripFileSystemArtifacts(cleaned);

  // 6. Fix stranded prepositions resulting from removals
  cleaned = cleaned.replace(
    /\b(?:through|via|across|in|from|within|inside|to|under|at)\s+(to\s+[a-z]+)/gi,
    "$1"
  );
  cleaned = cleaned.replace(/\s{2,}/g, " ");

  // 7. Unroll robotic heading-prefix templates into direct active verbs
  cleaned = unrollRoboticHeadingPrefix(cleaned);

  // 8. Normalize phonetic indefinite articles (e.g. "a HTTP" -> "an HTTP")
  cleaned = cleaned.replace(
    /\b([Aa])\s+(HTTP|HTML|HTTPS|SQL|SSRF|SLA|SSH|SDK|API|AST|IPC|OS|RFC)\b/g,
    "$1n $2"
  );

  // 8b. Normalize bare infinitives after verbs like utilizing/leveraging/using
  cleaned = cleaned.replace(
    /\b(?:utilizing|leveraging|using)\s+to\s+([a-z]+)\b/gi,
    "to $1"
  );

  // 8c. Fix malformed participles and typos
  cleaned = cleaned.replace(/\bto\s+([a-z]+)\s+and\s+ading\b/gi, "to $1 and add");
  cleaned = cleaned.replace(/\bading\b/gi, "adding");

  // 8d. Clean singular indefinite article before plural nouns
  cleaned = cleaned.replace(
    /\ba\s+((?:[a-zA-Z0-9_\-]+\s+)*(?:text\s+files|markdown\s+documents|JSON\s+records|CSV\s+data\s+files|data\s+files|files|documents|records|datasets))\b/gi,
    "$1"
  );

  // 9. Strip quotes around code symbols, file paths, and package names
  cleaned = cleaned.replace(
    /(^|[\s(])["'“‘](@?[a-zA-Z0-9_\-./]+)["'”’]?(?=[\s),.;:!?]|$)/g,
    "$1$2"
  );

  const doubleCount = (cleaned.match(/"/g) || []).length;
  if (doubleCount % 2 !== 0) {
    cleaned = cleaned.replace(/"/g, "");
  }

  const nonContractionSingles = cleaned.match(/(?:^|\s)'|'(?:\s|[.,;:!?]|$)/g);
  if (nonContractionSingles && nonContractionSingles.length % 2 !== 0) {
    cleaned = cleaned.replace(/(^|\s)'|'(?=[.,;:!?]|\s|$)/g, "$1");
  }

  // 9b. Clean orphan commas before infinitives
  cleaned = cleaned.replace(/,\s+(to\s+[a-z]+)/gi, " $1");

  // 10. Harmonize coordinated verb participles into past tense
  cleaned = harmonizeCoordinatedVerbs(cleaned);

  // 11. Clean up orphan punctuation marks, commas, and dangling prepositions/conjunctions
  cleaned = cleaned
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/([,:;])\s*\./g, ".")
    .replace(/\s*-\s*\./g, ".")
    .replace(/\.{2,}(?!\.)/g, ".")
    .replace(/[,:;]{2,}/g, (m) => m[0]!)
    .replace(/,\s*,/g, ",")
    .trim();

  // 11b. Iteratively strip dangling trailing conjunctions/prepositions before terminal punctuation
  let prevCleaned = "";
  while (prevCleaned !== cleaned) {
    prevCleaned = cleaned;
    cleaned = cleaned.replace(/\s+and\s+[a-z]+(?:ed|d|t|ing)\s*([.,;:!?]+)$/i, "$1");
    cleaned = cleaned.replace(
      /\s+(?:and|or|but|nor|so|yet|with|to|for|via|by|in|at|from|when|while|as|because)\s*([.,;:!?]+)$/i,
      "$1"
    );
    cleaned = cleaned.replace(/([,:;])\s*([.!?])/g, "$2");
  }

  // 12. Ensure terminal punctuation
  if (cleaned && !/[.!?]$/.test(cleaned)) {
    cleaned += ".";
  }

  return cleaned;
}

/**
 * Transforms a raw GitHub repository and its technical analysis into a validated ProjectItem.
 */
export function adaptRepoToProjectItem(params: {
  repo: GitHubRawRepo;
  bullets: string[];
  inferredTechnologies?: string[];
  manifestTechnologies?: string[];
  scaleBudget?: { minBullets: number; maxBullets: number };
  repoContextText?: string;
}): ProjectItem {
  const {
    repo,
    bullets,
    inferredTechnologies = [],
    manifestTechnologies = [],
    scaleBudget = { minBullets: 3, maxBullets: 14 },
    repoContextText,
  } = params;

  const mergedTechs = dedupeTools([
    ...inferredTechnologies,
    ...manifestTechnologies,
  ]);

  const rawDescription = repo.description?.trim() || "";
  const normalizedDesc = rawDescription.toLowerCase().replace(/[^a-z0-9]/g, "");
  const contextCorpus =
    repoContextText ||
    `${repo.name} ${repo.description ?? ""} ${manifestTechnologies.join(" ")} ${inferredTechnologies.join(" ")}`;

  // 1. Clean, unroll, and audit all bullets
  const auditedPool: AuditedBullet[] = [];
  const rawBullets = bullets || [];

  for (let i = 0; i < rawBullets.length; i++) {
    const raw = rawBullets[i];
    let bullet = sanitizeBulletString(raw);
    if (!bullet) continue;

    bullet = unrollPermissivePhrasing(bullet);
    bullet = cleanTrivialPrimitives(bullet);

    const scrubbedMetric = verifyAndScrubBulletMetrics({
      bullet,
      sourceText: contextCorpus,
    });
    bullet = scrubbedMetric.bullet;
    bullet = sanitizeBulletString(bullet);

    if (isUngroundedHallucination(bullet, contextCorpus)) {
      continue;
    }

    if (normalizedDesc) {
      const bulletNorm = bullet.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (bulletNorm === normalizedDesc) continue;

      const cleanRepoName = repo.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (
        bulletNorm.includes(normalizedDesc) &&
        (bulletNorm.startsWith(cleanRepoName) ||
          bulletNorm.startsWith(`engineeredandmaintained${cleanRepoName}`) ||
          bulletNorm.startsWith(`implementedcorecomputationalpipelinefor${cleanRepoName}`))
      ) {
        continue;
      }
    }

    const audited = auditBulletSubstantiveness(bullet, contextCorpus);
    if (!audited.isChore) {
      auditedPool.push({
        ...audited,
        originalIndex: i,
      });
    }
  }

  // 2. Cross-bullet semantic deduplication / synthesis
  const deduplicated = deduplicateOrSynthesizeBullets(
    auditedPool,
    scaleBudget.maxBullets
  );

  // 3. Tournament selection: Domain-diverse multi-pass ranking
  const primaryCandidates = deduplicated
    .filter((item) => item.score >= 4.5)
    .sort((a, b) => b.score - a.score);

  const reserveCandidates = deduplicated
    .filter((item) => item.score < 4.5 && item.score >= 2.0)
    .sort((a, b) => b.score - a.score);

  const chosen: AuditedBullet[] = [];
  const chosenIndices = new Set<number>();
  const representedDimensions = new Set<ArchitecturalDimension>();

  // Pass 1 (Breadth): Pick highest candidate per dimension
  for (const item of primaryCandidates) {
    if (chosen.length >= scaleBudget.maxBullets) break;
    const dim = item.dimension ?? "COMPUTATIONAL_LOGIC";
    if (!representedDimensions.has(dim)) {
      chosen.push(item);
      chosenIndices.add(item.originalIndex ?? 0);
      representedDimensions.add(dim);
    }
  }

  // Pass 2 (Depth): Fill remaining slots with remaining primary candidates
  for (const item of primaryCandidates) {
    if (chosen.length >= scaleBudget.maxBullets) break;
    const idx = item.originalIndex ?? 0;
    if (!chosenIndices.has(idx)) {
      chosen.push(item);
      chosenIndices.add(idx);
    }
  }

  // Pass 3 (Capacity Backfill): Backfill valid substantive reserve candidates
  while (chosen.length < scaleBudget.maxBullets && reserveCandidates.length > 0) {
    const next = reserveCandidates.shift()!;
    if (next.score >= 3.0 || chosen.length < scaleBudget.minBullets) {
      chosen.push(next);
    }
  }

  chosen.sort((a, b) => (a.originalIndex ?? 0) - (b.originalIndex ?? 0));

  const finalBullets = chosen.map((item) => item.bullet);
  const diversifiedBullets = diversifyLeadingVerbs(finalBullets);

  return {
    name: normalizeProjectName(repo.name),
    description: repo.description || "Open-source repository on GitHub",
    link: repo.html_url,
    technologies: mergedTechs.length > 0 ? mergedTechs : manifestTechnologies,
    bullets: diversifiedBullets.slice(0, scaleBudget.maxBullets),
    origin: "GITHUB_INFERRED",
  };
}
