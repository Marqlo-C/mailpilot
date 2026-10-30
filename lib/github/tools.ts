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
  remix: "Remix",
  "@remix-run/react": "Remix",
  gatsby: "Gatsby",

  // Mobile & Cross-Platform
  "react-native": "React Native",
  "react native": "React Native",
  flutter: "Flutter",
  expo: "Expo",
  electron: "Electron",
  tauri: "Tauri",

  // Geospatial, Graphics & Visualization (including dot-libraries)
  leaflet: "Leaflet",
  "leaflet.js": "Leaflet",
  mapbox: "Mapbox GL",
  "mapbox-gl": "Mapbox GL",
  openlayers: "OpenLayers",
  ol: "OpenLayers",
  three: "Three.js",
  "three.js": "Three.js",
  chart: "Chart.js",
  "chart.js": "Chart.js",
  d3: "D3.js",
  "d3.js": "D3.js",
  pixi: "PixiJS",
  pixijs: "PixiJS",
  "pixi.js": "PixiJS",
  p5: "p5.js",
  "p5.js": "p5.js",
  fabric: "Fabric.js",
  "fabric.js": "Fabric.js",

  // Utility Dot-Libraries (Prevents false-positive script filtering)
  dayjs: "Day.js",
  "day.js": "Day.js",
  moment: "Moment.js",
  "moment.js": "Moment.js",
  "date-fns": "date-fns",
  pdfjs: "PDF.js",
  "pdf.js": "PDF.js",
  highlightjs: "Highlight.js",
  "highlight.js": "Highlight.js",
  hljs: "Highlight.js",
  prismjs: "PrismJS",
  "prism.js": "PrismJS",
  anime: "Anime.js",
  "anime.js": "Anime.js",
  videojs: "Video.js",
  "video.js": "Video.js",

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
  php: "PHP",
  scala: "Scala",
  elixir: "Elixir",
  clojure: "Clojure",
  haskell: "Haskell",
  lua: "Lua",
  dart: "Dart",
  r: "R",
  perl: "Perl",

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
  spring: "Spring Boot",
  "spring boot": "Spring Boot",
  rails: "Ruby on Rails",
  laravel: "Laravel",

  // AI, Machine Learning & Data Science
  pytorch: "PyTorch",
  torch: "PyTorch",
  tensorflow: "TensorFlow",
  tf: "TensorFlow",
  keras: "Keras",
  "scikit-learn": "Scikit-learn",
  sklearn: "Scikit-learn",
  pandas: "Pandas",
  numpy: "NumPy",
  scipy: "SciPy",
  langchain: "LangChain",
  llamaindex: "LlamaIndex",
  "llama-index": "LlamaIndex",
  huggingface: "Hugging Face",
  "@huggingface/inference": "Hugging Face",
  opencv: "OpenCV",
  cv2: "OpenCV",
  ollama: "Ollama",
  anthropic: "Anthropic Claude",
  openai: "OpenAI API",

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
  supabase: "Supabase",
  "@supabase/supabase-js": "Supabase",
  firebase: "Firebase",
  "firebase-admin": "Firebase",
  firestore: "Firestore",
  dynamodb: "DynamoDB",
  cassandra: "Cassandra",
  neo4j: "Neo4j",
  clickhouse: "ClickHouse",
  elasticsearch: "Elasticsearch",
  opensearch: "OpenSearch",

  // Vector Databases
  pinecone: "Pinecone",
  "@pinecone-database/pinecone": "Pinecone",
  chromadb: "ChromaDB",
  chroma: "ChromaDB",
  weaviate: "Weaviate",
  qdrant: "Qdrant",
  milvus: "Milvus",

  // ORMs & Data Layers
  prisma: "Prisma",
  "@prisma/client": "Prisma",
  drizzle: "Drizzle ORM",
  "drizzle-orm": "Drizzle ORM",
  typeorm: "TypeORM",
  sqlalchemy: "SQLAlchemy",
  mongoose: "Mongoose",
  hibernate: "Hibernate",

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
  "socket.io-client": "Socket.io",
  axios: "Axios",

  // State Management & Data Fetching
  redux: "Redux",
  "@reduxjs/toolkit": "Redux Toolkit",
  zustand: "Zustand",
  "tanstack-query": "TanStack Query",
  "@tanstack/react-query": "TanStack Query",
  "react-query": "TanStack Query",
  "tanstack-table": "TanStack Table",
  "@tanstack/react-table": "TanStack Table",
  swr: "SWR",

  // Styling, UI & Animation
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
  "framer-motion": "Framer Motion",
  framer: "Framer Motion",
  "styled-components": "styled-components",
  emotion: "Emotion",
  "@emotion/react": "Emotion",
  "chakra-ui": "Chakra UI",
  "@chakra-ui/react": "Chakra UI",
  mui: "Material UI",
  "@mui/material": "Material UI",
  mantine: "Mantine",
  "@mantine/core": "Mantine",
  "lucide-react": "Lucide Icons",
  lucide: "Lucide Icons",

  // QA, Testing & Validation (Keep Signal!)
  jest: "Jest",
  vitest: "Vitest",
  playwright: "Playwright",
  "@playwright/test": "Playwright",
  cypress: "Cypress",
  pytest: "Pytest",
  mocha: "Mocha",
  chai: "Chai",
  zod: "Zod",
  pydantic: "Pydantic",

  // Bundlers & Build Tools (Keep Signal!)
  vite: "Vite",
  webpack: "Webpack",
  turborepo: "Turborepo",
  turbo: "Turborepo",
  rollup: "Rollup",
  esbuild: "esbuild",
  babel: "Babel",

  // DevOps & Cloud
  docker: "Docker",
  kubernetes: "Kubernetes",
  k8s: "Kubernetes",
  terraform: "Terraform",
  aws: "AWS",
  gcp: "GCP",
  azure: "Azure",
  cloudflare: "Cloudflare",
  vercel: "Vercel",
  render: "Render",
  ansible: "Ansible",
  serverless: "Serverless Framework",

  // Messaging, Concurrency & Workflows
  kafka: "Kafka",
  kafkajs: "Kafka",
  rabbitmq: "RabbitMQ",
  amqplib: "RabbitMQ",
  nats: "NATS",
  bull: "BullMQ",
  bullmq: "BullMQ",
  celery: "Celery",
  spark: "Apache Spark",
  "apache spark": "Apache Spark",
  airflow: "Apache Airflow",
  "apache airflow": "Apache Airflow",
};

