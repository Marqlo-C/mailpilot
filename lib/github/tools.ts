import { ALL_FILE_EXTENSIONS_SET } from "./schema.ssot";

/**
 * Canonical tool display mapping, micro-exclusion denylist,
 * and case-folding tool deduplication.
 */

export const CANONICAL_TOOL_MAP: Record<string, string> = {
  // Web Frameworks & Libraries
  react: "React",
  "react-dom": "React",
  "react.js": "React",
  next: "Next.js",
  nextjs: "Next.js",
  "next.js": "Next.js",
  vue: "Vue.js",
  vuejs: "Vue.js",
  "vue.js": "Vue.js",
  nuxt: "Nuxt.js",
  nuxtjs: "Nuxt.js",
  "nuxt.js": "Nuxt.js",
  svelte: "Svelte",
  sveltekit: "SvelteKit",
  "@sveltejs/kit": "SvelteKit",
  angular: "Angular",
  "@angular/core": "Angular",
  solid: "SolidJS",
  solidjs: "SolidJS",
  astro: "Astro",

  // Languages & Runtimes
  typescript: "TypeScript",
  ts: "TypeScript",
  javascript: "JavaScript",
  js: "JavaScript",
  python: "Python",
  python3: "Python",
  rust: "Rust",
  go: "Go",
  golang: "Go",
  node: "Node.js",
  nodejs: "Node.js",
  "node.js": "Node.js",
  deno: "Deno",
  bun: "Bun",
  ruby: "Ruby",
  java: "Java",
  kotlin: "Kotlin",
  swift: "Swift",
  csharp: "C#",
  "c#": "C#",
  cpp: "C++",
  "c++": "C++",

  // Backend Frameworks
  fastapi: "FastAPI",
  flask: "Flask",
  django: "Django",
  express: "Express",
  "express.js": "Express",
  nest: "NestJS",
  nestjs: "NestJS",
  "@nestjs/core": "NestJS",
  fastify: "Fastify",
  koa: "Koa",
  hono: "Hono",

  // Databases & Caching
  postgresql: "PostgreSQL",
  postgres: "PostgreSQL",
  pg: "PostgreSQL",
  mysql: "MySQL",
  sqlite: "SQLite",
  sqlite3: "SQLite",
  mongodb: "MongoDB",
  mongo: "MongoDB",
  redis: "Redis",

  // ORMs & Data Layers
  prisma: "Prisma",
  "@prisma/client": "Prisma",
  drizzle: "Drizzle ORM",
  "drizzle-orm": "Drizzle ORM",
  typeorm: "TypeORM",
  sqlalchemy: "SQLAlchemy",

  // APIs & Networking
  graphql: "GraphQL",
  apollo: "Apollo GraphQL",
  trpc: "tRPC",
  "@trpc/server": "tRPC",
  "@trpc/client": "tRPC",
  grpc: "gRPC",
  "@grpc/grpc-js": "gRPC",
  websockets: "WebSockets",
  ws: "WebSockets",
  "socket.io": "Socket.io",

  // Styling & UI
  tailwind: "TailwindCSS",
  tailwindcss: "TailwindCSS",
  "tailwind css": "TailwindCSS",
  "radix-ui": "Radix UI",
  radix: "Radix UI",
  "@radix-ui": "Radix UI",
  "@radix-ui/react-dialog": "Radix UI",
  "@radix-ui/react-dropdown-menu": "Radix UI",
  "@radix-ui/react-popover": "Radix UI",
  "@radix-ui/react-select": "Radix UI",
  "@radix-ui/react-tooltip": "Radix UI",
  "@radix-ui/react-slot": "Radix UI",
  shadcn: "shadcn/ui",
  "shadcn/ui": "shadcn/ui",
  "@shadcn/ui": "shadcn/ui",

  // QA, Testing & Validation (Keep Signal!)
  jest: "Jest",
  vitest: "Vitest",
  playwright: "Playwright",
  "@playwright/test": "Playwright",
  cypress: "Cypress",
  pytest: "Pytest",
  zod: "Zod",
  pydantic: "Pydantic",

  // Bundlers & Build Tools (Keep Signal!)
  vite: "Vite",
  webpack: "Webpack",
  turborepo: "Turborepo",
  turbo: "Turborepo",

  // DevOps & Cloud
  docker: "Docker",
  kubernetes: "Kubernetes",
  k8s: "Kubernetes",
  terraform: "Terraform",
  aws: "AWS",
  gcp: "GCP",
  azure: "Azure",

  // Messaging & Concurrency
  kafka: "Kafka",
  kafkajs: "Kafka",
  rabbitmq: "RabbitMQ",
  amqplib: "RabbitMQ",
  nats: "NATS",
  bull: "BullMQ",
  bullmq: "BullMQ",
  celery: "Celery",
};

