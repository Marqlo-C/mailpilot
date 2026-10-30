import {
  GITHUB_PARSER_VERSION,
  calculatePureCodeBytes,
  determineRepoScale,
  NON_SIGNAL_LANGUAGES,
  type GitHubRawRepo,
  type GitHubSyncOptions,
  type ProjectItem,
  type RepoCacheEntry,
  type StructuralMarkers,
} from "./schema.ssot";
import { normalizeGitHubUsername, adaptRepoToProjectItem } from "./lens";
import {
  ROOT_MANIFESTS,
  MONOREPO_INDICATOR_FILES,
  SUBDIRECTORY_MANIFESTS,
  parseManifestDependencies,
  isMonorepoManifest,
} from "./manifests";
import { dedupeTools } from "./tools";
import { analyzeRepoArtifacts } from "./inference";

/**
 * Module-level in-memory ETag and repo cache ledger.
 */
const globalRepoCache = new Map<string, RepoCacheEntry>();

export function getGlobalRepoCache(): Map<string, RepoCacheEntry> {
  return globalRepoCache;
}

export function clearGlobalRepoCache(): void {
  globalRepoCache.clear();
}

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

const IGNORED_DIRECTORY_REGEX =
  /(?:^|\/)(?:node_modules|\.venv|venv|vendor|__pycache__|dist|build|\.git|\.next|\.turbo|\.cache)\//i;

const MANIFEST_FILE_REGEX =
  /(?:^|\/)(?:package\.json|requirements\.txt|pyproject\.toml|go\.mod|Cargo\.toml)$/i;

const TEST_FILE_REGEX =
  /(?:^|\/)(?:tests?|__tests__|specs?)\/|\.(?:spec|test)\.[a-z0-9]+$|vitest\.config\.[a-z]+$|jest\.config\.[a-z]+$/i;

const WORKFLOW_REGEX = /(?:^|\/)\.github\/workflows\/[^\/]+\.ya?ml$/i;
const DOCKER_REGEX = /(?:^|\/)(?:Dockerfile|compose\.ya?ml|docker-compose\.ya?ml)$/i;
const DATABASE_REGEX = /(?:^|\/)(?:schema\.prisma|migrations\/|seeders?\/|seeds?\/)/i;

/**
 * Executes async tasks with bounded concurrency using an in-memory worker pool.
 */
async function runWithBoundedConcurrency<T, R>(
  items: T[],
  concurrencyLimit: number,
  taskFn: (item: T, index: number) => Promise<R>
): Promise<NonNullable<R>[]> {
  if (items.length === 0) return [];

  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  const worker = async () => {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      try {
        results[idx] = await taskFn(items[idx], idx);
      } catch (err) {
        console.warn(`Worker task failed at index ${idx}`, err);
        // Do not crash the entire pool if an individual item fails
      }
    }
  };

  const poolSize = Math.max(1, Math.min(concurrencyLimit, items.length));
  const pool = Array.from({ length: poolSize }, () => worker());
  await Promise.all(pool);
  return results.filter((item): item is NonNullable<R> => item !== null && item !== undefined);
}

/**
 * Orchestrates multi-tier synchronization of public GitHub repositories into
 * high-density systems engineering project items with Git Trees discovery,
 * language metrics, ETag caching ledger, and bounded worker concurrency.
 */
