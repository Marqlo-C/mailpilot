/**
 * Branding and social links configuration.
 * Configurable via environment variables for multi-tenant and open-source neutrality.
 */
export const BRANDING = {
  developerGithubUrl:
    process.env.NEXT_PUBLIC_DEVELOPER_GITHUB_URL || "https://github.com/marqlo-c",
  repositoryUrl:
    process.env.NEXT_PUBLIC_REPOSITORY_URL || "https://github.com/Marqlo-C/mailpilot",
} as const;