/**
 * Regex matching zero-signal development scaffolding, linter/formatter configs,
 * and local git/task runner tooling that should be micro-excluded.
 *
 * NOTE: High-signal QA frameworks (Jest, Playwright, Cypress, Vitest, Pytest),
 * bundlers (Vite, Webpack, Turborepo), and ORMs (Prisma) are explicitly preserved.
 */
export const MICRO_EXCLUSION_REGEX =
  /^(?:@types\/|eslint(?:-[a-z0-9_-]+)*|prettier(?:-[a-z0-9_-]+)*|@typescript-eslint\/|husky|lint-staged|cross-env|rimraf|concurrently|nodemon|ts-node$)/i;

/**
 * Checks whether a package or dependency name is zero-signal scaffolding.
 */
export function isMicroExclusionTool(name: string): boolean {
  if (!name) return true;
  const lower = name.trim().toLowerCase();

  // 1. Type stubs
  if (lower.startsWith("@types/")) return true;

  // 2. Linters, formatters, and their configs/plugins
  if (
    lower === "eslint" ||
    lower.startsWith("eslint-") ||
    lower.startsWith("@typescript-eslint/") ||
    lower === "prettier" ||
    lower.startsWith("prettier-") ||
    lower.startsWith("prettier-plugin-")
  ) {
    return true;
  }

  // 3. Local task runners and git hooks
  const scaffolding = new Set([
    "husky",
    "lint-staged",
    "cross-env",
    "rimraf",
    "concurrently",
    "nodemon",
    "ts-node",
  ]);

  if (scaffolding.has(lower)) {
    return true;
  }

  // 4. Physical source code filenames (e.g. marqlo_players_final_ver.py, visualizer.js, [fileId].js)
  // Known dot-libraries (e.g. Next.js, Node.js, Socket.io) are explicitly in CANONICAL_TOOL_MAP.
  if (!CANONICAL_TOOL_MAP[lower]) {
    const dotIndex = lower.lastIndexOf(".");
    if (dotIndex !== -1) {
      const ext = lower.slice(dotIndex + 1).toLowerCase();
      if (ALL_FILE_EXTENSIONS_SET.has(ext)) {
        return true;
      }
    }
  }

  // 5. Physical directory paths (e.g. src/app, lib/utils, but preserve scoped npm packages like @radix-ui/react-dialog)
  if (lower.includes("/")) {
    if (!lower.startsWith("@")) {
      return true;
    }
  }

  return false;
}

/**
 * Case-folding canonical tool normalizer and deduplicator.
 *
 * 1. Filters out micro-exclusion noise (eslint, prettier, husky, @types/*, etc.)
 * 2. Maps recognized tools to their canonical display names (e.g. `react` -> `React`, `nextjs` -> `Next.js`)
 * 3. Unrecognized tools fall back to original casing on first encounter
 * 4. Deduplicates case-insensitively using a seen set
 */
export function dedupeTools(tools: string[]): string[] {
  if (!Array.isArray(tools)) return [];

  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const raw of tools) {
    if (!raw || typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;

    // Filter out scaffolding noise
    if (isMicroExclusionTool(trimmed)) {
      continue;
    }

    const lower = trimmed.toLowerCase();

    // Determine canonical display name: map if recognized, else preserve original casing
    const displayName = CANONICAL_TOOL_MAP[lower] ?? trimmed;

    const checkKey = displayName.toLowerCase();
    if (!seen.has(checkKey)) {
      seen.add(checkKey);
      deduped.push(displayName);
    }
  }

  return deduped;
}
