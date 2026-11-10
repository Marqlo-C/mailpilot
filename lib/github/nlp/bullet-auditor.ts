/**
 * AST Bullet Auditor, Code Artifact Stripper & Hallucination Filter.
 */

import {
  CODE_FILE_EXTENSIONS_SET,
  UNIVERSAL_DIRECTORY_ROOTS,
} from "../github.schema";
import { detectMetric } from "@/lib/validations/profile.schema";
import { verifyAndScrubBulletMetrics } from "../metrics";

export const LOW_SIGNAL_CHORE_REGEX =
  /(?:set(?:ting)?\s+up|configur(?:ed?|ing)|creat(?:ed?|ing)|instrument(?:ed?|ing)|manag(?:ed?|ing)|defin(?:ed?|ing))\s+(?:environment\s+variables?|\.env(?:[a-z0-9_.-]+)?|local\s+config(?:uration)?|ports?|local\s+tokens?)|(?:setting\s+ports?)|(?:filesystem\s+hygiene|organiz(?:ed?|ing)\s+assets|creat(?:ed?|ing)\s+folders?|clean(?:ed?|ing)?\s+up\s+repositor(?:y|ies)?)|(?:screen\s*recordings?|screenshots?|demo\s+scripts?|demonstration\s+artifacts?)|(?:install(?:ed?|ing)\s+dependencies|configur(?:ed?|ing)\s+code\s+linters?|code\s+formatting|eslint|prettier)|(?:\b(?:vercel|netlify|render|heroku)\b.*(?:automatic\s+redeploy|push(?:es)?\s+to\s+`?main`?|`?main`?\s+branch|`?main`?\s+(?:branch\s+)?push(?:es)?))|(?:\b\d{1,3}%\s+of\s+the\s+codebase\s+written\s+in\b)|(?:(?:updat(?:ed?|ing)|wrot(?:e|ing)|maintain(?:ed?|ing))\s+(?:documentation|readme(?:\.md)?|docs?|setup\s+guide(?:lines?)?))|(?:\b(?:localhost(?::\d+)?|127\.0\.0\.1(?::\d+)?|0\.0\.0\.0)\b)|(?:\b(?:npm|yarn|pnpm|bun|vite|cargo|mvn|gradle|python)\s+(?:run\s+)?(?:dev|start|serve)\b)|(?:\bdeployed\b.*\blocal\s+development\s+environment\b)|(?:\b(?:env\s+files?|\.env(?:\.[a-z0-9_-]+)?|environment\s+variables?)\b.*(?:api\s+keys?|secrets?|store|sensitive))/i;

