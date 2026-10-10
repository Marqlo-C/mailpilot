import { callLLMWithFallback, type LlmProvider } from "@/lib/llm";
import type { AccountRules } from "@/lib/validations/rules";

export type ProjectItem = {
  id?: string;
  name: string;
  description: string;
  technologies: string[];
  link: string | null;
  bullets: string[];
  origin?: "HUMAN_VERIFIED" | "GITHUB_INFERRED" | "AI_SUGGESTED";
};

type GitHubRepo = {
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
};

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

const COMMON_MANIFESTS = [
  "package.json",
  "requirements.txt",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml",
];

async function fetchRawFile(
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

function parseManifestDependencies(
  filename: string,
  content: string
): string[] {
  const found: string[] = [];
  try {
    if (filename === "package.json") {
      const json = JSON.parse(content) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...json.dependencies, ...json.devDependencies };
      return Object.keys(deps).filter(
        (dep) => !dep.startsWith("@types/") && dep !== "typescript"
      );
    }
    if (filename === "requirements.txt") {
      return content
        .split("\n")
        .map((line) => line.split(/[=<>~;]/)[0]?.trim() ?? "")
        .filter((line) => line.length > 0 && !line.startsWith("#"));
    }
    if (filename === "pyproject.toml") {
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
      // Also catch poetry-style [tool.poetry.dependencies] keys
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
    if (filename === "go.mod") {
      const matches = [...content.matchAll(/require\s+([^\s]+)/g)];
      return matches.map((m) => m[1]?.split("/").pop() || m[1] || "");
    }
    if (filename === "Cargo.toml") {
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

const DEEP_ANALYSIS_SYSTEM_PROMPT = `You are reading a software repository to draft resume bullets for its author.
Extract 2 to 3 high-impact bullets in Context-Action-Result form, grounded only in the README and detected files.

STRICT ACCURACY RULES:
- Never invent revenue, user counts, or outcomes that are not in the source.
- Describe what the repository actually does. Mention architecture, protocols, or implementation detail only when the source states it.
- Start each bullet with a concrete verb supported by the source.
- Keep each bullet between 14 and 26 words.
- Return ONLY valid JSON:
{
  "bullets": string[],
  "extractedTechnologies": string[]
}`;

async function analyzeRepoArtifacts(params: {
  repoName: string;
  description: string;
  readme: string | null;
  manifestTechnologies: string[];
  llmOptions?: {
    llmProvider?: LlmProvider;
    localOllamaUrl?: string | null;
    ollamaModel?: string | null;
    allowCloudFallback?: boolean;
    accountId?: string | null;
    accountRules?: Partial<AccountRules> | null;
  };
}): Promise<{ bullets: string[]; technologies: string[] }> {
  const { repoName, description, readme, manifestTechnologies, llmOptions } =
    params;

  if (!readme && manifestTechnologies.length === 0) {
    return {
      bullets: [
        description
          ? `Maintained the ${repoName} repository: ${description.replace(/\.$/, "")}.`
          : `Maintained the ${repoName} repository.`,
      ],
      technologies: manifestTechnologies,
    };
  }

  const userPrompt = JSON.stringify({
    repository: repoName,
    description: description || "No description provided",
    detectedManifestPackages: manifestTechnologies.slice(0, 20),
    readmeSnippet: readme ? readme.slice(0, 4000) : "No README available",
  });

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
        bullets: response.bullets.map(String),
        technologies: Array.isArray(response.extractedTechnologies)
          ? response.extractedTechnologies.map(String)
          : manifestTechnologies,
      };
    }
  } catch (error) {
    console.warn(
      `LLM deep inference failed for ${repoName}, falling back to heuristics`,
      error
    );
  }

  const namedTools = manifestTechnologies.slice(0, 4).filter(Boolean);
  const fallbackBullets = [
    description
      ? `Worked on ${repoName}: ${description.replace(/\.$/, "")}.`
      : `Maintained the ${repoName} repository.`,
    ...(namedTools.length > 0
      ? [`Used ${namedTools.join(", ")} in ${repoName}.`]
      : []),
  ];

  return {
    bullets: fallbackBullets,
    technologies: manifestTechnologies,
  };
}

export async function syncGitHubProjects(
  usernameOrUrl: string,
  options: {
    llmProvider?: LlmProvider;
    localOllamaUrl?: string | null;
    ollamaModel?: string | null;
    allowCloudFallback?: boolean;
    accountId?: string | null;
    accountRules?: Partial<AccountRules> | null;
  } = {}
): Promise<ProjectItem[]> {
  const username = normalizeGitHubUsername(usernameOrUrl);
  const endpoint = `https://api.github.com/users/${encodeURIComponent(
    username
  )}/repos?sort=updated&per_page=15&type=owner`;

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

    const readme =
      (await fetchRawFile(username, repo.name, branch, "README.md")) ??
      (await fetchRawFile(username, repo.name, branch, "readme.md"));

    const detectedDeps: string[] = [];
    for (const manifest of COMMON_MANIFESTS) {
      const content = await fetchRawFile(username, repo.name, branch, manifest);
      if (content) {
        detectedDeps.push(...parseManifestDependencies(manifest, content));
      }
    }

    const baseTechs = [repo.language, ...(repo.topics ?? [])].filter(
      (v): v is string => Boolean(v)
    );
    const combinedTechs = [...new Set([...baseTechs, ...detectedDeps])].slice(
      0,
      15
    );

    const analysis = await analyzeRepoArtifacts({
      repoName: repo.name,
      description: repo.description ?? "",
      readme,
      manifestTechnologies: combinedTechs,
      llmOptions: options,
    });

    projects.push({
      name: repo.name,
      description: repo.description || "Open-source repository on GitHub",
      link: repo.html_url,
      technologies:
        analysis.technologies.length > 0
          ? analysis.technologies
          : combinedTechs,
      bullets: analysis.bullets,
      origin: "GITHUB_INFERRED",
    });
  }

  return projects;
}
