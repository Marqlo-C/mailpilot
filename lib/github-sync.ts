import { callLLMWithFallback, type LlmProvider } from "@/lib/llm";
import type { AccountRules } from "@/lib/validations/rules";
import { normalizeProjectName } from "@/lib/utils/format";

export type ProjectItem = {
  id?: string;
  name: string;
  description: string;
  technologies: string[];
  link: string | null;
  bullets: string[];
  origin?: "HUMAN_VERIFIED" | "GITHUB_INFERRED" | "AI_SUGGESTED";
};

export type RepoScaleTier = 1 | 2 | 3;

export interface RepoScaleBudget {
  tier: RepoScaleTier;
  targetScope: string;
  ingestCharBudget: number;
  minBullets: number;
  maxBullets: number;
}

export type GitHubRepo = {
  name: string;
  description: string | null;
  html_url: string;
  fork: boolean;
  archived: boolean;
  language: string | null;
  topics?: string[];
  stargazers_count: number;
  forks_count: number;
  default_branch?: string;
  size?: number; // Size in KB returned by GitHub API
};

export interface GitHubSyncOptions {
  llmProvider?: LlmProvider;
  localOllamaUrl?: string | null;
  ollamaModel?: string | null;
  allowCloudFallback?: boolean;
  accountId?: string | null;
  accountRules?: Partial<AccountRules> | null;
  rawFetcher?: (
    username: string,
    repo: string,
    branch: string,
    filepath: string
  ) => Promise<string | null>;
}

export interface AnalyzeRepoParams {
  repoName: string;
  description: string;
  readme: string | null;
  manifestTechnologies: string[];
  repoSize?: number | null;
  manifestPaths?: string[];
  hasMonorepoStructure?: boolean;
  llmOptions?: GitHubSyncOptions;
}

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

export const ROOT_MANIFESTS = [
  "package.json",
  "requirements.txt",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml",
] as const;

export const MONOREPO_INDICATOR_FILES = [
  "pnpm-workspace.yaml",
  "pnpm-workspace.yml",
  "lerna.json",
] as const;

export const SUBDIRECTORY_MANIFESTS = [
  "apps/web/package.json",
  "apps/api/package.json",
  "apps/package.json",
  "packages/package.json",
  "services/package.json",
  "services/requirements.txt",
  "services/go.mod",
  "services/Cargo.toml",
  "backend/requirements.txt",
  "backend/pyproject.toml",
  "backend/package.json",
  "backend/go.mod",
  "backend/Cargo.toml",
  "server/package.json",
  "server/requirements.txt",
  "client/package.json",
  "frontend/package.json",
] as const;

export const FILTER_OUT_REGEX =
  /(?:installation|getting started|how to run|prerequisites|requirements|license|contributing|contributors|code of conduct|badges|sponsors)/i;

export const PRIORITY_REGEX =
  /(?:architecture|system design|data flow|components|protocols|concurrency|pipeline|benchmarks|performance|security|storage|api specification)/i;

export const DEEP_ANALYSIS_SYSTEM_PROMPT = `You are a Principal Software Systems Architect extracting master resume bullet points from an open-source codebase.

TONE & REGISTER:
- Speak in an authentic, rigorous, tech-forward engineering register.
- Use precise systems terminology and industry idioms where applicable: concurrency, state consistency, protocols (HTTP, WebSockets, gRPC), caching layers, schema design, latency bounds, serialization, telemetry, decoupling, and automated workflows.
- Avoid vague, generic filler like "built features", "worked on code", or "helped users". State the technical mechanism and concrete engineering decision.
- Start every bullet with a decisive engineering verb: Architected, Engineered, Implemented, Benchmarked, Hardened, Instrumented, Containerized, Decoupled, Orchestrated, Optimized.

STRUCTURAL FORMULA:
- Apply the Context-Action-Result (CAR) / Google XYZ pattern:
  [Decisive Action Verb] + [Concrete Technical Problem / Architectural Scope] + [Implementation Mechanism / Tools]
- Keep each bullet between 16 and 32 words with high semantic density.

GROUND TRUTH & BAN ON FAKE COMMERCIAL METRICS:
- NEVER invent fictitious commercial revenue, dollar amounts, or fake user statistics (e.g. do NOT fabricate "increased revenue by 35%" or "served 200k active users").
- NEVER invent percentage gains, speedup metrics, or latency figures (e.g. do NOT fabricate "30% complexity reduction" or "25% speed increase") unless that exact empirical benchmark is written in the README. If unstated, describe the algorithmic mechanism only.
- Calibrate metrics strictly to engineering realities: test counts, latency thresholds (e.g. sub-50ms), throughput, API endpoint counts, container resource footprints, or schema entity counts.
- Never invent libraries, databases, or languages not verified in the repository manifests or README.

Return ONLY valid JSON matching this schema:
{
  "bullets": string[],
  "extractedTechnologies": string[]
}`;

