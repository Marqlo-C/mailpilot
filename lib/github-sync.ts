export type ProjectItem = {
  id?: string;
  name: string;
  description: string;
  technologies: string[];
  link: string | null;
  bullets: string[];
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
};

/**
 * Extracts a GitHub username from a bare handle or profile/URL string.
 */
export function normalizeGitHubUsername(usernameOrUrl: string): string {
  const raw = usernameOrUrl.trim().replace(/\/+$/, "");
  if (!raw) {
    throw new Error("GitHub username or URL is required");
  }

  try {
    if (raw.includes("github.com")) {
      const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0]) return parts[0].replace(/^@/, "");
    }
  } catch {
    // fall through to bare handle parsing
  }

  return raw.replace(/^@/, "").split("/")[0] ?? raw;
}

/**
 * Syncs public non-fork GitHub repositories into Project schema items.
 */
export async function syncGitHubProjects(
  usernameOrUrl: string
): Promise<ProjectItem[]> {
  const username = normalizeGitHubUsername(usernameOrUrl);
  const endpoint = `https://api.github.com/users/${encodeURIComponent(
    username
  )}/repos?sort=updated&per_page=30&type=owner`;

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

  return repos
    .filter((repo) => !repo.fork && !repo.archived)
    .map((repo) => {
      const technologies = [repo.language, ...(repo.topics ?? [])].filter(
        (value): value is string => Boolean(value)
      );

      const bullets = [
        `Created and maintained repository with ${repo.stargazers_count} stars and ${repo.forks_count} forks.`,
        repo.description ? `Focused on ${repo.description}.` : "",
      ].filter(Boolean);

      return {
        name: repo.name,
        description: repo.description || "Open-source repository on GitHub",
        link: repo.html_url,
        technologies,
        bullets,
      };
    });
}