/**
 * Regex matching zero-signal development scaffolding, linter/formatter configs,
 * and local git/task runner tooling that should be micro-excluded.
 *
 * NOTE: High-signal QA frameworks (Jest, Playwright, Cypress, Vitest, Pytest),
 * bundlers (Vite, Webpack, Turborepo), and ORMs (Prisma) are explicitly preserved.
 */
export const MICRO_EXCLUSION_REGEX =
  /^(?:@types\/|eslint(?:-[a-z0-9_-]+)*|prettier(?:-[a-z0-9_-]+)*|@typescript-eslint\/|@vitejs\/|vite-plugin-|@rollup\/plugin-|babel-plugin-|postcss|autoprefixer|husky|lint-staged|cross-env|rimraf|concurrently|nodemon|ts-node$)/i;

/**
 * Checks whether a package or dependency name is zero-signal scaffolding.
 */
export function isMicroExclusionTool(name: string): boolean {
  if (!name) return true;
  const lower = name.trim().toLowerCase();

  // 1. Type stubs
  if (lower.startsWith("@types/")) return true;

  // 2. Linters, formatters, build/compiler plugins, and CSS post-processors
  if (
    lower === "eslint" ||
    lower.startsWith("eslint-") ||
    lower.startsWith("@typescript-eslint/") ||
    lower === "prettier" ||
    lower.startsWith("prettier-") ||
    lower.startsWith("prettier-plugin-") ||
    lower.startsWith("@vitejs/") ||
    lower.startsWith("vite-plugin-") ||
    lower.startsWith("@rollup/plugin-") ||
    lower.startsWith("babel-plugin-") ||
    lower === "postcss" ||
    lower === "autoprefixer"
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
