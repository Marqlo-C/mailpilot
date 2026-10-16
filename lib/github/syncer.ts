import type { GitHubRawRepo, GitHubSyncOptions, ProjectItem } from "./schema.ssot";
import { normalizeGitHubUsername, adaptRepoToProjectItem } from "./lens";
import {
  ROOT_MANIFESTS,
  MONOREPO_INDICATOR_FILES,
  SUBDIRECTORY_MANIFESTS,
  parseManifestDependencies,
  isMonorepoManifest,
} from "./manifests";
import { analyzeRepoArtifacts } from "./inference";

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

/**
 * Orchestrates multi-tier synchronization of public GitHub repositories into
 * high-density systems engineering project items.
 */
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

  const repos = (await response.json()) as GitHubRawRepo[];
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
      30
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

    projects.push(
      adaptRepoToProjectItem({
        repo,
        bullets: analysis.bullets,
        inferredTechnologies: analysis.technologies,
        manifestTechnologies: combinedTechs,
      })
    );
  }

  return projects;
}
