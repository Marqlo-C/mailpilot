import { isMicroExclusionTool } from "./tools";

export const COMMON_MANIFESTS = [
  "package.json",
  "requirements.txt",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml",
] as const;

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

/**
 * Extracts dependency package names from manifests, stripping linter and dev tooling noise
 * while preserving critical QA frameworks (Jest, Playwright, Vitest, Pytest), bundlers, and ORMs.
 */
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
        (dep) => dep.toLowerCase() !== "typescript" && !isMicroExclusionTool(dep)
      );
    }
    if (filename.endsWith("requirements.txt")) {
      return content
        .split("\n")
        .map((line) => line.split(/[=<>~;]/)[0]?.trim() ?? "")
        .filter(
          (line) =>
            line.length > 0 &&
            !line.startsWith("#") &&
            !isMicroExclusionTool(line)
        );
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
          if (quoted[1] && !isMicroExclusionTool(quoted[1])) {
            names.push(quoted[1]);
          }
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
          !key.startsWith("project") &&
          !isMicroExclusionTool(key)
        ) {
          names.push(m[1]!);
        }
      }
      return [...new Set(names)].slice(0, 40);
    }
    if (filename.endsWith("go.mod")) {
      const matches = [...content.matchAll(/require\s+([^\s]+)/g)];
      return matches
        .map((m) => m[1]?.split("/").pop() || m[1] || "")
        .filter((name) => Boolean(name) && !isMicroExclusionTool(name));
    }
    if (filename.endsWith("Cargo.toml")) {
      const section = content.match(
        /\[dependencies\]([\s\S]*?)(?:\n\[|\s*$)/
      );
      if (section?.[1]) {
        return [
          ...section[1].matchAll(/^([a-zA-Z0-9_-]+)\s*=/gm),
        ]
          .map((m) => m[1]!)
          .filter((name) => !isMicroExclusionTool(name));
      }
      const matches = [...content.matchAll(/\[dependencies\.([^\]]+)\]/g)];
      return matches
        .map((m) => m[1]!)
        .filter((name) => !isMicroExclusionTool(name));
    }
  } catch {
    // Ignore JSON/parsing errors in messy manifests
  }
  return found;
}

/**
 * Detects workspace or monorepo markers in package.json or workspace YAMLs.
 */
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
  if (filename.includes("pnpm-workspace") || filename.endsWith("lerna.json")) {
    return true;
  }
  return false;
}

/**
 * Organizes detected packages into systems engineering domain groupings
 * providing structured architectural context for deep inference.
 */
export function groupDependenciesByDomain(
  packages: string[]
): Record<string, string[]> {
  const domains: Record<string, string[]> = {
    "Networking & Protocols": [],
    "State, Storage & Persistence": [],
    "Concurrency, Queues & Messaging": [],
    "Architecture & Web Frameworks": [],
    "Math, Compute & ML": [],
    "Telemetry, Hardening & Security": [],
    "Core Utilities & Systems": [],
  };

  for (const rawPkg of packages) {
    const pkg = rawPkg.toLowerCase();

    // Networking & Protocols
    if (
      pkg === "ws" ||
      pkg.includes("socket.io") ||
      pkg === "websockets" ||
      pkg.includes("grpc") ||
      pkg === "axios" ||
      pkg === "got" ||
      pkg === "httpx" ||
      pkg === "aiohttp" ||
      pkg === "requests" ||
      pkg.includes("graphql") ||
      pkg.includes("trpc")
    ) {
      domains["Networking & Protocols"].push(rawPkg);
      continue;
    }

    // State, Storage & Persistence
    if (
      pkg.includes("redis") ||
      pkg.includes("postgres") ||
      pkg === "pg" ||
      pkg.includes("psycopg") ||
      pkg.includes("asyncpg") ||
      pkg.includes("mysql") ||
      pkg.includes("sqlite") ||
      pkg.includes("prisma") ||
      pkg.includes("typeorm") ||
      pkg.includes("sqlalchemy") ||
      pkg.includes("diesel") ||
      pkg.includes("mongo") ||
      pkg.includes("elastic")
    ) {
      domains["State, Storage & Persistence"].push(rawPkg);
      continue;
    }

    // Concurrency, Queues & Messaging
    if (
      pkg.includes("kafka") ||
      pkg.includes("bull") ||
      pkg.includes("celery") ||
      pkg.includes("amqp") ||
      pkg.includes("rabbitmq") ||
      pkg.includes("nats") ||
      pkg === "tokio" ||
      pkg === "asyncio" ||
      pkg.includes("p-limit") ||
      pkg.includes("p-queue")
    ) {
      domains["Concurrency, Queues & Messaging"].push(rawPkg);
      continue;
    }

    // Architecture & Web Frameworks
    if (
      pkg === "next" ||
      pkg === "react" ||
      pkg === "react-dom" ||
      pkg === "vue" ||
      pkg === "nuxt" ||
      pkg === "svelte" ||
      pkg.includes("@sveltejs/kit") ||
      pkg.includes("@angular") ||
      pkg === "fastapi" ||
      pkg === "flask" ||
      pkg === "django" ||
      pkg === "tornado" ||
      pkg === "express" ||
      pkg.includes("@nestjs") ||
      pkg === "fastify" ||
      pkg === "koa" ||
      pkg === "hono" ||
      pkg === "gin" ||
      pkg === "echo" ||
      pkg === "fiber" ||
      pkg === "chi" ||
      pkg === "actix-web" ||
      pkg === "axum" ||
      pkg === "rocket"
    ) {
      domains["Architecture & Web Frameworks"].push(rawPkg);
      continue;
    }

    // Math, Compute & ML
    if (
      pkg === "numpy" ||
      pkg === "scipy" ||
      pkg === "pandas" ||
      pkg.includes("torch") ||
      pkg.includes("tensorflow") ||
      pkg === "jax" ||
      pkg.includes("sklearn") ||
      pkg.includes("scikit") ||
      pkg.includes("onnx") ||
      pkg.includes("transformers") ||
      pkg.includes("opencv") ||
      pkg === "cv2" ||
      pkg.includes("polars") ||
      pkg.includes("arrow") ||
      pkg.includes("gym") ||
      pkg.includes("stable-baselines")
    ) {
      domains["Math, Compute & ML"].push(rawPkg);
      continue;
    }

    // Telemetry, Hardening & Security
    if (
      pkg.includes("pino") ||
      pkg.includes("winston") ||
      pkg.includes("zap") ||
      pkg.includes("prometheus") ||
      pkg.includes("opentelemetry") ||
      pkg.includes("bcrypt") ||
      pkg.includes("argon") ||
      pkg.includes("jwt") ||
      pkg.includes("jsonwebtoken") ||
      pkg.includes("jose") ||
      pkg === "helmet" ||
      pkg === "cors" ||
      pkg === "zod" ||
      pkg === "pydantic"
    ) {
      domains["Telemetry, Hardening & Security"].push(rawPkg);
      continue;
    }

    // Core Utilities & Systems
    domains["Core Utilities & Systems"].push(rawPkg);
  }

  // Filter out empty domains
  const activeDomains: Record<string, string[]> = {};
  for (const [key, items] of Object.entries(domains)) {
    if (items.length > 0) {
      activeDomains[key] = [...new Set(items)];
    }
  }

  return activeDomains;
}