export const KNOWN_FRAMEWORKS = new Set([
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

export function isCodeFilename(token: string): boolean {
  const clean = token.toLowerCase().replace(/[`"'“‘”’(),]/g, "").trim();
  if (KNOWN_FRAMEWORKS.has(clean)) return false;

  const dotIdx = clean.lastIndexOf(".");
  if (dotIdx === -1) return false;
  const ext = clean.slice(dotIdx + 1);

  return CODE_FILE_EXTENSIONS_SET.has(ext);
}

const DATA_FILE_DESCRIPTIONS: Record<string, string> = {
  txt: "text files",
  md: "markdown documents",
  csv: "CSV data files",
  tsv: "TSV data files",
  json: "JSON records",
  yaml: "YAML records",
  yml: "YML records",
};

/**
 * Universal file system and directory artifact scrubber.
 */
export function stripFileSystemArtifacts(bullet: string): string {
  let text = bullet;

  text = text.replace(
    /`?([A-Z][a-zA-Z0-9_\-\s]*?)\.(?:txt|csv|tsv|json)`?(?:\s+(?:dataset|benchmark|corpus|data))?/g,
    "$1 dataset"
  );

  text = text.replace(/`?\.([a-zA-Z0-9]+)`?\s+files?\b/gi, (_m, ext) => {
    const lower = ext.toLowerCase();
    return DATA_FILE_DESCRIPTIONS[lower] ?? `${ext.toUpperCase()} files`;
  });

  text = text.replace(/`?\[[a-zA-Z0-9_\-]+\]\.[a-zA-Z0-9]+`?/g, "");

  text = text.replace(
    new RegExp(
      `\\b(?:to|in|into|inside|within|under|from|via)\\s+\`?@?(?:(?:\\.?\\/)?(?:${DIR_ROOT_PATTERN})\\/[a-zA-Z0-9_\\-\\.\\/]*)\`?`,
      "gi"
    ),
    ""
  );

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

  text = text.replace(
    /(?:,\s*)?\b(?:implemented|defined|located|found|written|hosted|specified|authored|managed)\s+(?:in|inside|within)\s+`?@?(?:[a-zA-Z0-9_\-\.]+\/)*[a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9]+`?/gi,
    (match) => {
      const parts = match.trim().split(/\s+/);
      const last = parts[parts.length - 1] ?? "";
      return isCodeFilename(last) ? "" : match;
    }
  );

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

  text = text.replace(
    /`?@?(?:[a-zA-Z0-9_\-\.]+\/)*([a-zA-Z0-9_\-]+)\.([a-zA-Z0-9]+)`?\s+(utility|module|script|tool|harness|service|interface|pipeline|middleware|helper|worker)\b/gi,
    (match, baseName, ext, descriptor) => {
      if (isCodeFilename(`${baseName}.${ext}`)) {
        return `${baseName} ${descriptor}`;
      }
      return match;
    }
  );

  text = text.replace(
    /(^|\s)`?@?(?:[a-zA-Z0-9_\-\.]+\/)*[a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9]+`?(?=[\s,.;:!?]|$)/gi,
    (match) => {
      if (isCodeFilename(match.trim())) {
        return "";
      }
      return match;
    }
  );

  text = text.replace(
    new RegExp(
      `(^|\\s)\`?@?(?:(?:\\.?\\/)?(?:${DIR_ROOT_PATTERN})\\/[a-zA-Z0-9_\\-\\.\\/]*)\`?(?=[\\s,.;:!?]|$)`,
      "gi"
    ),
    "$1"
  );

  text = text.replace(
    /\b(using|with|via|through|across|in|from|within|inside|to|into|under|at)\s+and\s+/gi,
    "$1 "
  );
  text = text.replace(
    /\b(?:through|via|across|in|from|within|inside|to|into|under|at)\s+(with|for|by|where|or|to\s+[a-z]+)\b/gi,
    "$1"
  );
  text = text.replace(
    /\s*\b(?:using|via|in|from|through|with|by|under|at)\s*([,.;:!?])/gi,
    "$1"
  );
  text = text.replace(/\s+\b(?:using|via|in|from|through|with|by|under|at)\s*$/gi, ".");
  text = text.replace(/\s+([,.;:!?])/g, "$1");
  return text.replace(/\s{2,}/g, " ");
}

export function stripFilenamePhrases(bullet: string): string {
  return stripFileSystemArtifacts(bullet);
}

/**
 * Cleans tutorial-level standard library built-in calls (e.g. setInterval, fetch).
 */
export function cleanTrivialPrimitives(bullet: string): string {
  let cleaned = bullet;
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
  cleaned = cleaned.replace(
    /\b(?:utilizing|using|via)\s+(?:(?:python|javascript|node)['’]?s\s+)?(?:`?print`?|`?console\.log`?)\s*(?:function|method|\(\))?\s+to\b/gi,
    "to inspect and"
  );
  cleaned = cleaned.replace(
    /\b(?:utilizing|using|via)\s+(?:(?:python|javascript|node)['’]?s\s+)?(?:`?print`?|`?console\.log`?)\s*(?:function|method|\(\)|statements?|calls?)?(?:,\s*|\s+)?/gi,
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

  if (
    /\b(?:aes-256|crypt(?:o|ography|ed|ographic)?|encryption|cipher|hash(?:ing|ed|es)?|sha-256|auth(?:enticat(?:ed|ion))?|jwt|(?:auth|bearer|session|csrf|access|refresh|api)\s*tokens?|credentials?|transient\s+storage|privacy|lock\s*acquisition|deadlock|race\s*condition|thread-safe|sanitiz(?:ed|ation))\b/i.test(
      bLower
    )
  ) {
    return "SECURITY_RELIABILITY";
  }

  if (
    /\b(?:minimax|alpha-beta|monte\s*carlo|search\s*tree|q-value|dqn|deep\s*q|heuristic|state\s*machine|algorithm(?:ic)?|matrix|matrices|vector|pathfinding|simulation|decision\s*engine|inference\s*router|fallback\s*hierarchy|pacing|hydration)\b/i.test(
      bLower
    )
  ) {
    return "COMPUTATIONAL_LOGIC";
  }

  if (
    /\b(?:ui|interface|interaction|frontend|components?|styling|layouts?|responsive|canvas|viewport|modals?|views?|screens?|animation(?:s)?|transitions?|render(?:ing|ed)?|css|tailwind|theme|theming|accessibility|a11y)\b/i.test(
      bLower
    )
  ) {
    return "INTERFACE_INTERACTION";
  }

  if (
    /\b(?:postgresql|postgres|mysql|sqlite|mongodb|mongo|prisma|orm|drizzle|redis|database|schemas?|migration(?:s)?|persist(?:ence|ed|ing)?|cached?|caching|gridfs|store|stored|indexing|indexed|buffer|replay\s*buffer|deep\s*copy(?:ing)?)\b/i.test(
      bLower
    )
  ) {
    return "DATA_STORAGE";
  }

  if (
    /\b(?:http|rest(?:ful)?|api|apis|websocket(?:s)?|socket\.io|grpc|rpc|pub\s*\/?\s*sub|pubsub|message\s*queue|webhook(?:s)?|scrap(?:ing|er|e)|stream(?:ing|ed|s)?|byte-range|network|telematics|circuit\s*breaker|rate\s*limit(?:ing|ed|er)?)\b/i.test(
      bLower
    )
  ) {
    return "NETWORKING_PROTOCOLS";
  }

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

export function auditBulletSubstantiveness(
  bullet: string,
  sourceText?: string | null
): AuditedBullet {
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
  if (hasMetric) {
    if (sourceText) {
      const metricCheck = verifyAndScrubBulletMetrics({ bullet, sourceText });
      if (metricCheck.groundedNumbers.length > 0) {
        score += 2.0;
      }
    } else {
      score += 2.0;
    }
  }

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

  if (
    /\b(?:setinterval|settimeout|event\s*listener|localstorage|math\.random)\b/i.test(
      bullet
    )
  ) {
    score -= 1.5;
  }

  if (
    /\b(?:tailwind\s+css|css3?|styling|layouts?)\s+across\s+(?:[a-z,\s]+\s+)?screens?,\s+ensuring\s+seamless\b/i.test(
      bullet
    )
  ) {
    score -= 1.5;
  }

  if (
    /\b(?:adjusted|updated|configured|changed)\s+user\s+preferences\s+(?:for|in)\b/i.test(
      bullet
    )
  ) {
    score -= 1.5;
  }

  const wordTokens = bullet.split(/\s+/).filter(Boolean);
  if (wordTokens.length <= 6 && !hasMetric) {
    score -= 2.5;
  }

  return {
    bullet,
    score: Math.max(0.5, Math.min(10.0, score)),
    isChore: false,
    hasMetric,
    dimension: detectArchitecturalDimension(bullet),
  };
}

export const STOPWORDS = new Set([
  "the", "and", "with", "for", "from", "that", "this", "into", "across",
  "using", "their", "them", "line", "word", "users", "each", "game",
  "which", "then", "per", "via", "under", "over", "allow", "allowing",
  "within", "without"
]);

export function stemSubstantiveWord(w: string): string {
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

export function isUngroundedHallucination(bullet: string, contextCorpus: string): boolean {
  const normCorpus = contextCorpus.toLowerCase();
  const bLower = bullet.toLowerCase();

  const hedgingMatch = bullet.match(/\((?:e\.g\.|i\.e\.|for example)\s*,?\s*([^)]+)\)/i);
  if (hedgingMatch) {
    const citedExample = hedgingMatch[1].toLowerCase().replace(/[^a-z0-9]/g, "");
    if (citedExample.length >= 3 && !normCorpus.includes(citedExample)) {
      return true;
    }
  }

  if (
    /\b(?:haversine|geospatial|concentric\s+bounding\s+boxes?)\b/i.test(bLower)
  ) {
    const hasGeoGrounding =
      /\b(?:geo|geospatial|haversine|gps|coord(?:inate)?s?|latitude|longitude|spatial|map(?:s|ping)?|proximity|radius|radial)\b/i.test(
        normCorpus
      );
    if (!hasGeoGrounding) return true;
  }

  if (
    /\b(?:http\s*206|voice\s*memos?|mediarecorder|microphone\s*buffers?)\b/i.test(bLower)
  ) {
    const hasAudioGrounding =
      /\b(?:audio|sound|voice|speech|memo|mediarecorder|microphone|stream(?:ing)?|video|playback|206)\b/i.test(
        normCorpus
      );
    if (!hasAudioGrounding) return true;
  }

  if (
    /\b(?:emergency\s+sos|crisis\s+(?:service|dispatch|workflow)|safety\s+dispatch)\b/i.test(bLower)
  ) {
    const hasCrisisGrounding =
      /\b(?:sos|emergency|crisis|safety|dispatch)\b/i.test(
        normCorpus
      );
    if (!hasCrisisGrounding) return true;
  }

  if (
    /\b(?:message\s*queue|rabbitmq|kafka|pub\s*\/\s*sub\s*system|activemq|zeromq)\b/i.test(bLower)
  ) {
    const hasQueueGrounding =
      /\b(?:queue|rabbitmq|kafka|pubsub|pub\/sub|broker|worker|amqp)\b/i.test(
        normCorpus
      );
    if (!hasQueueGrounding) return true;
  }

  if (
    /\b(?:typeorm|prisma|indexed\s*database|normalized\s*,?\s*indexed\s*database)\b/i.test(bLower)
  ) {
    const hasDbGrounding =
      /\b(?:database|typeorm|prisma|sql|postgres|mysql|sqlite|mongo|db|indexeddb|orm)\b/i.test(
        normCorpus
      );
    if (!hasDbGrounding) return true;
  }

  if (
    /\b(?:cryptographic\s*hash|sha-256|anti-cheat)\b/i.test(bLower)
  ) {
    const hasCryptoGrounding =
      /\b(?:crypto|hash|sha|anti-cheat|security|checksum|hmac|jwt)\b/i.test(
        normCorpus
      );
    if (!hasCryptoGrounding) return true;
  }

  if (
    /\b(?:containerization\s*platform|docker(?:file)?|kubernetes|k8s)\b/i.test(bLower)
  ) {
    const hasDockerGrounding =
      /\b(?:docker|container|kubernetes|k8s|helm|compose)\b/i.test(
        normCorpus
      );
    if (!hasDockerGrounding) return true;
  }

  if (
    /\b(?:audio|sound|animation|haptic|visual|color|styling)\b/i.test(bLower) &&
    /\b(?:security|exploit|anti-tamper|vulnerability|hardening)\b/i.test(bLower)
  ) {
    return true;
  }

  if (
    /\b(?:hardened\s+(?:game\s+|app(?:lication)?\s+)?security|minimiz(?:ing|ed)\s+(?:potential\s+)?exploits?|vulnerability\s+mitigation|anti-tamper)\b/i.test(bLower)
  ) {
    const hasSecurityGrounding =
      /\b(?:security|auth|token|jwt|credential|crypt|permission|sanitize|vulnerability|exploit|role|access-control|acl)\b/i.test(
        normCorpus
      );
    if (!hasSecurityGrounding) return true;
  }

  if (
    /\b(?:game\s+engine|physics\s+engine|compiler\s+pipeline|operating\s+system\s+kernel)\b/i.test(bLower)
  ) {
    const hasDomainGrounding =
      /\b(?:game|physics|engine|simulation|compiler|kernel|board|player|sprite)\b/i.test(
        normCorpus
      );
    if (!hasDomainGrounding) return true;
  }

  return false;
}
