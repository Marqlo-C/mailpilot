import { normalizeProjectName } from "@/lib/utils/format";
import {
  ALL_FILE_EXTENSIONS_SET,
  UNIVERSAL_DIRECTORY_ROOTS,
  type GitHubRawRepo,
  type ProjectItem,
} from "./schema.ssot";
import { dedupeTools } from "./tools";
import { detectMetric } from "@/lib/validations/profile";

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
 * Covers basic filesystem hygiene, demo recordings, linters, generic PaaS push-to-deploy,
 * and raw codebase language percentage recitations.
 */
export const LOW_SIGNAL_CHORE_REGEX =
  /(?:set(?:ting)?\s+up|configur(?:ed?|ing)|creat(?:ed?|ing))\s+(?:environment\s+variables?|\.env|local\s+config(?:uration)?|ports?|local\s+tokens?)|(?:setting\s+ports?)|(?:filesystem\s+hygiene|organiz(?:ed?|ing)\s+assets|creat(?:ed?|ing)\s+folders?|clean(?:ed?|ing)?\s+up\s+repositor(?:y|ies)?)|(?:screen\s*recordings?|screenshots?|demo\s+scripts?|demonstration\s+artifacts?)|(?:install(?:ed?|ing)\s+dependencies|configur(?:ed?|ing)\s+code\s+linters?|code\s+formatting|eslint|prettier)|(?:\b(?:vercel|netlify|render|heroku)\b.*(?:automatic\s+redeploy|push(?:es)?\s+to\s+`?main`?|`?main`?\s+branch|`?main`?\s+(?:branch\s+)?push(?:es)?))|(?:\b\d{1,3}%\s+of\s+the\s+codebase\s+written\s+in\b)|(?:(?:updat(?:ed?|ing)|wrot(?:e|ing)|maintain(?:ed?|ing))\s+(?:documentation|readme(?:\.md)?|docs?|setup\s+guide(?:lines?)?))/i;

const KNOWN_FRAMEWORKS = new Set([
  "node.js",
  "next.js",
  "nuxt.js",
  "vue.js",
  "express.js",
  "three.js",
  "d3.js",
  "chart.js",
  "react.js",
  "angular.js",
  "ember.js",
  "electron.js",
  "rxjs",
  "socket.io",
  "fabric.js",
  "p5.js",
  "pixi.js",
  "moment.js",
  "day.js",
]);

const DIR_ROOT_PATTERN = UNIVERSAL_DIRECTORY_ROOTS.join("|");

