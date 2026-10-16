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
 * Transforms a raw GitHub repository and its technical analysis into a validated ProjectItem.
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

  return {
    name: normalizeProjectName(repo.name),
    description: repo.description || "Open-source repository on GitHub",
    link: repo.html_url,
    technologies: mergedTechs.length > 0 ? mergedTechs : manifestTechnologies,
    bullets,
    origin: "GITHUB_INFERRED",
  };
}