async function defaultFetchRawFile(
  username: string,
  repo: string,
  branch: string,
  filepath: string
): Promise<string | null> {
  const url = `https://raw.githubusercontent.com/${username}/${repo}/${branch}/${filepath}`;
  try {
    const res = await fetch(url, {
      headers: process.env.GITHUB_TOKEN
        ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
        : {},
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export function parseManifestDependencies(
  filename: string,
  content: string
): string[] {
  const found: string[] = [];
  try {
    if (filename.endsWith("package.json")) {
      const json = JSON.parse(content) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...json.dependencies, ...json.devDependencies };
      return Object.keys(deps).filter(
        (dep) => !dep.startsWith("@types/") && dep !== "typescript"
      );
    }
    if (filename.endsWith("requirements.txt")) {
      return content
        .split("\n")
        .map((line) => line.split(/[=<>~;]/)[0]?.trim() ?? "")
        .filter((line) => line.length > 0 && !line.startsWith("#"));
    }
    if (filename.endsWith("pyproject.toml")) {
      const matches = [
        ...content.matchAll(
          /(?:dependencies\s*=\s*\[|\[project\.optional-dependencies\.[^\]]+\])([\s\S]*?)(?:\]|$)/gi
        ),
      ];
      const names: string[] = [];
      for (const block of matches) {
        const chunk = block[1] ?? "";
        for (const quoted of chunk.matchAll(/["']([a-zA-Z0-9_.\-]+)/g)) {
          if (quoted[1]) names.push(quoted[1]);
        }
      }
      for (const m of content.matchAll(
        /^([a-zA-Z0-9_.\-]+)\s*=\s*(?:["'{])/gm
      )) {
        const key = m[1]?.toLowerCase();
        if (
          key &&
          key !== "python" &&
          !key.startsWith("tool") &&
          !key.startsWith("project")
        ) {
          names.push(m[1]!);
        }
      }
      return [...new Set(names)].slice(0, 40);
    }
    if (filename.endsWith("go.mod")) {
      const matches = [...content.matchAll(/require\s+([^\s]+)/g)];
      return matches.map((m) => m[1]?.split("/").pop() || m[1] || "");
    }
    if (filename.endsWith("Cargo.toml")) {
      const section = content.match(
        /\[dependencies\]([\s\S]*?)(?:\n\[|\s*$)/
      );
      if (section?.[1]) {
        return [
          ...section[1].matchAll(/^([a-zA-Z0-9_-]+)\s*=/gm),
        ].map((m) => m[1]!);
      }
      const matches = [...content.matchAll(/\[dependencies\.([^\]]+)\]/g)];
      return matches.map((m) => m[1]!);
    }
  } catch {
    // Ignore JSON/parsing errors in messy manifests
  }
  return found;
}

export function isMonorepoManifest(filename: string, content: string): boolean {
  if (filename.endsWith("package.json")) {
    try {
      const json = JSON.parse(content) as { workspaces?: unknown };
      if (
        Array.isArray(json.workspaces) ||
        (json.workspaces && typeof json.workspaces === "object")
      ) {
        return true;
      }
    } catch {
      // Ignore parsing errors
    }
  }
  if (
    filename.includes("pnpm-workspace") ||
    filename.endsWith("lerna.json")
  ) {
    return true;
  }
  return false;
}

/**
 * Strips non-technical boilerplate (badges, raw images, sponsor links, HTML comments),
 * chunks content by markdown headings, filters out non-technical sections (installation,
 * licenses, contributing guidelines), and synthesizes a high-density digest prioritizing
 * architectural and systems specifications up to ingestCharBudget.
 */
export function extractSemanticMarkdownDigest(
  markdown: string,
  ingestCharBudget: number = 4000
): string {
  if (!markdown || !markdown.trim()) return "";

  // 1. Strip non-technical boilerplate
  const cleaned = markdown
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\[\!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, "")
    .replace(/\!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/\[(?:sponsor|donate|patreon|opencollective|buy me a coffee|ko-fi)[^\]]*\]\([^)]*\)/gi, "")
    .replace(/<\/?(?:div|p|span|center)\b[^>]*>/gi, "");

  const lines = cleaned.split(/\r?\n/);
  const introLines: string[] = [];
  interface SectionChunk {
    heading: string;
    level: number;
    content: string;
  }
  const sections: SectionChunk[] = [];
  let currentSection: SectionChunk | null = null;
  let passedTitle = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);

    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2].trim().replace(/^[\d.]+\s*/, "");

      if (!passedTitle && level === 1 && sections.length === 0 && !currentSection) {
        passedTitle = true;
        continue;
      }

      passedTitle = true;
      if (currentSection) {
        sections.push(currentSection);
      }

      currentSection = {
        heading: headingText,
        level,
        content: "",
      };
    } else {
      if (!currentSection) {
        if (line.trim().length > 0 || introLines.length > 0) {
          introLines.push(line);
        }
      } else {
        currentSection.content += line + "\n";
      }
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  const introSummary = introLines.join("\n").trim();

  const prioritySections: SectionChunk[] = [];
  const neutralSections: SectionChunk[] = [];

  for (const sec of sections) {
    if (FILTER_OUT_REGEX.test(sec.heading)) {
      continue;
    }
    if (PRIORITY_REGEX.test(sec.heading)) {
      prioritySections.push(sec);
    } else {
      neutralSections.push(sec);
    }
  }

  if (sections.length === 0) {
    return introSummary.slice(0, ingestCharBudget).trim();
  }

  let digest = introSummary;

  const appendSection = (sec: SectionChunk) => {
    const trimmed = sec.content.trim();
    if (!trimmed) return;
    const block = `${digest ? "\n\n" : ""}## ${sec.heading}\n${trimmed}`;
    if (digest.length + block.length <= ingestCharBudget) {
      digest += block;
    } else {
      const remaining = ingestCharBudget - digest.length;
      if (remaining > 120) {
        const slice = block.slice(0, remaining).replace(/\s+\S*$/, "");
        digest += slice;
      }
    }
  };

  for (const sec of prioritySections) {
    if (digest.length >= ingestCharBudget) break;
    appendSection(sec);
  }

  for (const sec of neutralSections) {
    if (digest.length >= ingestCharBudget) break;
    appendSection(sec);
  }

  return digest.trim();
}

/**
 * Evaluates repository size (in KB), manifest counts, and directory structure
 * to dynamically calibrate inference budget and target bullet density.
 */
export function determineRepoScale(info: {
  size?: number | null;
  manifestCount?: number;
  hasMonorepoStructure?: boolean;
}): RepoScaleBudget {
  const size = typeof info.size === "number" ? info.size : 0;
  const manifestCount = info.manifestCount ?? 0;
  const hasMonorepo = Boolean(info.hasMonorepoStructure);

  // Tier 3: Flagship / Distributed Architecture
  if (size >= 15000 || hasMonorepo) {
    return {
      tier: 3,
      targetScope:
        "Multi-service distributed architectures, event-driven pipelines, or high-throughput engines",
      ingestCharBudget: 10000,
      minBullets: 6,
      maxBullets: 10,
    };
  }

  // Tier 2: Mid-Scale Application / Service
  if ((size >= 3000 && size < 15000) || manifestCount >= 2) {
    return {
      tier: 2,
      targetScope:
        "Containerized full-stack apps, background workers, or standalone REST services",
      ingestCharBudget: 5500,
      minBullets: 4,
      maxBullets: 6,
    };
  }

  // Tier 1: Utility / Small Component
  return {
    tier: 1,
    targetScope:
      "CLI tools, localized utility algorithms, or self-contained scripts",
    ingestCharBudget: 2500,
    minBullets: 2,
    maxBullets: 3,
  };
}

/**
 * Cross-evaluates detected package manifests and subdirectories to deduce verified
 * architectural topologies (e.g., Python FastAPI paired with TypeScript Next.js).
 */
export function deduceArchitecturalTopology(
  packages: string[],
  manifestPaths: string[] = []
): string | null {
  const pkgs = new Set(packages.map((p) => p.toLowerCase()));
  const paths = manifestPaths.map((p) => p.toLowerCase());

  // Web & UI Frontends
  const hasNext = pkgs.has("next");
  const hasReact = pkgs.has("react") || pkgs.has("react-dom") || hasNext;
  const hasVue = pkgs.has("vue") || pkgs.has("nuxt");
  const hasSvelte = pkgs.has("svelte") || pkgs.has("@sveltejs/kit");
  const hasAngular = pkgs.has("@angular/core");
  const hasFrontend = hasNext || hasReact || hasVue || hasSvelte || hasAngular;

  // Backends
  const hasFastAPI = pkgs.has("fastapi");
  const hasPythonBackend =
    hasFastAPI ||
    pkgs.has("flask") ||
    pkgs.has("django") ||
    pkgs.has("tornado") ||
    pkgs.has("starlette") ||
    pkgs.has("sanic");

  const hasGoBackend =
    pkgs.has("gin") ||
    pkgs.has("echo") ||
    pkgs.has("fiber") ||
    pkgs.has("chi") ||
    pkgs.has("gorilla/mux");

  const hasRustBackend =
    pkgs.has("actix-web") ||
    pkgs.has("axum") ||
    pkgs.has("rocket") ||
    pkgs.has("warp");

  const hasNodeBackend =
    pkgs.has("express") ||
    pkgs.has("nest") ||
    pkgs.has("@nestjs/core") ||
    pkgs.has("fastify") ||
    pkgs.has("koa") ||
    pkgs.has("hono");

  // Real-time protocols
  const hasWebSockets =
    pkgs.has("ws") ||
    pkgs.has("socket.io") ||
    pkgs.has("socket.io-client") ||
    pkgs.has("websockets");

  // Distributed Cache / Broker
  const hasRedis =
    pkgs.has("redis") ||
    pkgs.has("ioredis") ||
    pkgs.has("aioredis");

  // Queues & Message Streaming
  const hasQueue =
    pkgs.has("kafkajs") ||
    pkgs.has("confluent-kafka") ||
    pkgs.has("kafka") ||
    pkgs.has("bull") ||
    pkgs.has("bullmq") ||
    pkgs.has("celery") ||
    pkgs.has("amqplib") ||
    pkgs.has("rabbitmq") ||
    pkgs.has("nats");

  const hasMonorepo =
    paths.some(
      (p) =>
        p.startsWith("apps/") ||
        p.startsWith("services/") ||
        p.startsWith("packages/") ||
        p.startsWith("backend/") ||
        p.startsWith("frontend/")
    );

  const parts: string[] = [];

  // Primary decoupled topology deduction
  if (hasPythonBackend && hasFrontend) {
    parts.push(
      "Decoupled service layer pairing an asynchronous Python backend with a TypeScript web frontend"
    );
  } else if (hasGoBackend && hasFrontend) {
    parts.push(
      "Decoupled architecture pairing a high-concurrency Go backend service with a reactive TypeScript web frontend"
    );
  } else if (hasRustBackend && hasFrontend) {
    parts.push(
      "High-performance architecture pairing a low-latency Rust backend engine with a TypeScript web frontend"
    );
  } else if (hasNodeBackend && hasFrontend && (hasMonorepo || paths.length >= 2)) {
    parts.push(
      "Decoupled full-stack TypeScript architecture pairing a Node.js API service layer with a reactive web client"
    );
  }

  // Real-time & messaging topology deduction
  if (hasWebSockets && hasRedis) {
    parts.push(
      "Distributed real-time messaging pipeline coordinating WebSocket gateways through Redis pub/sub state synchronization"
    );
  } else if (hasQueue) {
    parts.push(
      "Event-driven asynchronous processing pipeline orchestrating background job queues through message broker streaming"
    );
  } else if (hasRedis && !parts.some((p) => p.includes("Redis"))) {
    parts.push(
      "High-throughput caching and state coordination layer backed by Redis"
    );
  }

  if (parts.length === 0) {
    if (hasMonorepo) {
      return "Decoupled monorepo architecture coordinating multi-service application modules across segregated packages.";
    }
    return null;
  }

  if (parts.length === 1) {
    return `${parts[0]}.`;
  }

  return `${parts[0]}, integrated with a ${parts[1].charAt(0).toLowerCase() + parts[1].slice(1)}.`;
}

export async function analyzeRepoArtifacts(
  params: AnalyzeRepoParams
): Promise<{ bullets: string[]; technologies: string[] }> {
  const {
    repoName,
    description,
    readme,
    manifestTechnologies,
    repoSize,
    manifestPaths = [],
    hasMonorepoStructure = false,
    llmOptions,
  } = params;

  const scaleBudget = determineRepoScale({
    size: repoSize,
    manifestCount: manifestPaths.length > 0 ? manifestPaths.length : manifestTechnologies.length > 0 ? 1 : 0,
    hasMonorepoStructure,
  });

  const verifiedTopology = deduceArchitecturalTopology(
    manifestTechnologies,
    manifestPaths
  );

  const readmeDigest = readme
    ? extractSemanticMarkdownDigest(readme, scaleBudget.ingestCharBudget)
    : null;

  if (!readmeDigest && manifestTechnologies.length === 0) {
    return {
      bullets: [
        description
          ? `Architected and maintained ${repoName}: ${description.replace(/\.$/, "")}.`
          : `Architected and maintained the ${repoName} codebase.`,
      ],
      technologies: manifestTechnologies,
    };
  }

  const promptPayload: Record<string, unknown> = {
    repository: repoName,
    description: description || "No description provided",
    repositoryScale: `Tier ${scaleBudget.tier} (${scaleBudget.targetScope})`,
    targetBulletCount: `${scaleBudget.minBullets} to ${scaleBudget.maxBullets} high-density engineering bullets`,
    detectedManifestPackages: manifestTechnologies.slice(0, 30),
    readmeDigest: readmeDigest || "No README available",
  };

  if (verifiedTopology) {
    promptPayload.verifiedArchitecturalTopology = `Verified architectural topology: ${verifiedTopology}`;
  }

  const userPrompt = JSON.stringify(promptPayload, null, 2);

  try {
    const response = await callLLMWithFallback({
      systemPrompt: DEEP_ANALYSIS_SYSTEM_PROMPT,
      userPrompt,
      llmProvider: llmOptions?.llmProvider ?? "LOCAL_OLLAMA",
      localOllamaUrl: llmOptions?.localOllamaUrl,
      ollamaModel: llmOptions?.ollamaModel,
      allowCloudFallback: llmOptions?.allowCloudFallback,
      accountId: llmOptions?.accountId,
      accountRules: llmOptions?.accountRules,
    });

    if (
      response &&
      Array.isArray(response.bullets) &&
      response.bullets.length > 0
    ) {
      return {
        bullets: response.bullets.map(String).map((b) => b.trim()).filter(Boolean),
        technologies: Array.isArray(response.extractedTechnologies)
          ? response.extractedTechnologies.map(String).map((t) => t.trim()).filter(Boolean)
          : manifestTechnologies,
      };
    }
  } catch (error) {
    console.warn(
      `LLM deep inference failed for ${repoName}, falling back to heuristics`,
      error
    );
  }

  // Heuristic engineering fallback adhering to decisive action verbs and zero generic filler
  const namedTools = manifestTechnologies.slice(0, 4).filter(Boolean);
  const fallbackBullets: string[] = [];

  if (verifiedTopology) {
    fallbackBullets.push(
      `Architected ${repoName} codebase featuring ${verifiedTopology.toLowerCase().replace(/\.$/, "")}.`
    );
  } else if (description) {
    fallbackBullets.push(
      `Architected and implemented ${repoName}: ${description.replace(/\.$/, "")}.`
    );
  } else {
    fallbackBullets.push(`Architected and maintained the ${repoName} open-source system.`);
  }

  if (namedTools.length > 0) {
    fallbackBullets.push(
      `Engineered core system components and integrated automated workflows utilizing ${namedTools.join(", ")}.`
    );
  }

  if (scaleBudget.tier >= 2) {
    fallbackBullets.push(
      `Hardened runtime execution and structured modular subsystems to ensure system reliability and throughput.`
    );
  }
  if (scaleBudget.tier === 3) {
    fallbackBullets.push(
      `Orchestrated multi-service architecture spanning distributed data ingestion, persistence, and automated CI/CD pipelines.`
    );
  }

  return {
    bullets: fallbackBullets,
    technologies: manifestTechnologies,
  };
}

export async function syncGitHubProjects(
  usernameOrUrl: string,
  options: GitHubSyncOptions = {}
): Promise<ProjectItem[]> {
  const username = normalizeGitHubUsername(usernameOrUrl);
  const endpoint = `https://api.github.com/users/${encodeURIComponent(
    username
  )}/repos?sort=updated&per_page=15&type=owner`;

  const fetchFile = options.rawFetcher ?? defaultFetchRawFile;

  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "MailPilot",
      ...(process.env.GITHUB_TOKEN
        ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
        : {}),
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `GitHub API ${response.status}: ${detail.slice(0, 180) || response.statusText}`
    );
  }

  const repos = (await response.json()) as GitHubRepo[];
  const cleanUser = username.trim().toLowerCase();
  const publicRepos = repos.filter((r) => {
    if (r.fork || r.archived) return false;
    const repoName = r.name.trim().toLowerCase();
    const isProfileReadme = repoName === cleanUser;
    const isGithubPagesRoot = repoName === `${cleanUser}.github.io`;
    return !isProfileReadme && !isGithubPagesRoot;
  });

  const projects: ProjectItem[] = [];

  for (const repo of publicRepos) {
    const branch = repo.default_branch || "main";

    const [readme, readmeLower] = await Promise.all([
      fetchFile(username, repo.name, branch, "README.md"),
      fetchFile(username, repo.name, branch, "readme.md"),
    ]);
    const rawReadme = readme ?? readmeLower;

    const detectedDeps: string[] = [];
    const detectedManifestPaths: string[] = [];
    let hasMonorepo = false;

    // 1. Probe root manifests and workspace indicators
    const rootProbes = await Promise.allSettled(
      [...ROOT_MANIFESTS, ...MONOREPO_INDICATOR_FILES].map(async (file) => {
        const content = await fetchFile(username, repo.name, branch, file);
        return { file, content };
      })
    );

    for (const res of rootProbes) {
      if (res.status === "fulfilled" && res.value.content) {
        const { file, content } = res.value;
        detectedManifestPaths.push(file);
        if (isMonorepoManifest(file, content)) {
          hasMonorepo = true;
        }
        detectedDeps.push(...parseManifestDependencies(file, content));
      }
    }

    // 2. Probe common subdirectory manifests
    const subdirProbes = await Promise.allSettled(
      SUBDIRECTORY_MANIFESTS.map(async (file) => {
        const content = await fetchFile(username, repo.name, branch, file);
        return { file, content };
      })
    );

    for (const res of subdirProbes) {
      if (res.status === "fulfilled" && res.value.content) {
        const { file, content } = res.value;
        detectedManifestPaths.push(file);
        hasMonorepo = true;
        detectedDeps.push(...parseManifestDependencies(file, content));
      }
    }

    const baseTechs = [repo.language, ...(repo.topics ?? [])].filter(
      (v): v is string => Boolean(v)
    );
    const combinedTechs = [...new Set([...baseTechs, ...detectedDeps])].slice(
      0,
      25
    );

    const analysis = await analyzeRepoArtifacts({
      repoName: repo.name,
      description: repo.description ?? "",
      readme: rawReadme,
      manifestTechnologies: combinedTechs,
      repoSize: repo.size,
      manifestPaths: detectedManifestPaths,
      hasMonorepoStructure: hasMonorepo,
      llmOptions: options,
    });

    projects.push({
      name: normalizeProjectName(repo.name),
      description: repo.description || "Open-source repository on GitHub",
      link: repo.html_url,
      technologies:
        analysis.technologies.length > 0
          ? [...new Set([...analysis.technologies, ...combinedTechs])]
          : combinedTechs,
      bullets: analysis.bullets,
      origin: "GITHUB_INFERRED",
    });
  }

  return projects;
}