function isCodeFilename(token: string): boolean {
  const clean = token.toLowerCase().replace(/[`"'“‘”’(),]/g, "").trim();
  if (KNOWN_FRAMEWORKS.has(clean)) return false;

  const dotIdx = clean.lastIndexOf(".");
  if (dotIdx === -1) return false;
  const ext = clean.slice(dotIdx + 1);

  return ALL_FILE_EXTENSIONS_SET.has(ext);
}

/**
 * Universal file system and directory artifact scrubber.
 * Strips:
 * 1. Directory paths (e.g., 'to src/data/', 'in app/api/', 'under pkg/storage/')
 * 2. Raw file extension mentions (e.g. '.txt files' -> 'text files')
 * 3. Physical code/script filenames (e.g. 'in connect4.py', 'from thread.py')
 * 4. Stranded prepositions and orphan punctuation.
 */
export function stripFileSystemArtifacts(bullet: string): string {
  let text = bullet;

  // 1. Normalize raw data file extension phrases: `.txt files` -> `text files`, `.json files` -> `JSON files`
  text = text.replace(/`?\.([a-zA-Z0-9]+)`?\s+files?\b/gi, (_m, ext) => {
    const lower = ext.toLowerCase();
    if (lower === "txt") return "text files";
    if (lower === "md") return "markdown documents";
    if (lower === "csv" || lower === "tsv") return `${lower.toUpperCase()} data files`;
    if (lower === "json" || lower === "yaml" || lower === "yml") return `${lower.toUpperCase()} records`;
    return `${ext.toUpperCase()} files`;
  });

  // 1b. Bracketed dynamic route filenames: e.g. `[fileId].js`, `[id].tsx`, `[slug].ts`
  text = text.replace(/`?\[[a-zA-Z0-9_\-]+\]\.[a-zA-Z0-9]+`?/g, "");

  // 2. Prepositional directory references: e.g. "to src/data/", "in app/components/", "from tests/fixtures/"
  text = text.replace(
    new RegExp(
      `\\b(?:to|in|into|inside|within|under|from|via)\\s+\`?@?(?:(?:\\.?\\/)?(?:${DIR_ROOT_PATTERN})\\/[a-zA-Z0-9_\\-\\.\\/]*)\`?`,
      "gi"
    ),
    ""
  );

  // 3. Parenthetical directory or filename references: (in connect4.py), (in src/data/), [script.ts]
  text = text.replace(
    new RegExp(
      `\\s*[\\(\\[](?:\\s*(?:in|inside|within|defined in|see|from)\\s+)?\`?@?(?:(?:\\.?\\/)?(?:${DIR_ROOT_PATTERN})\\/[a-zA-Z0-9_\\-\\.\\/]*|(?:[a-zA-Z0-9_\\-\\.]+\\/)*[a-zA-Z0-9_\\-\\.]+\\.[a-zA-Z0-9]+)\`?[\\)\\]]`,
      "gi"
    ),
    (match) => {
      const inner = match.replace(/[\(\)\[\]]/g, "").trim();
      const parts = inner.split(/\s+/);
      const last = parts[parts.length - 1] ?? "";
      if (KNOWN_FRAMEWORKS.has(last.toLowerCase().replace(/[`"'“‘”’(),]/g, ""))) return match;
      return "";
    }
  );

  // 4. Participle clauses referencing files:
  // e.g. ", implemented in connect4.py", "implemented in connect4.py", "defined in thread.py"
  text = text.replace(
    /(?:,\s*)?\b(?:implemented|defined|located|found|written|hosted|specified|authored|managed)\s+(?:in|inside|within)\s+`?@?(?:[a-zA-Z0-9_\-\.]+\/)*[a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9]+`?/gi,
    (match) => {
      const parts = match.trim().split(/\s+/);
      const last = parts[parts.length - 1] ?? "";
      return isCodeFilename(last) ? "" : match;
    }
  );

  // 5. Prepositional phrases with filenames joined by and/or/&, or single:
  // e.g. "in matchup_visualizer.py and eval_diagnostics.py", "in montecarlo.py", "from thread.py"
  text = text.replace(
    /\b(?:in|from|inside|within|via)\s+`?@?(?:[a-zA-Z0-9_\-\.]+\/)*[a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9]+`?(?:\s+(?:and|or|&)\s+`?@?(?:[a-zA-Z0-9_\-\.]+\/)*[a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9]+`?)*/gi,
    (match) => {
      const words = match.trim().split(/\s+/);
      const targets = words.slice(1).filter((w) => !/^(?:and|or|&)$/i.test(w));
      const hasCodeFiles = targets.some((t) => isCodeFilename(t));
      const hasFrameworks = targets.some((t) =>
        KNOWN_FRAMEWORKS.has(t.toLowerCase().replace(/[`"'“‘”’(),]/g, ""))
      );
      if (hasCodeFiles && !hasFrameworks) {
        return "";
      }
      return match;
    }
  );

  // 6. Standalone code filename mentions before punctuation or comma
  text = text.replace(
    /(^|\s)`?@?(?:[a-zA-Z0-9_\-\.]+\/)*[a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9]+`?(?=[\s,.;:!?]|$)/gi,
    (match) => {
      if (isCodeFilename(match.trim())) {
        return "";
      }
      return match;
    }
  );

  // 7. Standalone directory mentions (e.g. `src/data/`)
  text = text.replace(
    new RegExp(
      `(^|\\s)\`?@?(?:(?:\\.?\\/)?(?:${DIR_ROOT_PATTERN})\\/[a-zA-Z0-9_\\-\\.\\/]*)\`?(?=[\\s,.;:!?]|$)`,
      "gi"
    ),
    "$1"
  );

  // 8. Clean stranded prepositions resulting from removals (e.g. "adding text files to with one word" -> "adding text files with one word")
  text = text.replace(
    /\b(?:through|via|across|in|from|within|inside|to|into|under|at)\s+(with|for|by|where|and|or|to\s+[a-z]+)\b/gi,
    "$1"
  );

  // 8b. Clean stranded preposition immediately before punctuation (e.g. "matches using, reporting" -> "matches, reporting")
  text = text.replace(
    /\s*\b(?:using|via|in|from|through|with|by|under|at)\s*([,.;:!?])/gi,
    "$1"
  );

  // 8c. Clean orphan preposition at end of clause or sentence
  text = text.replace(/\s+\b(?:using|via|in|from|through|with|by|under|at)\s*$/gi, ".");

  // 8d. Clean stray spaces before punctuation (e.g. "matches , reporting" -> "matches, reporting")
  text = text.replace(/\s+([,.;:!?])/g, "$1");

  // 9. Collapse multi-spaces
  text = text.replace(/\s{2,}/g, " ");

  return text;
}

/**
 * Backwards-compatible alias for stripFileSystemArtifacts.
 */
export function stripFilenamePhrases(bullet: string): string {
  return stripFileSystemArtifacts(bullet);
}

/**
 * Unrolls permissive/spectator phrasing ("Allowed users to...") into Systems-Engine actions.
 */
export function unrollPermissivePhrasing(bullet: string): string {
  const match = bullet.match(
    /^(?:Allowed|Enabled|Permitted)\s+users\s+(?:to\s+)?([a-z]+)\s+(.+)$/i
  );
  if (!match) return bullet;

  const verb = match[1].toLowerCase();
  const rest = match[2].trim();

  if (verb === "create" || verb === "build" || verb === "generate") {
    const customMatch = rest.match(
      /^(?:a\s+)?custom\s+([a-zA-Z0-9_\-]+)(?:\s+(?:packs?|creator|pipeline|system|engine|workflow))?\s*(.*)$/i
    );
    if (customMatch) {
      const noun = customMatch[1].replace(/s$/, "");
      const remainder = customMatch[2] ? ` ${customMatch[2]}` : "";
      return `Engineered custom ${noun} creation${remainder}`;
    }
    return `Engineered ${rest}`;
  }

  if (verb === "upload" || verb === "import" || verb === "ingest") {
    return `Implemented ingestion pipelines for ${rest}`;
  }

  if (verb === "download" || verb === "export") {
    return `Automated export workflows for ${rest}`;
  }

  if (verb === "configure" || verb === "customize") {
    return `Architected customization options for ${rest}`;
  }

  if (verb === "manage" || verb === "organize") {
    return `Engineered management capabilities for ${rest}`;
  }

  if (verb === "view" || verb === "monitor" || verb === "track") {
    return `Instrumented monitoring and visualization for ${rest}`;
  }

  if (verb === "search" || verb === "query" || verb === "filter") {
    return `Engineered query and discovery mechanisms for ${rest}`;
  }

  return `Engineered ${rest}`;
}

/**
 * Cleans tutorial-level standard library built-in calls (e.g. setInterval, fetch)
 * so the bullet highlights the true architectural feature rather than basic syntax.
 */
export function cleanTrivialPrimitives(bullet: string): string {
  let cleaned = bullet;
  // If followed by a participle like ", triggering", preserve the comma
  cleaned = cleaned.replace(
    /\b(?:using|via)\s+(?:(?:javascript|python|node)['’]?s\s+)?(?:`?setinterval`?|`?settimeout`?)\s*(?:function|method)?(?:\s*,\s*|\s+)?(?=([a-z]+ing\b))/gi,
    ", "
  );
  cleaned = cleaned.replace(
    /\b(?:using|via)\s+(?:(?:javascript|python|node)['’]?s\s+)?(?:`?setinterval`?|`?settimeout`?)\s*(?:function|method)?(?:,\s*|\s+)?/gi,
    ""
  );
  cleaned = cleaned.replace(
    /\b(?:using|via)\s+(?:(?:javascript|node)['’]?s\s+)?(?:`?window\.`?|`?document\.`?)?(?:`?add(?:event)?listener`?)\s*(?:function|method)?(?:\s*,\s*|\s+)?(?=([a-z]+ing\b))/gi,
    ", "
  );
  cleaned = cleaned.replace(
    /\b(?:using|via)\s+(?:(?:javascript|node)['’]?s\s+)?(?:`?window\.`?|`?document\.`?)?(?:`?add(?:event)?listener`?)\s*(?:function|method)?(?:,\s*|\s+)?/gi,
    ""
  );
  cleaned = cleaned.replace(
    /\b(?:using|via)\s+(?:the\s+)?`?fetch\(\)?`?\s*(?:api|function|method)?(?:,\s*|\s+)?/gi,
    ""
  );
  cleaned = cleaned.replace(/,\s*,/g, ",");
  cleaned = cleaned.replace(/\s+([.,;:!?])/g, "$1");
  return cleaned.replace(/\s{2,}/g, " ").trim();
}

export type ArchitecturalDimension =
  | "COMPUTATIONAL_LOGIC"
  | "INTERFACE_INTERACTION"
  | "DATA_STORAGE"
  | "SECURITY_RELIABILITY"
  | "NETWORKING_PROTOCOLS"
  | "OBSERVABILITY_TELEMETRY";

export function detectArchitecturalDimension(bullet: string): ArchitecturalDimension {
  const bLower = bullet.toLowerCase();

  // 1. Security, Cryptography, Auth & Privacy
  if (
    /\b(?:aes-256|crypt(?:o|ography|ed|ographic)?|encryption|cipher|hash(?:ing|ed|es)?|sha-256|auth(?:enticat(?:ed|ion))?|jwt|(?:auth|bearer|session|csrf|access|refresh|api)\s*tokens?|credentials?|transient\s+storage|privacy|lock\s*acquisition|deadlock|race\s*condition|thread-safe|sanitiz(?:ed|ation))\b/i.test(
      bLower
    )
  ) {
    return "SECURITY_RELIABILITY";
  }

  // 2. Core Computational Logic, Algorithms, Decision Engines & Workflows
  if (
    /\b(?:minimax|alpha-beta|monte\s*carlo|search\s*tree|q-value|dqn|deep\s*q|heuristic|state\s*machine|algorithm(?:ic)?|matrix|matrices|vector|pathfinding|simulation|decision\s*engine|inference\s*router|fallback\s*hierarchy|pacing|hydration)\b/i.test(
      bLower
    )
  ) {
    return "COMPUTATIONAL_LOGIC";
  }

  // 3. User Interface, Visual Hierarchy, Interaction & Presentation
  if (
    /\b(?:ui|interface|interaction|frontend|components?|styling|layouts?|responsive|canvas|viewport|modals?|views?|screens?|animation(?:s)?|transitions?|render(?:ing|ed)?|css|tailwind|theme|theming|accessibility|a11y)\b/i.test(
      bLower
    )
  ) {
    return "INTERFACE_INTERACTION";
  }

  // 4. Data Persistence, Schemas, Caching & State Storage
  if (
    /\b(?:postgresql|postgres|mysql|sqlite|mongodb|mongo|prisma|orm|drizzle|redis|database|schemas?|migration(?:s)?|persist(?:ence|ed|ing)?|cached?|caching|gridfs|store|stored|indexing|indexed|buffer|replay\s*buffer|deep\s*copy(?:ing)?)\b/i.test(
      bLower
    )
  ) {
    return "DATA_STORAGE";
  }

  // 5. Networking, Protocols, Integration & Ingestion (including network resilience & circuit breakers)
  if (
    /\b(?:http|rest(?:ful)?|api|apis|websocket(?:s)?|socket\.io|grpc|rpc|pub\s*\/?\s*sub|pubsub|message\s*queue|webhook(?:s)?|scrap(?:ing|er|e)|stream(?:ing|ed|s)?|byte-range|network|telematics|circuit\s*breaker|rate\s*limit(?:ing|ed|er)?)\b/i.test(
      bLower
    )
  ) {
    return "NETWORKING_PROTOCOLS";
  }

  // 6. Observability, Telemetry, Benchmarking & Testing
  if (
    /\b(?:telemetry|logg(?:er|ing)|benchmark(?:s|ing|ed)?|metrics?|profil(?:er|ing|ed)?|ascii|diagnostics?|tests?|testing|pytest|jest|vitest|playwright|cypress|coverage|monitoring|loss\s*charts?|reward\s*charts?)\b/i.test(
      bLower
    )
  ) {
    return "OBSERVABILITY_TELEMETRY";
  }

  return "COMPUTATIONAL_LOGIC";
}

export interface AuditedBullet {
  bullet: string;
  score: number;
  isChore: boolean;
  hasMetric: boolean;
  originalIndex?: number;
  dimension?: ArchitecturalDimension;
}

/**
 * Audits the technical substantiveness of a bullet on a 0.0 to 10.0 scale.
 */
export function auditBulletSubstantiveness(bullet: string): AuditedBullet {
  if (LOW_SIGNAL_CHORE_REGEX.test(bullet)) {
    return {
      bullet,
      score: 0,
      isChore: true,
      hasMetric: false,
      dimension: detectArchitecturalDimension(bullet),
    };
  }

  let score = 4.0;
  const hasMetric = detectMetric(bullet);
  if (hasMetric) score += 2.0;

  // Architectural Signals (+1.5 each)
  if (
    /\b(?:concurren(?:t|cy)|thread(?:s|ing|ed)?|worker(?:s)?|stream(?:ing|ed|s)?|event\s*loop|async|await|parallel(?:ism)?|queue(?:s|d)?|pipeline(?:s)?|multiplex(?:ed|ing)?|sharded?|sharding|batch(?:ed|ing)?)\b/i.test(
      bullet
    )
  ) {
    score += 1.5;
  }

  if (
    /\b(?:algorithm(?:s|ic)?|tree(?:s)?|graph(?:s)?|heap(?:s)?|hash\s*map|cache|caching|cached|index(?:ing|ed|es)?|matrix|vector|state\s*machine|heurstic|ast|spatial|haversine|minimax|alpha-beta|monte\s*carlo|simulation|bitboard|ring\s*buffer)\b/i.test(
      bullet
    )
  ) {
    score += 1.5;
  }

  if (
    /\b(?:protocol(?:s)?|websocket(?:s)?|http\s*206|rest(?:ful)?|grpc|rpc|schema(?:s)?|persist(?:ence|ed|ing)?|migration(?:s)?|crypt(?:o|ography|ed)?|auth(?:enticat(?:ed|ion))?|sanitiz(?:ed|ation)|token(?:s)?|jwt|aes-256)\b/i.test(
      bullet
    )
  ) {
    score += 1.5;
  }

  if (
    /\b(?:test(?:s|ing|ed)?|coverage|pytest|jest|vitest|benchmark(?:s|ing|ed)?|profil(?:ing|ed|er)?|mock(?:s|ing)?|ci\/cd)\b/i.test(
      bullet
    )
  ) {
    score += 1.5;
  }

  if (
    /\b(?:next\.js|react|vue|svelte|fastapi|django|express|app\s*router|server\s*components?|state\s*management|lifecycle|router|routing)\b/i.test(
      bullet
    )
  ) {
    score += 1.5;
  }

  // Trivial Primitive mention penalty (-1.5)
  if (
    /\b(?:setinterval|settimeout|event\s*listener|localstorage|math\.random)\b/i.test(
      bullet
    )
  ) {
    score -= 1.5;
  }

  // Pure UI styling without logic penalty (-1.5)
  if (
    /\b(?:tailwind\s+css|css3?|styling|layouts?)\s+across\s+(?:[a-z,\s]+\s+)?screens?,\s+ensuring\s+seamless\b/i.test(
      bullet
    )
  ) {
    score -= 1.5;
  }

  // Trivial settings / preferences chore penalty (-1.5)
  if (
    /\b(?:adjusted|updated|configured|changed)\s+user\s+preferences\s+(?:for|in)\b/i.test(
      bullet
    )
  ) {
    score -= 1.5;
  }

  return {
    bullet,
    score: Math.max(0.5, Math.min(10.0, score)),
    isChore: false,
    hasMetric,
    dimension: detectArchitecturalDimension(bullet),
  };
}

const STOPWORDS = new Set([
  "the", "and", "with", "for", "from", "that", "this", "into", "across",
  "using", "their", "them", "line", "word", "users", "each", "game",
  "which", "then", "per", "via", "under", "over", "allow", "allowing",
  "within", "without"
]);

function stemSubstantiveWord(w: string): string {
  if (w.endsWith("ies") && w.length > 5) return w.slice(0, -3) + "y";
  if (w.endsWith("tions") && w.length > 7) return w.slice(0, -5);
  if (w.endsWith("tion") && w.length > 6) return w.slice(0, -4);
  if (w.endsWith("ing") && w.length > 5) return w.slice(0, -3);
  if (w.endsWith("ed") && w.length > 4) return w.slice(0, -2);
  if (w.endsWith("es") && w.length > 4) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3) return w.slice(0, -1);
  return w;
}

export function tokenizeSubstantiveRoots(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w))
    .map(stemSubstantiveWord);
}

/**
 * Deduplicates or synthesizes bullets covering overlapping feature entities.
 * If two bullets are near-identical echoes, drops the lower-scoring one.
 * If they describe distinct mechanisms of the same feature, synthesizes them into a composite bullet.
 */
export function deduplicateOrSynthesizeBullets(
  auditedList: AuditedBullet[],
  maxBullets: number
): AuditedBullet[] {
  if (auditedList.length <= 1) return auditedList;

  const result: AuditedBullet[] = [];
  const processedIndices = new Set<number>();

  for (let i = 0; i < auditedList.length; i++) {
    if (processedIndices.has(i)) continue;
    const a = auditedList[i];
    const tokensA = new Set(tokenizeSubstantiveRoots(a.bullet));

    let matchedDuplicateIndex = -1;
    let matchedOverlapRatio = 0;
    let matchedSharedRoots = 0;

    for (let j = i + 1; j < auditedList.length; j++) {
      if (processedIndices.has(j)) continue;
      const b = auditedList[j];
      const tokensB = new Set(tokenizeSubstantiveRoots(b.bullet));

      let shared = 0;
      for (const t of tokensB) {
        if (tokensA.has(t)) shared++;
      }

      const minLen = Math.min(tokensA.size, tokensB.size);
      const overlapRatio = minLen > 0 ? shared / minLen : 0;

      // Thematic overlap threshold (fractional overlap >= 0.30 or >= 4 shared substantive roots)
      if (overlapRatio >= 0.30 || shared >= 4) {
        matchedDuplicateIndex = j;
        matchedOverlapRatio = overlapRatio;
        matchedSharedRoots = shared;
        break;
      }
    }

    if (matchedDuplicateIndex !== -1) {
      const b = auditedList[matchedDuplicateIndex];
      processedIndices.add(matchedDuplicateIndex);

      const tokensB = new Set(tokenizeSubstantiveRoots(b.bullet));
      let novelInB = 0;
      for (const t of tokensB) {
        if (!tokensA.has(t)) novelInB++;
      }
      const novelRatio = tokensB.size > 0 ? novelInB / tokensB.size : 0;

      // Pure redundant echo or over capacity: retain higher-scoring bullet without synthetic boilerplate
      if (
        novelRatio < 0.40 ||
        matchedOverlapRatio >= 0.50 ||
        (matchedSharedRoots >= 4 && novelRatio < 0.70) ||
        (auditedList.length > maxBullets && matchedOverlapRatio >= 0.30)
      ) {
        result.push(a.score >= b.score ? a : b);
      } else {
        result.push(a);
        result.push(b);
      }
    } else {
      result.push(a);
    }
  }

  return result;
}

/**
 * Unrolls robotic heading-prefix templates like:
 * "Developed a Rate-Throttled Batching system, executing category lookups..." -> "Executed category lookups..."
 * "Designed a Spatial Sorting via Haversine Distance system, calculating..." -> "Calculated..."
 * "Implemented a Centralized Feature Orchestration mechanism, gating all..." -> "Gated all..."
 */
export function unrollRoboticHeadingPrefix(bullet: string): string {
  const prefixRegex =
    /^(?:Designed|Implemented|Developed|Engineered|Architected)\s+(?:an?|the)\s+([A-Z][a-zA-Z0-9_\- &()/]+?)\s+(?:system|mechanism|engine|pipeline|module|infrastructure|cover|mode)\s*,\s*([a-z]+ing)\s+/i;

  const match = bullet.match(prefixRegex);
  if (!match) return bullet;

  const participle = match[2].toLowerCase();
  const pastTense = convertParticipleToPastTense(participle);
  if (!pastTense) return bullet;

  return bullet.replace(prefixRegex, `${pastTense} `);
}

function convertParticipleToPastTense(participle: string): string | null {
  const irregulars: Record<string, string> = {
    binding: "Bound",
    building: "Built",
    holding: "Held",
    making: "Made",
    running: "Ran",
    writing: "Wrote",
  };
  if (irregulars[participle]) return irregulars[participle];

  if (!participle.endsWith("ing")) return null;
  const stem = participle.slice(0, -3);

  if (
    stem.endsWith("er") ||
    stem.endsWith("ur") ||
    stem.endsWith("or") ||
    stem.endsWith("ar")
  ) {
    return stem.charAt(0).toUpperCase() + stem.slice(1) + "ed";
  }
  if (stem.endsWith("e")) {
    return stem.charAt(0).toUpperCase() + stem.slice(1) + "d";
  }
  if (/[^aeiou][bcdfgklmnprstvz]$/i.test(stem)) {
    return stem.charAt(0).toUpperCase() + stem.slice(1) + "ed";
  }
  return stem.charAt(0).toUpperCase() + stem.slice(1) + "ed";
}

/**
 * Sanitizes a single bullet string by:
 * 1. Stripping leading bullet markers (•, -, *, etc.)
 * 2. Stripping leading/trailing wrapping quotes
 * 3. Balancing/stripping unclosed backticks while preserving matched pairs
 * 4. Stripping LaTeX math syntax ($...$, \text{...}) into clean plain text
 * 5. Stripping physical source code filenames and script references
 * 6. Fixing stranded prepositions resulting from filename stripping
 * 7. Unrolling formulaic title-prefix templates into direct active verbs
 * 8. Normalizing phonetic indefinite articles (a HTTP -> an HTTP)
 * 9. Stripping leading/trailing quotes from code symbols, file paths, and package names
 * 10. Cleaning up orphan punctuation marks (orphan commas before periods, double periods, etc.)
 * 11. Ensuring proper terminal punctuation
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

  // 4. Strip LaTeX math notation and rogue math symbols (e.g. $150\text{ ms}$ -> 150ms, $\approx 150ms$ -> ~150ms, $150ms -> 150ms)
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

  // 4b. Remove stray standalone dollar signs not attached to currency
  cleaned = cleaned.replace(/(^|\s)\$(\s|[.,;:!?]|$)/g, "$1$2");

  // 5. Strip low-signal physical source code filenames and directory paths
  cleaned = stripFileSystemArtifacts(cleaned);

  // 6. Fix stranded prepositions resulting from removals (e.g. "through to ensure" -> "to ensure")
  cleaned = cleaned.replace(
    /\b(?:through|via|across|in|from|within|inside|to|under|at)\s+(to\s+[a-z]+)/gi,
    "$1"
  );

  // Collapse multiple whitespace characters created by removals
  cleaned = cleaned.replace(/\s{2,}/g, " ");

  // 7. Unroll robotic heading-prefix templates into direct active verbs
  cleaned = unrollRoboticHeadingPrefix(cleaned);

  // 8. Normalize phonetic indefinite articles (e.g. "a HTTP" -> "an HTTP")
  cleaned = cleaned.replace(
    /\b([Aa])\s+(HTTP|HTML|HTTPS|SQL|SSRF|SLA|SSH|SDK|API|AST|IPC|OS|RFC)\b/g,
    "$1n $2"
  );

  // 9. Strip quotes around code symbols, file paths, and package names (e.g. 'express', "FastAPI", 'src/app')
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

  // 10. Clean up orphan punctuation marks and commas
  cleaned = cleaned
    .replace(/\s+([.,;:!?])/g, "$1") // Remove space before punctuation
    .replace(/([,:;])\s*\./g, ".") // Orphan comma/colon before period -> period
    .replace(/\s*-\s*\./g, ".") // Orphan dash before period -> period
    .replace(/\.{2,}(?!\.)/g, ".") // Duplicate periods (not ellipsis) -> single period
    .replace(/[,:;]{2,}/g, (m) => m[0]!) // Duplicate commas/colons -> single
    .replace(/,\s*,/g, ",")
    .trim();

  // 11. Ensure terminal punctuation
  if (cleaned && !/[.!?]$/.test(cleaned)) {
    cleaned += ".";
  }

  return cleaned;
}

/**
 * Detects cross-repository prompt hallucination bleed and ungrounded enterprise infrastructure claims.
 * Ensures specialized algorithmic, trigonometric, audio-streaming, crisis-dispatch, or backend broker claims
 * are strictly grounded in the repository's own documentation, manifest, or codebase context.
 */
export function isUngroundedHallucination(bullet: string, contextCorpus: string): boolean {
  const normCorpus = contextCorpus.toLowerCase();
  const bLower = bullet.toLowerCase();

  // 1. Speculative hedging parenthesis (e.g. "(e.g., RabbitMQ)", "(e.g., Docker)", "(e.g., SHA-256)")
  const hedgingMatch = bullet.match(/\((?:e\.g\.|i\.e\.|for example)\s*,?\s*([^)]+)\)/i);
  if (hedgingMatch) {
    const citedExample = hedgingMatch[1].toLowerCase().replace(/[^a-z0-9]/g, "");
    if (citedExample.length >= 3 && !normCorpus.includes(citedExample)) {
      return true;
    }
  }

  // 2. Geospatial & spherical trigonometry claims (e.g. Haversine distance, concentric bounding boxes)
  if (
    /\b(?:haversine|geospatial|concentric\s+bounding\s+boxes?)\b/i.test(bLower)
  ) {
    const hasGeoGrounding =
      /\b(?:geo|geospatial|haversine|gps|coord(?:inate)?s?|latitude|longitude|spatial|map(?:s|ping)?|proximity|radius|radial|wildfire|shelter)\b/i.test(
        normCorpus
      );
    if (!hasGeoGrounding) return true;
  }

  // 3. Audio/Voice memo byte-range streaming claims (e.g. HTTP 206 byte-range audio voice memos)
  if (
    /\b(?:http\s*206|voice\s*memos?|mediarecorder|microphone\s*buffers?)\b/i.test(bLower)
  ) {
    const hasAudioGrounding =
      /\b(?:audio|sound|voice|speech|memo|mediarecorder|microphone|stream(?:ing)?|video|playback|206)\b/i.test(
        normCorpus
      );
    if (!hasAudioGrounding) return true;
  }

  // 4. Emergency SOS / crisis workflow dispatch claims
  if (
    /\b(?:emergency\s+sos|panic\s+exit|domestic\s+violence|crisis\s+service)\b/i.test(bLower)
  ) {
    const hasCrisisGrounding =
      /\b(?:sos|emergency|crisis|safety|shelter|survivor|panic|domestic|violence)\b/i.test(
        normCorpus
      );
    if (!hasCrisisGrounding) return true;
  }

  // 5. Message queue / pub-sub broker claims (RabbitMQ, Kafka) on ungrounded repos
  if (
    /\b(?:message\s*queue|rabbitmq|kafka|pub\s*\/\s*sub\s*system|activemq|zeromq)\b/i.test(bLower)
  ) {
    const hasQueueGrounding =
      /\b(?:queue|rabbitmq|kafka|pubsub|pub\/sub|broker|worker|amqp)\b/i.test(
        normCorpus
      );
    if (!hasQueueGrounding) return true;
  }

  // 6. Relational ORM / database indexing claims (e.g. TypeORM) on ungrounded repos
  if (
    /\b(?:typeorm|prisma|indexed\s*database|normalized\s*,?\s*indexed\s*database)\b/i.test(bLower)
  ) {
    const hasDbGrounding =
      /\b(?:database|typeorm|prisma|sql|postgres|mysql|sqlite|mongo|db|indexeddb|orm)\b/i.test(
        normCorpus
      );
    if (!hasDbGrounding) return true;
  }

  // 7. Cryptographic anti-cheat claims (SHA-256 anti-cheat) on ungrounded repos
  if (
    /\b(?:cryptographic\s*hash|sha-256|anti-cheat)\b/i.test(bLower)
  ) {
    const hasCryptoGrounding =
      /\b(?:crypto|hash|sha|anti-cheat|security|checksum|hmac|jwt)\b/i.test(
        normCorpus
      );
    if (!hasCryptoGrounding) return true;
  }

  // 8. Containerization platform (Docker / Kubernetes) on ungrounded repos
  if (
    /\b(?:containerization\s*platform|docker(?:file)?|kubernetes|k8s)\b/i.test(bLower)
  ) {
    const hasDockerGrounding =
      /\b(?:docker|container|kubernetes|k8s|helm|compose)\b/i.test(
        normCorpus
      );
    if (!hasDockerGrounding) return true;
  }

  return false;
}

const VERB_ALTERNATIVES: Record<string, string[]> = {
  Configured: ["Architected", "Engineered", "Orchestrated", "Implemented", "Established"],
  Designed: ["Engineered", "Architected", "Developed", "Formulated", "Constructed"],
  Developed: ["Engineered", "Constructed", "Built", "Architected", "Implemented"],
  Implemented: ["Engineered", "Executed", "Constructed", "Built", "Architected"],
  Engineered: ["Architected", "Constructed", "Developed", "Built", "Implemented"],
  Automated: ["Streamlined", "Orchestrated", "Programmed", "Engineered"],
  Built: ["Constructed", "Engineered", "Developed", "Architected"],
  Serialized: ["Structured", "Stored", "Encoded", "Persisted", "Formatted"],
  Materialized: ["Implemented", "Constructed", "Generated", "Rendered", "Developed"],
  Dispatched: ["Orchestrated", "Executed", "Routed", "Triggered", "Coordinated"],
  Synchronized: ["Aligned", "Integrated", "Coordinated", "Reconciled"],
};

/**
 * Diversifies leading action verbs across bullets on the same project card to break repetitive verb carousels.
 */
export function diversifyLeadingVerbs(bullets: string[]): string[] {
  const seenVerbs = new Map<string, number>();

  return bullets.map((bullet) => {
    const match = bullet.match(/^([A-Z][a-z]+)\b/);
    if (!match) return bullet;

    const leadVerb = match[1]!;
    const count = seenVerbs.get(leadVerb) ?? 0;
    seenVerbs.set(leadVerb, count + 1);

    if (count > 0 && VERB_ALTERNATIVES[leadVerb]) {
      const alternatives = VERB_ALTERNATIVES[leadVerb]!;
      const replacement = alternatives[(count - 1) % alternatives.length]!;
      return bullet.replace(new RegExp(`^${leadVerb}\\b`), replacement);
    }

    return bullet;
  });
}

/**
 * Transforms a raw GitHub repository and its technical analysis into a validated ProjectItem.
 * Applies systems-engine unrolling, trivial primitive scrubbing, substantiveness scoring,
 * cross-bullet deduplication, and audited backfilling.
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
    bullet = sanitizeBulletString(bullet); // Final polish after unrolling/cleaning

    // Omit ungrounded cross-repo hallucinations
    if (isUngroundedHallucination(bullet, contextCorpus)) {
      continue;
    }

    // Omit description duplicates
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

    const audited = auditBulletSubstantiveness(bullet);
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

  // Pass 1 (Breadth): Pick the highest-scoring candidate from each unique architectural dimension
  for (const item of primaryCandidates) {
    if (chosen.length >= scaleBudget.maxBullets) break;
    const dim = item.dimension ?? "COMPUTATIONAL_LOGIC";
    if (!representedDimensions.has(dim)) {
      chosen.push(item);
      chosenIndices.add(item.originalIndex ?? 0);
      representedDimensions.add(dim);
    }
  }

  // Pass 2 (Depth): If capacity remains, select highest-scoring remaining primary candidates
  for (const item of primaryCandidates) {
    if (chosen.length >= scaleBudget.maxBullets) break;
    const idx = item.originalIndex ?? 0;
    if (!chosenIndices.has(idx)) {
      chosen.push(item);
      chosenIndices.add(idx);
    }
  }

  // Pass 3 (Capacity Backfill): Backfill valid substantive reserve candidates (score >= 3.0) up to scaleBudget.maxBullets.
  // Low-scoring chores or fluff (score < 3.0) are only admitted if strictly needed to satisfy scaleBudget.minBullets.
  while (chosen.length < scaleBudget.maxBullets && reserveCandidates.length > 0) {
    const next = reserveCandidates.shift()!;
    if (next.score >= 3.0 || chosen.length < scaleBudget.minBullets) {
      chosen.push(next);
    }
  }

  // Any remaining reserve candidates beyond minBullets or low-scoring candidates beyond maxBullets
  // are pruned/trashed by the heuristic tournament.

  // Sort chosen bullets by their original sequence to preserve narrative flow
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