export async function syncGitHubProjects(
  usernameOrUrl: string,
  options: GitHubSyncOptions = {}
): Promise<ProjectItem[]> {
  const username = normalizeGitHubUsername(usernameOrUrl);
  const maxRepos = options.maxReposLimit ?? 100;
  const concurrency = options.concurrencyLimit ?? 3;
  const cacheLedger = options.cacheLedger ?? globalRepoCache;
  const authToken = options.githubToken || process.env.GITHUB_TOKEN;

  const endpoint = `https://api.github.com/users/${encodeURIComponent(
    username
  )}/repos?sort=updated&per_page=100&type=owner`;

  const fetchFile = options.rawFetcher ?? defaultFetchRawFile;

  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "MailPilot",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const isRateLimit =
      response.status === 403 &&
      (detail.includes("API rate limit exceeded") ||
        response.headers.get("x-ratelimit-remaining") === "0");

    if (isRateLimit) {
      const resetHeader = response.headers.get("x-ratelimit-reset");
      const resetTime = resetHeader
        ? ` (resets at ${new Date(Number(resetHeader) * 1000).toLocaleTimeString()})`
        : "";
      throw new Error(
        `GitHub API rate limit exceeded${resetTime}. Unauthenticated requests are limited to 60 req/hr per IP. Set GITHUB_TOKEN in your .env.local file to unlock 5,000 req/hr.`
      );
    }

    throw new Error(
      `GitHub API ${response.status}: ${detail.slice(0, 180) || response.statusText}`
    );
  }

  const repos = (await response.json()) as GitHubRawRepo[];
  const cleanUser = username.trim().toLowerCase();
  const publicRepos = repos
    .filter((r) => {
      if (r.fork || r.archived) return false;
      const repoName = r.name.trim().toLowerCase();
      const isProfileReadme = repoName === cleanUser;
      const isGithubPagesRoot = repoName === `${cleanUser}.github.io`;
      return !isProfileReadme && !isGithubPagesRoot;
    })
    .slice(0, maxRepos);

  const processRepo = async (repo: GitHubRawRepo): Promise<ProjectItem | null> => {
    const cacheKey = `${username.toLowerCase()}/${repo.name.toLowerCase()}`;
    const cachedEntry = cacheLedger.get(cacheKey);
    const isParserCurrent =
      cachedEntry?.parserVersion === GITHUB_PARSER_VERSION;
    const bypassCache = Boolean(options.bypassCache || options.forceRefresh);

    // Fast Bypass Check: If cached pushed_at matches exactly AND parser version is current, reuse cached project
    if (
      !bypassCache &&
      cachedEntry &&
      isParserCurrent &&
      repo.pushed_at &&
      cachedEntry.pushedAt === repo.pushed_at
    ) {
      return cachedEntry.project;
    }

    const branch = repo.default_branch || "main";

    // 1. Fetch README
    const [readme, readmeLower] = await Promise.all([
      fetchFile(username, repo.name, branch, "README.md"),
      fetchFile(username, repo.name, branch, "readme.md"),
    ]);
    const rawReadme = readme ?? readmeLower;

    let detectedDeps: string[] = [];
    let detectedManifestPaths: string[] = [];
    let hasMonorepo = false;
    let newEtag: string | undefined = undefined;

    const structuralMarkers: StructuralMarkers = {
      hasTests: false,
      hasCiCd: false,
      hasContainerization: false,
      hasDatabase: false,
      manifestPaths: [],
    };

    // 2. Discover Project Structure via Git Trees API (Single Call)
    let gitTreeSucceeded = false;
    try {
      const treeUrl = `https://api.github.com/repos/${username}/${repo.name}/git/trees/${branch}?recursive=1`;
      const treeHeaders: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "MailPilot",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      };

      const isParserCurrent =
        cachedEntry?.parserVersion === GITHUB_PARSER_VERSION;

      if (!bypassCache && cachedEntry?.etag && isParserCurrent) {
        treeHeaders["If-None-Match"] = cachedEntry.etag;
      }

      const treeRes = await fetch(treeUrl, {
        headers: treeHeaders,
        next: { revalidate: 0 },
      });

      if (!bypassCache && treeRes.status === 304 && cachedEntry && isParserCurrent) {
        // Unmodified on GitHub and parser version is current; reuse cached project item directly
        return cachedEntry.project;
      }

      if (treeRes.ok) {
        newEtag = treeRes.headers.get("etag") ?? undefined;
        const treeData = (await treeRes.json()) as {
          tree?: Array<{ path: string; type: string }>;
        };

        if (Array.isArray(treeData.tree)) {
          gitTreeSucceeded = true;
          const candidateManifests: string[] = [];

          for (const item of treeData.tree) {
            const p = item.path;
            if (IGNORED_DIRECTORY_REGEX.test(p)) continue;

            // Structural engineering markers
            if (TEST_FILE_REGEX.test(p)) structuralMarkers.hasTests = true;
            if (WORKFLOW_REGEX.test(p)) structuralMarkers.hasCiCd = true;
            if (DOCKER_REGEX.test(p)) structuralMarkers.hasContainerization = true;
            if (DATABASE_REGEX.test(p)) structuralMarkers.hasDatabase = true;

            // Manifests
            if (item.type === "blob" && MANIFEST_FILE_REGEX.test(p)) {
              candidateManifests.push(p);
            }
          }

          // Prioritize root manifests first, then shallow subdirectories
          candidateManifests.sort((a, b) => {
            const aSlashes = (a.match(/\//g) || []).length;
            const bSlashes = (b.match(/\//g) || []).length;
            return aSlashes - bSlashes;
          });

          // Bound manifest fetches to top 15 to stay within serverless limits
          const manifestsToFetch = candidateManifests.slice(0, 15);
          if (manifestsToFetch.length > 1 || candidateManifests.some((p) => p.includes("/"))) {
            hasMonorepo = true;
          }

          const manifestContents = await Promise.all(
            manifestsToFetch.map(async (filepath) => {
              const content = await fetchFile(username, repo.name, branch, filepath);
              return { filepath, content };
            })
          );

          for (const { filepath, content } of manifestContents) {
            if (content) {
              detectedManifestPaths.push(filepath);
              if (isMonorepoManifest(filepath, content)) {
                hasMonorepo = true;
              }
              detectedDeps.push(...parseManifestDependencies(filepath, content));
            }
          }
        }
      }
    } catch {
      // Git Trees API error (e.g. rate limit or mock environment). Fall back cleanly below.
    }

    // 3. Fallback: Speculative Probing if Git Trees was unavailable
    if (!gitTreeSucceeded) {
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
    }

    // 4. Multi-Language Byte Breakdown
    const languageMetrics: Record<string, number> = {};
    const rawLanguageBytes: Record<string, number> = {};
    const languageTechs: string[] = [];

    try {
      const langUrl = `https://api.github.com/repos/${username}/${repo.name}/languages`;
      const langRes = await fetch(langUrl, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "MailPilot",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        next: { revalidate: 3600 },
      });

      if (langRes.ok) {
        const langData = (await langRes.json()) as Record<string, number>;
        Object.assign(rawLanguageBytes, langData);
        const totalBytes = Object.values(langData).reduce((a, b) => a + b, 0);

        if (totalBytes > 0) {
          for (const [lang, bytes] of Object.entries(langData)) {
            const pct = Math.round((bytes / totalBytes) * 100);
            if (!NON_SIGNAL_LANGUAGES.has(lang.toLowerCase()) && (pct >= 3 || Object.keys(langData).length === 1)) {
              languageMetrics[lang] = pct;
              languageTechs.push(lang);
            }
          }
        }
      }
    } catch {
      // Gracefully continue if languages endpoint is unavailable
    }

    const pureCodeBytes =
      Object.keys(rawLanguageBytes).length > 0
        ? calculatePureCodeBytes(rawLanguageBytes)
        : null;

    const baseTechs = [
      repo.language,
      ...(repo.topics ?? []),
      ...languageTechs,
    ].filter((v): v is string => Boolean(v));

    const combinedTechs = dedupeTools([...baseTechs, ...detectedDeps]).slice(0, 35);

    structuralMarkers.manifestPaths = detectedManifestPaths;
    structuralMarkers.languages = languageMetrics;
    structuralMarkers.rawLanguages = rawLanguageBytes;
    structuralMarkers.pureCodeBytes = pureCodeBytes ?? undefined;

    const analysis = await analyzeRepoArtifacts({
      repoName: repo.name,
      description: repo.description ?? "",
      readme: rawReadme,
      manifestTechnologies: combinedTechs,
      repoSize: repo.size,
      pureCodeBytes,
      manifestPaths: detectedManifestPaths,
      hasMonorepoStructure: hasMonorepo,
      structuralMarkers,
      languageMetrics,
      llmOptions: options,
    });

    const scaleBudget = determineRepoScale({
      size: repo.size,
      codeBytes: pureCodeBytes,
      subsystems: {
        hasDatabase: structuralMarkers.hasDatabase,
        hasTests: structuralMarkers.hasTests,
        hasContainerization: structuralMarkers.hasContainerization,
        hasCiCd: structuralMarkers.hasCiCd,
        hasMonorepo: hasMonorepo,
        hasMultiDomainTopology: false,
      },
      manifestCount: detectedManifestPaths.length,
      hasMonorepoStructure: hasMonorepo,
      hasReadme: Boolean(rawReadme && rawReadme.trim().length > 0),
    });

    const projectItem = adaptRepoToProjectItem({
      repo,
      bullets: analysis.bullets,
      inferredTechnologies: analysis.technologies,
      manifestTechnologies: combinedTechs,
      scaleBudget,
      repoContextText: `${repo.name} ${repo.description ?? ""} ${rawReadme ?? ""} ${combinedTechs.join(" ")}`,
    });

    // Store in ETag caching ledger
    cacheLedger.set(cacheKey, {
      etag: newEtag,
      pushedAt: repo.pushed_at,
      parserVersion: GITHUB_PARSER_VERSION,
      project: projectItem,
    });

    return projectItem;
  };

  const projects = await runWithBoundedConcurrency(
    publicRepos,
    concurrency,
    processRepo
  );

  return projects;
}
