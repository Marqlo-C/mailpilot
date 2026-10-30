import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm", () => ({
  callLLMWithFallback: vi.fn(),
}));

import { callLLMWithFallback } from "@/lib/llm";
import {
  extractSemanticMarkdownDigest,
  determineRepoScale,
  deduceArchitecturalTopology,
  parseManifestDependencies,
  groupDependenciesByDomain,
  adaptRepoToProjectItem,
  analyzeRepoArtifacts,
  syncGitHubProjects,
  normalizeGitHubUsername,
  sanitizeBulletString,
  stripFilenamePhrases,
  stripFileSystemArtifacts,
  unrollRoboticHeadingPrefix,
  unrollPermissivePhrasing,
  cleanTrivialPrimitives,
  auditBulletSubstantiveness,
  deduplicateOrSynthesizeBullets,
  diversifyLeadingVerbs,
  isUngroundedHallucination,
  LOW_SIGNAL_CHORE_REGEX,
  DEEP_ANALYSIS_SYSTEM_PROMPT,
  FILTER_OUT_REGEX,
  PRIORITY_REGEX,
  dedupeTools,
  isMicroExclusionTool,
  clearGlobalRepoCache,
  CANONICAL_TOOL_MAP,
  GITHUB_PARSER_VERSION,
  calculatePureCodeBytes,
  countVerifiedSubsystems,
  detectArchitecturalDimension,
  type GitHubRawRepo,
} from "@/lib/github";
import { consolidateProfiles } from "@/lib/profile/profile-consolidation";
import { getEmptyMasterProfileData, detectMetric } from "@/lib/validations/profile";

describe("GitHub Syncer & Elastic Ingestion Architecture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Markdown Boilerplate Stripping & Semantic Filtering", () => {
    it("strips badges, images, HTML comments, and sponsor links cleanly", () => {
      const rawMarkdown = `# FastKV
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com)
[![Coverage](https://codecov.io/gh/repo/branch/main/graph/badge.svg)](https://codecov.io)
<!-- Internal architectural comments -->
<img src="https://example.com/logo.png" width="300" />
[Sponsor this project on GitHub](https://github.com/sponsors/user)

FastKV is an in-memory transactional key-value store engineered with multi-version concurrency control.

## Installation
npm install fastkv
curl -sSL https://install.example.com | bash

## License
MIT
`;

      const digest = extractSemanticMarkdownDigest(rawMarkdown, 2500);

      // Verify boilerplate is removed
      expect(digest).not.toContain("img.shields.io");
      expect(digest).not.toContain("codecov.io");
      expect(digest).not.toContain("Internal architectural comments");
      expect(digest).not.toContain("logo.png");
      expect(digest).not.toContain("sponsors");
      expect(digest).not.toContain("Installation");
      expect(digest).not.toContain("npm install");
      expect(digest).not.toContain("License");

      // Verify high-level summary is preserved
      expect(digest).toContain("FastKV is an in-memory transactional key-value store");
    });

    it("purges multiline shell & terminal code fences while preserving prose and inline backticks", () => {
      const rawMarkdown = `# StreamGateway
StreamGateway is an asynchronous event gateway.

## Architecture & System Design
The engine connects clients using WebSockets and routes messages via internal event busses.
To test manually, run:
\`\`\`bash
$ curl -X POST https://api.streamgateway.internal/v1/events \\
  -H "Authorization: Bearer test_token" \\
  -d '{"event":"user_login"}'
\`\`\`

Inline backticks like \`WebSocketGateway\` and \`EventDispatcher\` must be retained.

\`\`\`sh
$ docker run -d -p 8080:8080 streamgateway:latest
\`\`\`
`;

      const digest = extractSemanticMarkdownDigest(rawMarkdown, 2500);

      // Shell fences purged
      expect(digest).not.toContain("curl -X POST");
      expect(digest).not.toContain("docker run -d");
      expect(digest).not.toContain("test_token");

      // Architecture prose and inline backticks preserved
      expect(digest).toContain("## Architecture & System Design");
      expect(digest).toContain("connects clients using WebSockets");
      expect(digest).toContain("`WebSocketGateway`");
      expect(digest).toContain("`EventDispatcher`");
    });

    it("filters out non-technical sections and prioritizes systems architecture", () => {
      const rawMarkdown = `# TelemetryMesh
TelemetryMesh is an agentic telemetry aggregation service.

## Prerequisites & Requirements
- Node.js 20+
- Docker Compose

## Architecture & System Design
The engine utilizes an asynchronous ring buffer to decouple UDP ingestion from batched disk persistence.

## Benchmarks & Performance
Sustains 120,000 telemetry events per second at sub-4ms p99 latency.

## Contributing & Code of Conduct
Please read CONTRIBUTING.md before opening pull requests.
`;

      const digest = extractSemanticMarkdownDigest(rawMarkdown, 5500);

      expect(digest).toContain("TelemetryMesh is an agentic telemetry aggregation service.");
      expect(digest).toContain("## Architecture & System Design");
      expect(digest).toContain("ring buffer to decouple UDP ingestion");
      expect(digest).toContain("## Benchmarks & Performance");
      expect(digest).toContain("120,000 telemetry events per second");

      expect(digest).not.toContain("Prerequisites");
      expect(digest).not.toContain("Contributing");
    });

    it("filters out expanded setup, usage, dependencies, and troubleshooting sections", () => {
      const rawMarkdown = `# EdgeMesh
EdgeMesh is a distributed edge proxy.

## How to Use
Run \`edgemesh start\` in your terminal.

## Quickstart
Follow these 3 easy steps.

## Usage
edgemesh --port 8080

## Dependencies
Requires libssl and cmake.

## Local Setup
npm run dev

## Running Locally
docker run -p 8080:8080 edgemesh

## Development Setup
Install git and docker.

## Troubleshooting
If port 8080 is in use, change the port.

## FAQ
Q: Can I use this on macOS? A: Yes.

## WAF & Rate Limiting
Engineered with token-bucket rate limiting and edge IP challenge verification.

## Telemetry Infrastructure
Streams metrics via OpenTelemetry gRPC exporters.
`;

      const digest = extractSemanticMarkdownDigest(rawMarkdown, 5000);

      expect(digest).toContain("## WAF & Rate Limiting");
      expect(digest).toContain("token-bucket rate limiting");
      expect(digest).toContain("## Telemetry Infrastructure");
      expect(digest).toContain("OpenTelemetry gRPC exporters");

      expect(digest).not.toContain("How to Use");
      expect(digest).not.toContain("Quickstart");
      expect(digest).not.toContain("Usage");
      expect(digest).not.toContain("Dependencies");
      expect(digest).not.toContain("Local Setup");
      expect(digest).not.toContain("Running Locally");
      expect(digest).not.toContain("Development Setup");
      expect(digest).not.toContain("Troubleshooting");
      expect(digest).not.toContain("FAQ");
    });

    it("proportionally allocates character budgets across all surviving sections instead of linear front-loading", () => {
      const largeSectionBody = Array.from(
        { length: 25 },
        (_, i) =>
          `Cluster Node Subsystem #${i + 1}: Manages partition queue with dedicated worker threads, applying rate-limiting tokens and telemetry emission over gRPC channels.`
      ).join(" "); // ~4,000 characters

      const rawMarkdown = `# DistributedCore
DistributedCore is a fault-tolerant distributed computing engine.

## Core Architecture
${largeSectionBody}

## WAF & Rate Limiting
Engineered with token-bucket rate limiting and edge IP challenge verification.

## Telemetry Infrastructure
Streams metrics via OpenTelemetry gRPC exporters with sub-millisecond precision.
`;

      // Constrained budget of 1,800 characters:
      // Greedy linear scanning would have eaten all 1,800 chars on Core Architecture, starving WAF and Telemetry.
      const digest = extractSemanticMarkdownDigest(rawMarkdown, 1800);

      expect(digest.length).toBeLessThanOrEqual(1800);
      expect(digest).toContain("DistributedCore is a fault-tolerant");
      expect(digest).toContain("## Core Architecture");
      expect(digest).toContain("## WAF & Rate Limiting");
      expect(digest).toContain("token-bucket rate limiting");
      expect(digest).toContain("## Telemetry Infrastructure");
      expect(digest).toContain("OpenTelemetry gRPC exporters");
    });
  });

  describe("Dynamic 3-Tier Repository Complexity Budgeting", () => {
    it("classifies small repositories as Tier 1 with 2,500 budget and 3-4 bullets", () => {
      const scale = determineRepoScale({
        size: 1450,
        manifestCount: 1,
        hasMonorepoStructure: false,
      });

      expect(scale.tier).toBe(1);
      expect(scale.ingestCharBudget).toBe(2500);
      expect(scale.minBullets).toBe(3);
      expect(scale.maxBullets).toBe(4);
      expect(scale.targetScope).toContain("CLI tools");
    });

    it("classifies mid-scale services as Tier 2 with 5,500 budget and 4-8 bullets", () => {
      const scaleBySize = determineRepoScale({
        size: 7200,
        manifestCount: 1,
      });
      expect(scaleBySize.tier).toBe(2);
      expect(scaleBySize.ingestCharBudget).toBe(5500);
      expect(scaleBySize.minBullets).toBe(4);
      expect(scaleBySize.maxBullets).toBe(8);

      const scaleByManifests = determineRepoScale({
        size: 2100,
        manifestCount: 2,
      });
      expect(scaleByManifests.tier).toBe(2);
    });

    it("classifies large or monorepo repositories as Tier 3 with 10,000 budget and 6-10 bullets", () => {
      const scaleBySize = determineRepoScale({
        size: 19500,
        manifestCount: 1,
      });
      expect(scaleBySize.tier).toBe(3);
      expect(scaleBySize.ingestCharBudget).toBe(10000);
      expect(scaleBySize.minBullets).toBe(6);
      expect(scaleBySize.maxBullets).toBe(10);

      const scaleByMonorepo = determineRepoScale({
        size: 1200,
        manifestCount: 1,
        hasMonorepoStructure: true,
      });
      expect(scaleByMonorepo.tier).toBe(3);
    });

    it("applies the 3-4 bullet safeguard when repository has no README", () => {
      const noReadmeScale = determineRepoScale({
        size: 25000,
        manifestCount: 3,
        hasMonorepoStructure: true,
        hasReadme: false,
      });

      expect(noReadmeScale.minBullets).toBe(3);
      expect(noReadmeScale.maxBullets).toBe(4);
      expect(noReadmeScale.targetScope).toContain("no README");
    });
  });

  describe("Cross-Manifest Architectural Deduction", () => {
    it("deduces decoupled Python backend paired with TypeScript Next.js frontend", () => {
      const topology = deduceArchitecturalTopology(
        ["fastapi", "uvicorn", "pydantic", "next", "react", "tailwindcss"],
        ["backend/requirements.txt", "apps/web/package.json"]
      );

      expect(topology).toBe(
        "Decoupled service layer pairing an asynchronous Python backend with a TypeScript web frontend."
      );
    });

    it("deduces distributed real-time messaging pipeline with WebSockets and Redis", () => {
      const topology = deduceArchitecturalTopology(["ws", "redis", "express"]);

      expect(topology).toBe(
        "Distributed real-time messaging pipeline coordinating WebSocket gateways through Redis pub/sub state synchronization."
      );
    });

    it("synthesizes combined multi-tier topology when both backend-frontend and real-time queues exist", () => {
      const topology = deduceArchitecturalTopology(
        ["fastapi", "next", "react", "ws", "redis"],
        ["backend/pyproject.toml", "apps/web/package.json"]
      );

      expect(topology).toContain("Decoupled service layer pairing an asynchronous Python backend with a TypeScript web frontend");
      expect(topology).toContain("distributed real-time messaging pipeline coordinating WebSocket gateways through Redis pub/sub state synchronization");
    });
  });

  describe("Systems Dependency Domain Grouping", () => {
    it("categorizes tools into precise systems roles", () => {
      const groups = groupDependenciesByDomain([
        "ws",
        "ioredis",
        "fastapi",
        "torch",
        "numpy",
        "pino",
        "zod",
        "commander",
      ]);

      expect(groups["Networking & Protocols"]).toContain("ws");
      expect(groups["State, Storage & Persistence"]).toContain("ioredis");
      expect(groups["Architecture & Web Frameworks"]).toContain("fastapi");
      expect(groups["Math, Compute & ML"]).toContain("torch");
      expect(groups["Math, Compute & ML"]).toContain("numpy");
      expect(groups["Telemetry, Hardening & Security"]).toContain("pino");
      expect(groups["Telemetry, Hardening & Security"]).toContain("zod");
      expect(groups["Core Utilities & Systems"]).toContain("commander");
    });

    it("strips linter and development tooling noise from manifests", () => {
      const pkgJson = JSON.stringify({
        dependencies: {
          express: "^4.18.2",
          ws: "^8.13.0",
        },
        devDependencies: {
          eslint: "^8.0.0",
          prettier: "^3.0.0",
          "@types/node": "^20.0.0",
          typescript: "^5.0.0",
          vitest: "^1.0.0",
        },
      });

      const deps = parseManifestDependencies("package.json", pkgJson);
      expect(deps).toContain("express");
      expect(deps).toContain("ws");
      expect(deps).not.toContain("eslint");
      expect(deps).not.toContain("prettier");
      expect(deps).not.toContain("@types/node");
      expect(deps).not.toContain("typescript");
      expect(deps).toContain("vitest");
    });
  });

  describe("Lens & Project Item Transformation", () => {
    it("transforms raw repo payload and preserves merged technologies", () => {
      const item = adaptRepoToProjectItem({
        repo: {
          name: "stream-pipeline",
          description: "Distributed stream processor",
          html_url: "https://github.com/org/stream-pipeline",
          fork: false,
          archived: false,
          language: "Go",
          topics: ["streaming", "concurrency"],
          stargazers_count: 50,
          forks_count: 10,
        },
        bullets: ["Dispatched partition streams across 16 worker routines."],
        inferredTechnologies: ["Go", "Kafka"],
        manifestTechnologies: ["chi", "pgx"],
      });

      expect(item.name).toBe("Stream Pipeline");
      expect(item.origin).toBe("GITHUB_INFERRED");
      expect(item.technologies).toContain("Go");
      expect(item.technologies).toContain("Kafka");
      expect(item.technologies).toContain("chi");
      expect(item.technologies).toContain("pgx");
    });
  });

  describe("Simulated Small Repository (< 3MB, Single Manifest)", () => {
    const smallRepoReadme = `# cli-streamer
[![npm](https://img.shields.io/npm/v/cli-streamer)](https://npmjs.org)
CLI tool engineered to stream and transform large NDJSON datasets with bounded memory consumption.

## Installation
npm install -g cli-streamer

## How to Run
cli-streamer --input data.ndjson --output clean.ndjson

## Architecture & System Design
Engineered around Node.js stream pipelines utilizing backpressure to cap resident memory consumption under 35MB while processing gigabyte-scale inputs.

## License
MIT
`;

    it("extracts 2-3 concise tech-forward CAR bullets with zero installation clutter", async () => {
      const mockLLM = vi.mocked(callLLMWithFallback);
      mockLLM.mockResolvedValueOnce({
        bullets: [
          "Architected a high-throughput streaming CLI tool in TypeScript, processing gigabyte-scale NDJSON data streams with strict backpressure flow control.",
          "Implemented bounded memory chunk transformers, constraining peak heap allocation to sub-35MB across multi-gigabyte batch pipelines.",
        ],
        extractedTechnologies: ["TypeScript", "Node.js Streams", "NDJSON"],
      });

      const analysis = await analyzeRepoArtifacts({
        repoName: "cli-streamer",
        description: "Streaming CLI tool for NDJSON transformations",
        readme: smallRepoReadme,
        manifestTechnologies: ["commander", "chalk"],
        repoSize: 1450, // 1.45 MB
        manifestPaths: ["package.json"],
        hasMonorepoStructure: false,
      });

      // Verify LLM payload
      expect(mockLLM).toHaveBeenCalledTimes(1);
      const callArgs = mockLLM.mock.calls[0][0];
      expect(callArgs.systemPrompt).toBe(DEEP_ANALYSIS_SYSTEM_PROMPT);

      const parsedPrompt = JSON.parse(callArgs.userPrompt);
      expect(parsedPrompt.repositoryScale).toContain("Tier 1");
      expect(parsedPrompt.targetBulletCount).toBe("3 to 4 candidate engineering bullets");
      expect(parsedPrompt.readmeDigest).toContain("CLI tool engineered to stream and transform large NDJSON datasets");
      expect(parsedPrompt.readmeDigest).toContain("Engineered around Node.js stream pipelines");
      expect(parsedPrompt.readmeDigest).not.toContain("npm install");
      expect(parsedPrompt.readmeDigest).not.toContain("How to Run");
      expect(parsedPrompt.readmeDigest).not.toContain("License");

      // Verify bullets
      expect(analysis.bullets).toHaveLength(2);
      expect(analysis.bullets[0]).toMatch(/^Architected\b/);
      expect(analysis.bullets[1]).toMatch(/^Implemented\b/);
      expect(analysis.bullets[0]).not.toContain("worked on");
      expect(analysis.bullets[0]).not.toContain("helped users");
    });

    it("produces decisive engineering bullets via heuristic fallback when LLM is unavailable", async () => {
      const mockLLM = vi.mocked(callLLMWithFallback);
      mockLLM.mockRejectedValueOnce(new Error("Local Ollama offline"));

      const analysis = await analyzeRepoArtifacts({
        repoName: "cli-streamer",
        description: "Streaming CLI tool for NDJSON transformations",
        readme: smallRepoReadme,
        manifestTechnologies: ["commander", "chalk"],
        repoSize: 1200,
        manifestPaths: ["package.json"],
      });

      expect(analysis.bullets.length).toBeGreaterThanOrEqual(2);
      expect(analysis.bullets[0]).toMatch(/^(Architected|Engineered|Implemented)\b/);
      expect(analysis.bullets[1]).toContain("commander, chalk");
      expect(analysis.bullets.some((b) => b.includes("helped users"))).toBe(false);
    });
  });

  describe("Simulated Complex Architecture (> 15MB, Multi-Manifest)", () => {
    // Generate an extensive Architecture section exceeding 5,000 characters
    const extensiveArchitectureSection = `
The distributed cluster consists of three discrete decoupled tiers:
1. Ingestion Gateway: Asynchronous endpoints terminate WebSockets and ingest high-velocity event vectors with zero serialization copy.
2. In-Memory Coordination Layer: Redis instances maintain shard ownership maps, pub/sub communication channels, and lease locks with sub-millisecond heartbeats.
3. Event Sinks and Persistence: Durable storage is backed by partitioned PostgreSQL tables with write-ahead log replication and automated retention compaction.
${Array.from({ length: 22 }, (_, i) => `Subsystem Node #${i + 1}: Manages partition queue #${i + 1} with dedicated worker threads, applying rate-limiting tokens and telemetry emission over gRPC channels. Each worker thread instruments cycle latencies, heap bounds, and error budgets.`).join("\n")}
`;

    const complexRepoReadme = `# MeshCluster
[![Coverage](https://codecov.io)](https://codecov.io)
MeshCluster is an enterprise-scale distributed telemetry orchestration engine.

## Installation
docker compose up -d
make build-all

## Architecture & System Design
${extensiveArchitectureSection}

## Concurrency & Protocol Benchmarks
Engineered to withstand 250,000 concurrent WebSocket connections across 8 containerized nodes with sub-25ms round-trip synchronization latency.

## Security & Authentication
Hardware-accelerated TLS termination paired with HMAC token verification and timing-safe secret comparisons.

## Code of Conduct
Respectful collaboration is strictly required.
`;

    it("preserves architectural sections beyond 4,000 characters and generates 6+ rich technical bullets", async () => {
      const mockLLM = vi.mocked(callLLMWithFallback);
      mockLLM.mockResolvedValueOnce({
        bullets: [
          "Architected an enterprise-scale distributed telemetry engine coordinating decoupled ingestion gateways across 8 containerized worker nodes.",
          "Implemented lock-free asynchronous WebSocket termination protocols, sustaining 250,000 concurrent client streams with sub-25ms round-trip latency.",
          "Engineered a distributed state synchronization layer utilizing Redis pub/sub and lease locks for sub-millisecond shard ownership discovery.",
          "Hardened persistence pipelines with partitioned PostgreSQL schema storage and automated write-ahead log retention compaction.",
          "Instrumented end-to-end telemetry pipelines with gRPC transport, streaming real-time error budgets, CPU utilization, and worker cycle latencies.",
          "Containerized multi-service deployment topologies with Docker and orchestrated automated CI/CD workflows across segregated service boundaries.",
        ],
        extractedTechnologies: [
          "FastAPI",
          "Next.js",
          "Redis",
          "WebSockets",
          "PostgreSQL",
          "gRPC",
          "Docker",
        ],
      });

      const analysis = await analyzeRepoArtifacts({
        repoName: "MeshCluster",
        description: "Enterprise distributed telemetry orchestration engine",
        readme: complexRepoReadme,
        manifestTechnologies: ["fastapi", "uvicorn", "next", "react", "redis", "ws"],
        repoSize: 18500, // 18.5 MB (> 15MB)
        manifestPaths: ["backend/pyproject.toml", "apps/web/package.json"],
        hasMonorepoStructure: true,
      });

      expect(mockLLM).toHaveBeenCalledTimes(1);
      const callArgs = mockLLM.mock.calls[0][0];

      const parsedPrompt = JSON.parse(callArgs.userPrompt);

      // Verify Tier 3 scale and target bullets (with oversampling on rich context: 10 + 2 = 12)
      expect(parsedPrompt.repositoryScale).toContain("Tier 3");
      expect(parsedPrompt.targetBulletCount).toBe("6 to 12 candidate engineering bullets");

      // Verify verified architectural topology was deduced and injected
      expect(parsedPrompt.verifiedArchitecturalTopology).toContain("Verified architectural topology:");
      expect(parsedPrompt.verifiedArchitecturalTopology).toContain("Decoupled service layer pairing an asynchronous Python backend with a TypeScript web frontend");

      // Verify elastic ingestion: architectural digest PRESERVES sections beyond 4,000 characters
      expect(parsedPrompt.readmeDigest.length).toBeGreaterThan(4000);
      expect(parsedPrompt.readmeDigest).toContain("Subsystem Node #20");
      expect(parsedPrompt.readmeDigest).toContain("## Concurrency & Protocol Benchmarks");
      expect(parsedPrompt.readmeDigest).toContain("## Security & Authentication");
      expect(parsedPrompt.readmeDigest).not.toContain("docker compose up");
      expect(parsedPrompt.readmeDigest).not.toContain("Code of Conduct");

      // Verify 6+ rich technical bullets covering multiple subsystems
      expect(analysis.bullets.length).toBeGreaterThanOrEqual(6);
      expect(analysis.bullets[0]).toMatch(/^Architected\b/);
      expect(analysis.bullets[1]).toMatch(/^Implemented\b/);
      expect(analysis.bullets[2]).toMatch(/^Engineered\b/);
      expect(analysis.bullets[3]).toMatch(/^Hardened\b/);
      expect(analysis.bullets[4]).toMatch(/^Instrumented\b/);
      expect(analysis.bullets[5]).toMatch(/^Containerized\b/);

      // Ban on fake commercial metrics: check that no fake revenue is generated
      for (const bullet of analysis.bullets) {
        expect(bullet).not.toMatch(/\$\d+/);
        expect(bullet).not.toMatch(/increased revenue/i);
        expect(bullet).not.toMatch(/active users/i);
      }
    });
  });

  describe("End-to-End GitHub Projects Synchronization", () => {
    it(
      "handles multiple public repositories with custom raw file fetcher",
      async () => {
      const mockLLM = vi.mocked(callLLMWithFallback);
      mockLLM.mockResolvedValue({
        bullets: [
          "Architected resilient event loop processors with sub-5ms latency bounds.",
          "Engineered automated telemetry collection across distributed nodes.",
        ],
        extractedTechnologies: ["TypeScript", "Node.js"],
      });

      // Mock GitHub API repos endpoint
      const mockRepos = [
        {
          name: "kv-cache",
          description: "High performance key-value cache",
          html_url: "https://github.com/developer/kv-cache",
          fork: false,
          archived: false,
          language: "TypeScript",
          topics: ["database", "cache"],
          stargazers_count: 42,
          forks_count: 5,
          default_branch: "main",
          size: 2500,
        },
      ];

      vi.spyOn(globalThis, "fetch").mockImplementationOnce(async () => ({
        ok: true,
        status: 200,
        json: async () => mockRepos,
      } as unknown as Response));

      const mockRawFetcher = vi.fn(async (_u, repo, _b, file) => {
        if (repo === "kv-cache" && file === "README.md") {
          return `# kv-cache\nHigh throughput in-memory cache.\n\n## Architecture\nBuilt with memory maps.\n\n## Installation\nnpm i`;
        }
        if (repo === "kv-cache" && file === "package.json") {
          return JSON.stringify({ dependencies: { ioredis: "^5.0.0" } });
        }
        return null;
      });

      const projects = await syncGitHubProjects("developer", {
        accountId: "acc-user-123",
        rawFetcher: mockRawFetcher,
      });

      expect(projects).toHaveLength(1);
      expect(projects[0].name).toBe("KV Cache");
      expect(projects[0].bullets).toHaveLength(2);
      expect(projects[0].origin).toBe("GITHUB_INFERRED");
      expect(projects[0].technologies).toContain("TypeScript");
      expect(projects[0].technologies).toContain("ioredis");
    }, 15000);
  });

  describe("Syntax Artifact & Quote Sanitization (sanitizeBulletString)", () => {
    it("strips unclosed or mismatched backticks while preserving matched inline code", () => {
      // Unpaired single backtick
      expect(
        sanitizeBulletString("`Architected a distributed event broker in Go.")
      ).toBe("Architected a distributed event broker in Go.");

      // Balanced pairs preserved
      expect(
        sanitizeBulletString("Engineered `FastKV` engine with `zero-copy` memory buffers.")
      ).toBe("Engineered `FastKV` engine with `zero-copy` memory buffers.");

      // Three backticks (one matched pair, one orphan)
      expect(
        sanitizeBulletString("Implemented `FastKV` transactional store with `Redis.")
      ).toBe("Implemented `FastKV` transactional store with Redis.");
    });

    it("strips leading/trailing quotes and quotes from code symbols and package names", () => {
      // Outer quotes
      expect(
        sanitizeBulletString('"Architected lock-free queues utilizing mutex-free ring buffers."')
      ).toBe("Architected lock-free queues utilizing mutex-free ring buffers.");

      // Quoted package names and symbols
      expect(
        sanitizeBulletString("Integrated 'express' and 'ws' gateway with 'ioredis' persistence.")
      ).toBe("Integrated express and ws gateway with ioredis persistence.");

      // Quoted file path
      expect(
        sanitizeBulletString("Refactored 'apps/web/package.json' workspace dependencies.")
      ).toBe("Refactored apps/web/package.json workspace dependencies.");

      // Preserves English contractions
      expect(
        sanitizeBulletString("Hardened worker's event loop to prevent unhandled rejections.")
      ).toBe("Hardened worker's event loop to prevent unhandled rejections.");
    });

    it("cleans up orphan punctuation marks and ensures terminal punctuation", () => {
      // Orphan comma/colon before period
      expect(
        sanitizeBulletString("Engineered gateway caching layer , .")
      ).toBe("Engineered gateway caching layer.");

      expect(
        sanitizeBulletString("Instrumented telemetry pipelines : .")
      ).toBe("Instrumented telemetry pipelines.");

      // Duplicate periods
      expect(
        sanitizeBulletString("Dispatched streaming events across worker pool..")
      ).toBe("Dispatched streaming events across worker pool.");

      // Missing terminal punctuation
      expect(
        sanitizeBulletString("Synchronized distributed state across nodes")
      ).toBe("Synchronized distributed state across nodes.");

      // Leading bullet marker
      expect(
        sanitizeBulletString("• Architected event-driven architecture.")
      ).toBe("Architected event-driven architecture.");
    });

    it("strips physical source code filenames and script references while preserving frameworks", () => {
      // Connect 4 game engine example with two filenames
      expect(
        sanitizeBulletString(
          "Designed a concurrent move-execution mechanism using killable threads to enforce per-move time limits in the Connect 4 game engine, implemented in connect4.py using thread_with_trace from thread.py."
        )
      ).toBe(
        "Designed a concurrent move-execution mechanism using killable threads to enforce per-move time limits in the Connect 4 game engine using thread_with_trace."
      );

      // AI agent in montecarlo.py
      expect(
        sanitizeBulletString(
          "Developed a Monte Carlo simulation AI agent in montecarlo.py, utilizing random move generation and score estimation to inform game decisions."
        )
      ).toBe(
        "Developed a Monte Carlo simulation AI agent, utilizing random move generation and score estimation to inform game decisions."
      );

      // Minimax in marqlo_players_final_ver.py
      expect(
        sanitizeBulletString(
          "Implemented a minimax AI agent with alpha-beta pruning in marqlo_players_final_ver.py, leveraging a recursive search strategy to optimize move selection."
        )
      ).toBe(
        "Implemented a minimax AI agent with alpha-beta pruning, leveraging a recursive search strategy to optimize move selection."
      );

      // UI in game_launcher.py and connect4.py
      expect(
        sanitizeBulletString(
          "Engineered a GUI and console human-player interface in game_launcher.py, supporting customizable player options and visualization support in connect4.py."
        )
      ).toBe(
        "Engineered a GUI and console human-player interface, supporting customizable player options and visualization support."
      );

      // Multiple test scripts joined by 'and'
      expect(
        sanitizeBulletString(
          "Profiled and benchmarked agent performance using the included test scripts in matchup_visualizer.py and eval_diagnostics.py, reporting wins, ties, losses, and total points."
        )
      ).toBe(
        "Profiled and benchmarked agent performance using the included test scripts, reporting wins, ties, losses, and total points."
      );

      // Stranded preposition before coordinate conjunction when first file is stripped
      expect(
        sanitizeBulletString(
          "Designed time-limiting mechanism for selected players using thread.py and thread_with_trace, substituting random moves."
        )
      ).toBe(
        "Designed time-limiting mechanism for selected players using thread_with_trace, substituting random moves."
      );

      // Preserves valid runtime/framework names like Next.js and Node.js
      expect(
        sanitizeBulletString(
          "Engineered full-stack telemetry dashboard in Next.js, utilizing server actions."
        )
      ).toBe(
        "Engineered full-stack telemetry dashboard in Next.js, utilizing server actions."
      );

      expect(
        sanitizeBulletString(
          "Built distributed worker microservice in Node.js, managing Redis subscriptions."
        )
      ).toBe(
        "Built distributed worker microservice in Node.js, managing Redis subscriptions."
      );
    });

    it("strips LaTeX math formatting blocks and rogue metric dollar signs cleanly into plain text", () => {
      expect(
        sanitizeBulletString(
          "Batching queries in groups of 3 with a $150\\text{ ms}$ delay to avoid HTTP 429 errors."
        )
      ).toBe(
        "Batching queries in groups of 3 with a 150ms delay to avoid HTTP 429 errors."
      );

      expect(
        sanitizeBulletString(
          "Bounded queue latency to $\\le 25ms$ under high concurrency."
        )
      ).toBe(
        "Bounded queue latency to <= 25ms under high concurrency."
      );

      // Rogue unclosed math dollar sign attached to metric
      expect(
        sanitizeBulletString(
          "Executing category lookups sequentially with a $150ms delay between batches (`MAPBOX_BATCH_DELAY_MS`)."
        )
      ).toBe(
        "Executing category lookups sequentially with a 150ms delay between batches (`MAPBOX_BATCH_DELAY_MS`)."
      );

      // LaTeX approximation symbol
      expect(
        sanitizeBulletString(
          "Maintained throughput at $\\approx 150ms$ latency across requests."
        )
      ).toBe(
        "Maintained throughput at ~150ms latency across requests."
      );

      // Legitimate currency amount is preserved
      expect(
        sanitizeBulletString(
          "Reduced cloud infrastructure expenditures by $50k annually across 12 services."
        )
      ).toBe(
        "Reduced cloud infrastructure expenditures by $50k annually across 12 services."
      );
    });

    it("collapses stranded prepositions left behind by stripped filenames", () => {
      expect(
        sanitizeBulletString(
          "Gating all application subsystems through feature_flags.ts to ensure strict architectural boundaries."
        )
      ).toBe(
        "Gating all application subsystems to ensure strict architectural boundaries."
      );

      expect(
        sanitizeBulletString(
          "Dispatched event updates via socket.ts to validate state consistency."
        )
      ).toBe(
        "Dispatched event updates to validate state consistency."
      );
    });

    it("unrolls formulaic heading-as-object prefixes into direct active verbs", () => {
      expect(
        sanitizeBulletString(
          "Developed a Rate-Throttled Batching system, executing category lookups sequentially and batching queries in groups of 3 with a $150\\text{ ms}$ delay to avoid HTTP 429 errors."
        )
      ).toBe(
        "Executed category lookups sequentially and batched queries in groups of 3 with a 150ms delay to avoid HTTP 429 errors."
      );

      expect(
        sanitizeBulletString(
          "Designed a Spatial Sorting via Haversine Distance system, calculating candidate coordinates using the Haversine formula to ensure accurate proximity-based resource discovery."
        )
      ).toBe(
        "Calculated candidate coordinates using the Haversine formula to ensure accurate proximity-based resource discovery."
      );

      expect(
        sanitizeBulletString(
          "Designed a Zero-Latency Multi-Vector Panic Exit mechanism, triggering three parallel actions to ensure instantaneous emergency SOS dispatch."
        )
      ).toBe(
        "Triggered three parallel actions to ensure instantaneous emergency SOS dispatch."
      );
    });

    it("normalizes phonetic indefinite articles before common acronyms", () => {
      expect(
        sanitizeBulletString(
          "Engineered a HTTP 206 Byte-Range Streaming system for partial content seeking."
        )
      ).toBe(
        "Engineered an HTTP 206 Byte-Range Streaming system for partial content seeking."
      );

      expect(
        sanitizeBulletString(
          "Implemented a SSRF mitigation layer using DNS pre-resolution."
        )
      ).toBe(
        "Implemented an SSRF mitigation layer using DNS pre-resolution."
      );
    });

    it("strips dangling trailing conjunctions and prepositions before terminal punctuation", () => {
      expect(
        sanitizeBulletString(
          "Formulated a time-limiting mechanism utilizing a killable thread utility to terminate move threads and substitute random moves when limits are exceeded and."
        )
      ).toBe(
        "Formulated a time-limiting mechanism utilizing a killable thread utility to terminate move threads and substitute random moves when limits are exceeded."
      );

      expect(
        sanitizeBulletString(
          "Engineered an autonomous routing controller deploying fallback nodes while."
        )
      ).toBe(
        "Engineered an autonomous routing controller deploying fallback nodes."
      );

      expect(
        sanitizeBulletString(
          "Utilized TypeScript and Next.js, to store and retrieve word packs, including custom pack creation and merged."
        )
      ).toBe(
        "Utilized TypeScript and Next.js to store and retrieve word packs, including custom pack creation."
      );
    });

    it("harmonizes compound predicate coordination across coordinating conjunctions", () => {
      expect(
        sanitizeBulletString(
          "Selected relevant evidence from candidate profiles and generating tailored bullet points."
        )
      ).toBe(
        "Selected relevant evidence from candidate profiles and generated tailored bullet points."
      );

      expect(
        sanitizeBulletString(
          "Built a real-time geocoding system and deploying to production."
        )
      ).toBe(
        "Built a real-time geocoding system and deployed to production."
      );

      // Gerund lead clause conjoined with mismatched past verb (e.g. optimizing ... and improved)
      expect(
        sanitizeBulletString(
          "Integrated minimax algorithm utilizing iterative deepening to evaluate board states, optimizing search efficiency and improved AI decision-making."
        )
      ).toBe(
        "Integrated minimax algorithm utilizing iterative deepening to evaluate board states, optimizing search efficiency and improving AI decision-making."
      );

      expect(
        sanitizeBulletString(
          "Designed time limiting mechanism allowing for flexible per-player time limits, ensuring fairness and prevented infinite loops."
        )
      ).toBe(
        "Designed time limiting mechanism allowing for flexible per-player time limits, ensuring fairness and preventing infinite loops."
      );

      expect(
        sanitizeBulletString(
          "Designed a system to register and load new player agents by inheriting from connect4Player and implemented the play method."
        )
      ).toBe(
        "Designed a system to register and load new player agents by inheriting from connect4Player and implementing the play method."
      );

      expect(
        sanitizeBulletString(
          "Utilizing React to provide a responsive interface for locating nearby fires and identifyed communications towers at risk."
        )
      ).toBe(
        "Utilizing React to provide a responsive interface for locating nearby fires and identifying communications towers at risk."
      );

      // Preserves valid adjective past participles modifying nouns
      expect(
        sanitizeBulletString(
          "Engineered scalable data streaming pipelines and distributed systems."
        )
      ).toBe(
        "Engineered scalable data streaming pipelines and distributed systems."
      );
    });

    it("preserves filename noun before architectural descriptors during file scrubbing", () => {
      expect(
        sanitizeBulletString(
          "Integrated a matchup benchmarking script utilizing the thread.py utility to evaluate agent performance."
        )
      ).toBe(
        "Integrated a matchup benchmarking script utilizing the thread utility to evaluate agent performance."
      );
    });

    it("preserves named datasets and reference benchmarks during sanitization", () => {
      expect(
        sanitizeBulletString(
          "Integrated the Old Faithful.txt dataset to analyze and compare delay distributions."
        )
      ).toBe(
        "Integrated the Old Faithful dataset to analyze and compare delay distributions."
      );
    });

    it("detects impact metrics on GitHub and project lines to enable metric badge rendering", () => {
      expect(detectMetric("Batching queries in groups of 3 with a 150ms delay to avoid HTTP 429 errors.")).toBe(true);
      expect(detectMetric("Triggered three parallel actions across 8 nodes bounding query latency to sub-25ms.")).toBe(true);
      expect(detectMetric("Sustained 99.99% system availability under peak loads.")).toBe(true);
      expect(detectMetric("Organized code into clean directory modules.")).toBe(false);
    });
  });

  describe("Clean Isolation of Repository Description from Bullets", () => {
    it("ensures adaptRepoToProjectItem populates description exclusively and omits it from bullets", () => {
      const repo = {
        name: "turbocache",
        description: "A lightning-fast distributed cache with LRU eviction",
        html_url: "https://github.com/dev/turbocache",
        fork: false,
        archived: false,
        language: "Rust",
        topics: ["cache", "rust"],
        stargazers_count: 100,
        forks_count: 10,
      };

      const rawBullets = [
        "A lightning-fast distributed cache with LRU eviction.", // Echo of repo description
        "Engineered zero-copy memory maps for high-throughput LRU eviction.",
        "Implemented deterministic hash ring partitioning across 8 cluster nodes.",
      ];

      const item = adaptRepoToProjectItem({
        repo,
        bullets: rawBullets,
        manifestTechnologies: ["tokio", "serde"],
      });

      // Description is strictly preserved in metadata field
      expect(item.description).toBe("A lightning-fast distributed cache with LRU eviction");

      // Bullets contain ONLY the technical engineering bullets (echo is filtered out)
      expect(item.bullets).toHaveLength(2);
      expect(item.bullets[0]).toBe(
        "Engineered zero-copy memory maps for high-throughput LRU eviction."
      );
      expect(item.bullets[1]).toBe(
        "Implemented deterministic hash ring partitioning across 8 cluster nodes."
      );
      expect(item.bullets[0]).not.toContain("A lightning-fast distributed cache");
    });

    it("filters out bullets that wrap repo name with description", () => {
      const repo = {
        name: "mesh-router",
        description: "Real-time edge packet router",
        html_url: "https://github.com/dev/mesh-router",
        fork: false,
        archived: false,
        language: "Go",
        topics: [],
        stargazers_count: 10,
        forks_count: 2,
      };

      const item = adaptRepoToProjectItem({
        repo,
        bullets: [
          "Engineered and maintained mesh-router: Real-time edge packet router.",
          "Multiplexed ingress UDP packets with zero-allocation ring buffers.",
        ],
      });

      expect(item.bullets).toHaveLength(1);
      expect(item.bullets[0]).toBe(
        "Multiplexed ingress UDP packets with zero-allocation ring buffers."
      );
    });

    it("returns empty bullets when repository has zero README and zero manifests", async () => {
      const result = await analyzeRepoArtifacts({
        repoName: "empty-skeleton",
        description: "Placeholder repository without documentation",
        readme: null,
        manifestTechnologies: [],
        repoSize: 10,
      });

      expect(result.bullets).toEqual([]);
      expect(result.technologies).toEqual([]);
    });

    it("does not interpolate description into heuristic fallback bullets", async () => {
      const mockLLM = vi.mocked(callLLMWithFallback);
      mockLLM.mockRejectedValueOnce(new Error("LLM failure"));

      const result = await analyzeRepoArtifacts({
        repoName: "sensor-pipeline",
        description: "High-throughput sensor ingestion system",
        readme: "# sensor-pipeline\n## Architecture\nIngests telemetry.",
        manifestTechnologies: ["express", "ioredis"],
        repoSize: 4500,
      });

      for (const bullet of result.bullets) {
        // Must NOT contain the description phrase or "addressing <description>"
        expect(bullet).not.toContain("addressing High-throughput sensor ingestion system");
        expect(bullet).not.toBe("High-throughput sensor ingestion system");
      }
    });
  });

  describe("Ban on Low-Signal Developer Setup and Hygiene Chores", () => {
    it("specifies explicit negative constraints in DEEP_ANALYSIS_SYSTEM_PROMPT", () => {
      expect(DEEP_ANALYSIS_SYSTEM_PROMPT).toContain("BANNED TRIVIAL TASKS");
      expect(DEEP_ANALYSIS_SYSTEM_PROMPT).toContain("Configuration bootstrap chores");
      expect(DEEP_ANALYSIS_SYSTEM_PROMPT).toContain("Basic filesystem hygiene");
      expect(DEEP_ANALYSIS_SYSTEM_PROMPT).toContain("superficial demonstration artifacts");
      expect(DEEP_ANALYSIS_SYSTEM_PROMPT).toContain("Generic development tooling");
      expect(DEEP_ANALYSIS_SYSTEM_PROMPT).toContain("NO INTRODUCTORY OR DESCRIPTION BULLETS");
    });

    it("filters out low-signal chore bullets during adaptRepoToProjectItem", () => {
      const repo = {
        name: "data-service",
        description: "Data transformation microservice with Kafka streaming",
        html_url: "https://github.com/dev/data-service",
        fork: false,
        archived: false,
        language: "TypeScript",
        topics: ["kafka"],
        stargazers_count: 5,
        forks_count: 0,
      };

      const mixedBullets = [
        "Configured environment variables and .env files for local dev.",
        "Created folders and organized assets into clean directories.",
        "Recorded screen recordings and demo scripts demonstrating features.",
        "Configured code linters and eslint rules for repository code formatting.",
        "Architected stream transform pipelines processing 50MB/s with bounded memory.",
        "Benchmarked throughput across partitioned Kafka topics achieving sub-10ms p99.",
      ];

      const item = adaptRepoToProjectItem({
        repo,
        bullets: mixedBullets,
      });

      expect(item.bullets).toHaveLength(2);
      expect(item.bullets[0]).toBe(
        "Architected stream transform pipelines processing 50MB/s with bounded memory."
      );
      expect(item.bullets[1]).toBe(
        "Benchmarked throughput across partitioned Kafka topics achieving sub-10ms p99."
      );
    });

    it("detects chore patterns with LOW_SIGNAL_CHORE_REGEX", () => {
      expect(LOW_SIGNAL_CHORE_REGEX.test("Setting up environment variables for development")).toBe(true);
      expect(LOW_SIGNAL_CHORE_REGEX.test("Configured .env files and port bindings")).toBe(true);
      expect(LOW_SIGNAL_CHORE_REGEX.test("Creating folders for project structure")).toBe(true);
      expect(LOW_SIGNAL_CHORE_REGEX.test("Filesystem hygiene and cleaning up repositories")).toBe(true);
      expect(LOW_SIGNAL_CHORE_REGEX.test("Generated screen recordings and screenshots")).toBe(true);
      expect(LOW_SIGNAL_CHORE_REGEX.test("Configuring code linters and prettier")).toBe(true);
      expect(LOW_SIGNAL_CHORE_REGEX.test("Installing dependencies and packages")).toBe(true);
      expect(
        LOW_SIGNAL_CHORE_REGEX.test(
          "Deployed the application to local development environment via npm run dev, serving at http://localhost:5173."
        )
      ).toBe(true);
      expect(
        LOW_SIGNAL_CHORE_REGEX.test(
          "Instrumented environmental variables, utilizing ENV files to securely store API keys and other sensitive information."
        )
      ).toBe(true);

      // Does NOT match genuine engineering bullets
      expect(LOW_SIGNAL_CHORE_REGEX.test("Architected distributed storage ring")).toBe(false);
      expect(LOW_SIGNAL_CHORE_REGEX.test("Benchmarked latency under heavy concurrent load")).toBe(false);
    });
  });

  describe("Profile Consolidation Separation of Description and Bullets", () => {
    it("ensures mergeProjects strips description matches from bullets", () => {
      const existing = getEmptyMasterProfileData();
      existing.fullName = "Systems Engineer";
      existing.projects = [
        {
          name: "KV Cache",
          description: "High-performance key-value cache",
          technologies: ["TypeScript"],
          link: "https://github.com/dev/kv-cache",
          bullets: ["High-performance key-value cache", "Implemented LRU eviction."],
        },
      ];

      const incoming = getEmptyMasterProfileData();
      incoming.projects = [
        {
          name: "KV Cache",
          description: "High-performance key-value cache",
          technologies: ["Go"],
          link: "https://github.com/dev/kv-cache",
          bullets: [
            "High-performance key-value cache.",
            "Engineered concurrent shard locking with sync.RWMutex.",
          ],
        },
      ];

      const consolidated = consolidateProfiles(existing, incoming);
      const proj = consolidated.projects.find((p) => p.name === "KV Cache");
      expect(proj).toBeDefined();
      expect(proj!.description).toBe("High-performance key-value cache");

      // The description bullet must NOT be present in bullets
      expect(proj!.bullets).not.toContain("High-performance key-value cache");
      expect(proj!.bullets).not.toContain("High-performance key-value cache.");
      expect(proj!.bullets).toContain("Implemented LRU eviction.");
      expect(proj!.bullets).toContain(
        "Engineered concurrent shard locking with sync.RWMutex."
      );
    });
  });

  describe("Dev Model Override & Sampling Options", () => {
    it("forwards devModelOverride and sets temperature to 0.5 in analyzeRepoArtifacts", async () => {
      const mockLLM = vi.mocked(callLLMWithFallback);
      mockLLM.mockResolvedValueOnce({
        bullets: ["Engineered low-latency IPC pipeline."],
        extractedTechnologies: ["Rust"],
      });

      await analyzeRepoArtifacts({
        repoName: "custom-kernel",
        description: "Custom microkernel",
        readme: "# Kernel\nDetailed architecture docs.",
        manifestTechnologies: ["Rust"],
        llmOptions: {
          devModelOverride: "gemma2:27b",
        },
      });

      expect(mockLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          devModelOverride: "gemma2:27b",
          ollamaOptions: { temperature: 0.5 },
        })
      );
    });

    it("forwards devModelOverride from syncGitHubProjects options to inference", async () => {
      const mockLLM = vi.mocked(callLLMWithFallback);
      mockLLM.mockResolvedValueOnce({
        bullets: ["Architected consensus protocol engine."],
        extractedTechnologies: ["Go"],
      });

      vi.spyOn(globalThis, "fetch").mockImplementationOnce(async () => ({
        ok: true,
        status: 200,
        json: async () => [
          {
            name: "raft-node",
            description: "Distributed raft node",
            html_url: "https://github.com/developer/raft-node",
            fork: false,
            archived: false,
            language: "Go",
            topics: [],
            stargazers_count: 10,
            forks_count: 1,
            default_branch: "main",
            size: 2000,
          },
        ],
      } as unknown as Response));

      await syncGitHubProjects("developer", {
        devModelOverride: "mistral:latest",
        rawFetcher: vi.fn().mockResolvedValue(null),
      });

      expect(mockLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          devModelOverride: "mistral:latest",
          ollamaOptions: { temperature: 0.5 },
        })
      );
    });
  });

  describe("Canonical Tool Normalization & Case-Folding Deduplication", () => {
    it("collapses React and react to canonical React", () => {
      const result = dedupeTools(["react", "React", "REACT"]);
      expect(result).toEqual(["React"]);
    });

    it("normalizes popular tool variations to standard display names", () => {
      const tools = [
        "nextjs",
        "next.js",
        "postgresql",
        "postgres",
        "fastapi",
        "docker",
        "tailwind",
        "tailwindcss",
        "prisma",
        "graphql",
      ];
      const normalized = dedupeTools(tools);
      expect(normalized).toContain("Next.js");
      expect(normalized).toContain("PostgreSQL");
      expect(normalized).toContain("FastAPI");
      expect(normalized).toContain("Docker");
      expect(normalized).toContain("TailwindCSS");
      expect(normalized).toContain("Prisma");
      expect(normalized).toContain("GraphQL");
      // Verify deduplication
      expect(normalized.filter((t) => t.toLowerCase() === "next.js")).toHaveLength(1);
      expect(normalized.filter((t) => t.toLowerCase() === "postgresql")).toHaveLength(1);
      expect(normalized.filter((t) => t.toLowerCase() === "tailwindcss")).toHaveLength(1);
    });

    it("preserves unrecognized tools in their original casing without duplicates", () => {
      const tools = ["my-custom-engine", "My-Custom-Engine", "actix-web", "ACTIX-WEB", "tokio"];
      const result = dedupeTools(tools);
      expect(result).toEqual(["my-custom-engine", "actix-web", "tokio"]);
    });
  });

  describe("Micro-Exclusion Noise Denylist ('Keep Signal, Drop Noise')", () => {
    it("excludes zero-signal scaffolding while keeping critical QA and bundler frameworks", () => {
      const noisyList = [
        "@types/react",
        "@types/node",
        "eslint",
        "eslint-plugin-react",
        "prettier",
        "prettier-plugin-tailwindcss",
        "@typescript-eslint/parser",
        "husky",
        "lint-staged",
        "cross-env",
        "rimraf",
        "concurrently",
        "nodemon",
        "ts-node",
        // Signal tools that MUST be kept:
        "jest",
        "playwright",
        "vitest",
        "cypress",
        "pytest",
        "vite",
        "webpack",
        "turborepo",
        "prisma",
      ];

      const filtered = dedupeTools(noisyList);

      // Verify zero noise
      expect(filtered).not.toContain("@types/react");
      expect(filtered).not.toContain("eslint");
      expect(filtered).not.toContain("prettier");
      expect(filtered).not.toContain("husky");
      expect(filtered).not.toContain("lint-staged");
      expect(filtered).not.toContain("cross-env");
      expect(filtered).not.toContain("rimraf");
      expect(filtered).not.toContain("concurrently");

      // Verify signal preserved
      expect(filtered).toContain("Jest");
      expect(filtered).toContain("Playwright");
      expect(filtered).toContain("Vitest");
      expect(filtered).toContain("Cypress");
      expect(filtered).toContain("Pytest");
      expect(filtered).toContain("Vite");
      expect(filtered).toContain("Webpack");
      expect(filtered).toContain("Turborepo");
      expect(filtered).toContain("Prisma");
    });
  });

  describe("HTTP ETag Caching Ledger & 304 Bypass", () => {
    it("bypasses LLM inference on 304 Not Modified and reuses cached project item", async () => {
      clearGlobalRepoCache();
      const mockLLM = vi.mocked(callLLMWithFallback);

      const mockRepo = {
        name: "cached-engine",
        description: "Cached systems engine",
        html_url: "https://github.com/developer/cached-engine",
        fork: false,
        archived: false,
        language: "Rust",
        topics: ["cache"],
        stargazers_count: 88,
        forks_count: 12,
        default_branch: "main",
        size: 5000,
        pushed_at: "2026-10-01T12:00:00Z",
      };

      const cacheLedger = new Map();
      const existingProject = {
        name: "Cached Engine",
        description: "Cached systems engine",
        technologies: ["Rust"],
        link: "https://github.com/developer/cached-engine",
        bullets: ["Engineered zero-copy memory ring buffer."],
        origin: "GITHUB_INFERRED" as const,
      };

      // Populate ledger with matching pushed_at and current parser version
      cacheLedger.set("developer/cached-engine", {
        etag: '"etag-12345"',
        pushedAt: "2026-10-01T12:00:00Z",
        parserVersion: GITHUB_PARSER_VERSION,
        project: existingProject,
      });

      // Mock GitHub API repos endpoint
      vi.spyOn(globalThis, "fetch").mockImplementationOnce(async () => ({
        ok: true,
        status: 200,
        json: async () => [mockRepo],
      } as unknown as Response));

      const projects = await syncGitHubProjects("developer", {
        cacheLedger,
        rawFetcher: vi.fn(),
      });

      expect(projects).toHaveLength(1);
      expect(projects[0]).toEqual(existingProject);
      // Verify LLM was bypassed (0 calls)
      expect(mockLLM).not.toHaveBeenCalled();
    });

    it("forces fresh LLM inference when bypassCache is true even if pushed_at and version match exactly", async () => {
      clearGlobalRepoCache();
      const mockLLM = vi.mocked(callLLMWithFallback);
      mockLLM.mockResolvedValueOnce({
        bullets: ["Freshly evaluated distributed lock implementation without cache."],
        extractedTechnologies: ["Rust"],
      });

      const mockRepo = {
        name: "cached-engine",
        description: "Cached systems engine",
        html_url: "https://github.com/developer/cached-engine",
        fork: false,
        archived: false,
        language: "Rust",
        topics: ["cache"],
        stargazers_count: 88,
        forks_count: 12,
        default_branch: "main",
        size: 5000,
        pushed_at: "2026-10-01T12:00:00Z",
      };

      const cacheLedger = new Map();
      const existingProject = {
        name: "Cached Engine",
        description: "Cached systems engine",
        technologies: ["Rust"],
        link: "https://github.com/developer/cached-engine",
        bullets: ["Old cached bullet from previous run."],
        origin: "GITHUB_INFERRED" as const,
      };

      cacheLedger.set("developer/cached-engine", {
        etag: '"etag-12345"',
        pushedAt: "2026-10-01T12:00:00Z",
        parserVersion: GITHUB_PARSER_VERSION,
        project: existingProject,
      });

      vi.spyOn(globalThis, "fetch").mockImplementationOnce(async () => ({
        ok: true,
        status: 200,
        json: async () => [mockRepo],
      } as unknown as Response));

      const projects = await syncGitHubProjects("developer", {
        cacheLedger,
        rawFetcher: vi.fn().mockResolvedValue("# Cached Engine\nImplementation details"),
        bypassCache: true,
      });

      expect(projects).toHaveLength(1);
      expect(mockLLM).toHaveBeenCalled();
      expect(projects[0].bullets[0]).toContain("Freshly evaluated distributed lock");
    });
  });

  describe("Human-Verified Protection in Profile Consolidation", () => {
    it("never overwrites or dilutes bullets on projects with origin HUMAN_VERIFIED", () => {
      const existing = {
        ...getEmptyMasterProfileData(),
        projects: [
          {
            name: "Enterprise Grid",
            description: "High-scale power grid optimizer",
            technologies: ["Rust", "Python"],
            link: "https://github.com/dev/grid",
            bullets: [
              "Architected custom solver attaining 99.999% grid stability under N-1 contingency conditions.",
              "Personally audited and verified power flow algorithms against IEEE standards.",
            ],
            origin: "HUMAN_VERIFIED" as const,
          },
        ],
      };

      const incomingFromGitHub = {
        ...getEmptyMasterProfileData(),
        projects: [
          {
            name: "Enterprise Grid",
            description: "Open-source power grid optimizer",
            technologies: ["Rust", "Python", "Docker"],
            link: "https://github.com/dev/grid",
            bullets: [
              "Engineered generic Docker deployment workflow.",
              "Implemented basic telemetry endpoints.",
            ],
            origin: "GITHUB_INFERRED" as const,
          },
        ],
      };

      const consolidated = consolidateProfiles(existing, incomingFromGitHub);
      const project = consolidated.projects.find((p) => p.name === "Enterprise Grid");

      expect(project).toBeDefined();
      expect(project!.origin).toBe("HUMAN_VERIFIED");
      // Human-verified bullets are preserved as primary User-Verified bullets
      expect(project!.bullets[0]).toBe(
        "Architected custom solver attaining 99.999% grid stability under N-1 contingency conditions."
      );
      expect(project!.bullets[1]).toBe(
        "Personally audited and verified power flow algorithms against IEEE standards."
      );
      expect(project!.bulletOrigins?.[project!.bullets[0]!]).toBe("HUMAN_VERIFIED");
      expect(project!.bulletOrigins?.[project!.bullets[1]!]).toBe("HUMAN_VERIFIED");
      // Non-overlapping GitHub bullets enter as additive Externally-Sourced bullets
      expect(project!.bullets).toContain("Engineered generic Docker deployment workflow.");
      expect(
        project!.bulletOrigins?.["Engineered generic Docker deployment workflow."]
      ).toBe("GITHUB_INFERRED");
      // But technologies may be enriched
      expect(project!.technologies).toContain("Docker");
    });

    it("strictly orders projects alphabetically (A-Z, case-insensitive) during consolidation", () => {
      const existing = {
        ...getEmptyMasterProfileData(),
        projects: [
          {
            name: "Zeta Parser",
            description: "Zeta data parsing tool",
            technologies: ["Rust"],
            link: "https://github.com/dev/zeta",
            bullets: ["Engineered streaming parser."],
          },
          {
            name: "alpha db",
            description: "Alpha database engine",
            technologies: ["Go"],
            link: "https://github.com/dev/alpha",
            bullets: ["Architected storage engine."],
          },
        ],
      };

      const incoming = {
        ...getEmptyMasterProfileData(),
        projects: [
          {
            name: "Beta Cache",
            description: "Beta caching layer",
            technologies: ["Redis"],
            link: "https://github.com/dev/beta",
            bullets: ["Implemented LRU cache."],
          },
          {
            name: "archive-worker",
            description: "Background archiving worker",
            technologies: ["Node.js"],
            link: "https://github.com/dev/archive",
            bullets: ["Engineered batch archiver."],
          },
        ],
      };

      const consolidated = consolidateProfiles(existing, incoming);
      const names = consolidated.projects.map((p) => p.name);

      expect(names).toEqual([
        "Alpha DB",
        "Archive Worker",
        "Beta Cache",
        "Zeta Parser",
      ]);

      // Also verify overwriteAll sorts A-Z
      const overwritten = consolidateProfiles(existing, incoming, {
        overwriteAll: true,
      });
      const overwrittenNames = overwritten.projects.map((p) => p.name);
      expect(overwrittenNames).toEqual(["archive-worker", "Beta Cache"]);
    });
  });

  describe("Parser Version Cache Invalidation", () => {
    it("invalidates cache and forces fresh re-ingestion when cachedEntry.parserVersion does not match GITHUB_PARSER_VERSION", async () => {
      clearGlobalRepoCache();
      const mockLLM = vi.mocked(callLLMWithFallback);
      mockLLM.mockResolvedValueOnce({
        bullets: [
          "Architected high-throughput actor engine using asynchronous message-passing loops.",
          "Engineered zero-copy memory ring buffer bounding garbage collection overhead.",
          "Benchmarked latency distribution attaining sub-millisecond p99 guarantees.",
        ],
        extractedTechnologies: ["Rust", "Tokio"],
      });

      const mockRepo = {
        name: "stale-version-repo",
        description: "Stale parser version repo",
        html_url: "https://github.com/developer/stale-version-repo",
        fork: false,
        archived: false,
        language: "Rust",
        topics: [],
        stargazers_count: 50,
        forks_count: 5,
        default_branch: "main",
        size: 5000,
        pushed_at: "2026-10-01T12:00:00Z",
      };

      const cacheLedger = new Map();
      const staleProject = {
        name: "Stale Version Repo",
        description: "Old cached bullets",
        technologies: ["Rust"],
        link: "https://github.com/developer/stale-version-repo",
        bullets: ["Old bullet generated by parser version 1."],
        origin: "GITHUB_INFERRED" as const,
      };

      // Populate ledger with an OLD parser version (e.g. 1)
      cacheLedger.set("developer/stale-version-repo", {
        etag: '"etag-old-v1"',
        pushedAt: "2026-10-01T12:00:00Z",
        parserVersion: GITHUB_PARSER_VERSION - 1, // Stale!
        project: staleProject,
      });

      // Mock GitHub API repos endpoint
      vi.spyOn(globalThis, "fetch").mockImplementationOnce(async () => ({
        ok: true,
        status: 200,
        json: async () => [mockRepo],
      } as unknown as Response));

      const projects = await syncGitHubProjects("developer", {
        cacheLedger,
        rawFetcher: async (_u, _r, _b, path) => {
          if (path === "README.md") return "# Stale Version Repo\n## Core Architecture\nHigh-throughput actor engine.";
          return null;
        },
      });

      expect(projects).toHaveLength(1);
      // Verify LLM was invoked because old parser version was invalidated
      expect(mockLLM).toHaveBeenCalled();
      // Cache entry is now updated to the current parser version
      const updatedCache = cacheLedger.get("developer/stale-version-repo");
      expect(updatedCache?.parserVersion).toBe(GITHUB_PARSER_VERSION);
      expect(projects[0].bullets[0]).toContain("Architected high-throughput actor engine");
    });
  });

  describe("Architectural Density Model (Source Code Bytes & Verified Subsystems)", () => {
    it("excludes non-signal markup and calculates pure source code bytes cleanly", () => {
      const languages = {
        Rust: 80000,
        TypeScript: 40000,
        HTML: 50000,
        CSS: 25000,
        SCSS: 15000,
        SVG: 10000,
        Markdown: 12000,
      };

      const pureBytes = calculatePureCodeBytes(languages);
      // Pure bytes = Rust (80,000) + TypeScript (40,000) = 120,000 bytes
      expect(pureBytes).toBe(120000);
    });

    it("counts verified engineering subsystems discovered across tree and manifests", () => {
      expect(countVerifiedSubsystems()).toBe(0);

      const subsystems = {
        hasDatabase: true,
        hasTests: true,
        hasContainerization: true,
        hasCiCd: true,
        hasMonorepo: false,
        hasMultiDomainTopology: true,
      };

      expect(countVerifiedSubsystems(subsystems)).toBe(5);
    });

    it("classifies pure code volume into accurate architectural tiers", () => {
      // < 25 KB pure code -> Tier 1 (3-4 bullets)
      const smallScale = determineRepoScale({
        codeBytes: 15000,
        hasReadme: true,
      });
      expect(smallScale.tier).toBe(1);
      expect(smallScale.minBullets).toBe(3);
      expect(smallScale.maxBullets).toBe(4);

      // 25 KB - 120 KB pure code -> Tier 2 (4-8 bullets)
      const midScale = determineRepoScale({
        codeBytes: 65000,
        hasReadme: true,
      });
      expect(midScale.tier).toBe(2);
      expect(midScale.minBullets).toBe(4);
      expect(midScale.maxBullets).toBe(8);

      // > 120 KB pure code -> Tier 3 (6-10 bullets)
      const largeScale = determineRepoScale({
        codeBytes: 180000,
        hasReadme: true,
      });
      expect(largeScale.tier).toBe(3);
      expect(largeScale.minBullets).toBe(6);
      expect(largeScale.maxBullets).toBe(10);
    });

    it("elevates tier based on verified subsystem count regardless of raw byte volume", () => {
      // Small script (10 KB code) that implements 4 verified capabilities (DB, tests, Docker, CI)
      const elevatedScale = determineRepoScale({
        codeBytes: 10000,
        subsystems: {
          hasDatabase: true,
          hasTests: true,
          hasContainerization: true,
          hasCiCd: true,
        },
        hasReadme: true,
      });

      // 4 subsystems elevates it to Tier 3!
      expect(elevatedScale.tier).toBe(3);
      expect(elevatedScale.minBullets).toBe(6);
      expect(elevatedScale.maxBullets).toBe(10);
    });

    it("applies the 3-4 bullet safeguard when repository has no README even for Tier 3 codebases", () => {
      const largeNoReadme = determineRepoScale({
        codeBytes: 250000,
        subsystems: {
          hasDatabase: true,
          hasTests: true,
          hasContainerization: true,
          hasCiCd: true,
        },
        hasReadme: false,
      });

      expect(largeNoReadme.tier).toBe(3);
      expect(largeNoReadme.minBullets).toBe(3);
      expect(largeNoReadme.maxBullets).toBe(4);
    });

    it("clamps returned bullets to scaleBudget.maxBullets even if LLM returns 27 bullets", async () => {
      const mockLLM = vi.mocked(callLLMWithFallback);
      // Generate 27 distinct bullets
      const twentySevenBullets = Array.from(
        { length: 27 },
        (_, i) => `Engineered autonomous subsystem capability #${i + 1} with verifiable performance bounds.`
      );

      mockLLM.mockResolvedValueOnce({
        bullets: twentySevenBullets,
        extractedTechnologies: ["TypeScript", "Next.js"],
      });

      const analysis = await analyzeRepoArtifacts({
        repoName: "mailpilot-engine",
        description: "Autonomous job search platform",
        readme: "# MailPilot\n## Architecture\nDistributed system.",
        manifestTechnologies: ["next", "react", "prisma"],
        pureCodeBytes: 250000, // Tier 3 (max 10 bullets)
      });

      // Must be strictly clamped to Tier 3 max (10)
      expect(analysis.bullets).toHaveLength(10);
      expect(analysis.bullets[0]).toContain("capability #1");
      expect(analysis.bullets[9]).toContain("capability #10");
    });

    it("refreshes GITHUB_INFERRED project bullets on re-sync and prevents infinite bullet accumulation", () => {
      const existing = {
        ...getEmptyMasterProfileData(),
        projects: [
          {
            name: "MailPilot",
            description: "Autonomous copilot",
            technologies: ["Next.js", "TypeScript"],
            link: "https://github.com/developer/mailpilot",
            bullets: [
              "Engineered bot-evading job scraping via delta sync with Google Cloud Pub/Sub.",
              "Developed headless PDF/DOCX tailoring using Next.js 15 and Prisma.",
              "Implemented RFC 8058 one-click unsubscribe engine for inspecting headers.",
            ],
            origin: "GITHUB_INFERRED" as const,
          },
        ],
      };

      const incomingResync = {
        ...getEmptyMasterProfileData(),
        projects: [
          {
            name: "MailPilot",
            description: "Autonomous copilot",
            technologies: ["Next.js", "TypeScript", "PostgreSQL"],
            link: "https://github.com/developer/mailpilot",
            bullets: [
              "Engineered multi-stage scraping pipeline with Google Cloud Pub/Sub webhooks.",
              "Designed line-addressable resume tailoring engine with strict 1-page geometry.",
              "Hardened server-side request forgery (SSRF) protection using DNS pre-resolution.",
              "Implemented RFC 8058 one-click unsubscribe engine for inspecting headers.",
            ],
            origin: "GITHUB_INFERRED" as const,
          },
        ],
      };

      const consolidated = consolidateProfiles(existing, incomingResync);
      const proj = consolidated.projects.find((p) => p.name === "MailPilot");

      expect(proj).toBeDefined();
      // Must have refreshed to the new 4 incoming bullets, NOT accumulated to 3 + 3 = 6 or 7
      expect(proj!.bullets).toHaveLength(4);
      expect(proj!.bullets).toContain(
        "Engineered multi-stage scraping pipeline with Google Cloud Pub/Sub webhooks."
      );
      // Technologies are unioned
      expect(proj!.technologies).toContain("PostgreSQL");
    });
  });

  describe("Universal File System Scrubber, Permissive Unrolling, and Substantiveness Auditing", () => {
    it("scrubs universal directory paths and normalizes raw file extension references", () => {
      const input =
        "Allowed users to create custom packs by adding `.txt` files to `src/data/` with one word or phrase per line, and automatically rendering them as selectable packs.";
      const scrubbed = sanitizeBulletString(input);

      expect(scrubbed).not.toContain("src/data");
      expect(scrubbed).not.toContain(".txt");
      expect(scrubbed).toContain("text files");
      expect(scrubbed).toContain("with one word or phrase per line");
    });

    it("unrolls permissive user-story phrasing into authoritative systems-engine actions", () => {
      const input =
        "Allowed users to create custom packs by adding text files with one word or phrase per line, and automatically rendering them as selectable packs.";
      const unrolled = unrollPermissivePhrasing(input);

      expect(unrolled).toMatch(/^Engineered custom pack creation/);
      expect(unrolled).toContain("automatically rendering them as selectable packs");
    });

    it("cleans tutorial-level standard library built-ins from engineering bullets", () => {
      const input =
        "Implemented a 60-second timer using JavaScript's `setInterval` function, triggering end-game confirmation and score calculation upon expiration.";
      const cleaned = cleanTrivialPrimitives(input);

      expect(cleaned).not.toContain("setInterval");
      expect(cleaned).toBe(
        "Implemented a 60-second timer, triggering end-game confirmation and score calculation upon expiration."
      );
    });

    it("audits substantiveness, rejects PaaS/percentage chores, and backfills cleaned timer bullets", () => {
      const incomingBullets = [
        "Allowed users to create custom packs by adding `.txt` files to `src/data/` with one word or phrase per line, and automatically rendering them as selectable packs.",
        "Integrated full-screen swipe controls using Next.js 15's App Router and React 19, enabling mobile-first gameplay with landscape orientation and customizable swipe gestures.",
        "Implemented a 60-second timer using JavaScript's `setInterval` function, triggering end-game confirmation and score calculation upon expiration.",
        "Utilized Tailwind CSS 4 for mobile-optimized layouts across selection, countdown, gameplay, and results screens, ensuring seamless user experience across various devices.",
        "Employed TypeScript to manage type safety and code maintainability, with 71% of the codebase written in TypeScript.",
        "Designed a custom pack creator, allowing users to name and add one prompt per line, which is then merged with built-in packs for each game.",
        "Utilized Vercel for deployment, leveraging automatic redeployment on `main` branch pushes and easy integration with Next.js.",
      ];

      const mockRepo = {
        name: "swipe-game",
        description: "Mobile swipe trivia game",
        html_url: "https://github.com/developer/swipe-game",
        fork: false,
        archived: false,
        language: "TypeScript",
        topics: ["mobile", "game"],
        stargazers_count: 10,
        forks_count: 2,
        default_branch: "main",
        size: 3500,
      };

      const project = adaptRepoToProjectItem({
        repo: mockRepo,
        bullets: incomingBullets,
        inferredTechnologies: ["Next.js", "React", "TypeScript", "Tailwind CSS"],
        scaleBudget: { minBullets: 3, maxBullets: 5 },
      });

      // 1. Chores (Vercel automatic redeploy & 71% TypeScript recitation) MUST be rejected
      const bulletText = project.bullets.join("\n");
      expect(bulletText).not.toContain("Vercel");
      expect(bulletText).not.toContain("71%");
      expect(bulletText).not.toContain("automatic redeployment");

      // 2. Filenames & raw directories must NOT appear
      expect(bulletText).not.toContain("src/data");
      expect(bulletText).not.toContain(".txt");

      // 3. setInterval syntax must be cleaned
      expect(bulletText).not.toContain("setInterval");

      // 4. Bullets must be bounded to scaleBudget (at most 5 bullets)
      expect(project.bullets.length).toBeLessThanOrEqual(5);
      expect(project.bullets.length).toBeGreaterThanOrEqual(3);

      // 5. High-substance gesture control bullet is preserved
      expect(bulletText).toContain("Integrated full-screen swipe controls");

      // 6. Cleaned timer bullet is backfilled into available budget slots
      expect(bulletText).toContain("Implemented a 60-second timer, triggering end-game confirmation");
    });

    it("ensures DEEP_ANALYSIS_SYSTEM_PROMPT contains zero concrete domain examples", () => {
      expect(DEEP_ANALYSIS_SYSTEM_PROMPT).not.toContain("Haversine");
      expect(DEEP_ANALYSIS_SYSTEM_PROMPT).not.toContain("emergency SOS");
      expect(DEEP_ANALYSIS_SYSTEM_PROMPT).not.toContain("HTTP 206");
      expect(DEEP_ANALYSIS_SYSTEM_PROMPT).not.toContain("candidate proximity");
      expect(DEEP_ANALYSIS_SYSTEM_PROMPT).not.toContain("within the game engine");
      expect(DEEP_ANALYSIS_SYSTEM_PROMPT).not.toContain("connect4.py");
      expect(DEEP_ANALYSIS_SYSTEM_PROMPT).not.toContain("main.py");
      expect(DEEP_ANALYSIS_SYSTEM_PROMPT).not.toContain("RabbitMQ");
      expect(DEEP_ANALYSIS_SYSTEM_PROMPT).not.toContain("Docker");
      expect(DEEP_ANALYSIS_SYSTEM_PROMPT).not.toContain("SHA-256");
      expect(DEEP_ANALYSIS_SYSTEM_PROMPT).not.toContain("Vercel");
      expect(DEEP_ANALYSIS_SYSTEM_PROMPT).not.toContain("setInterval");
    });

    it("rejects ungrounded cross-repo hallucinations in adaptRepoToProjectItem while preserving grounded ones", () => {
      const connect4Repo = {
        name: "connect-4",
        description: "Connect 4 game engine with minimax AI",
        html_url: "https://github.com/developer/connect-4",
        fork: false,
        archived: false,
        language: "Python",
        stargazers_count: 5,
        forks_count: 1,
      };

      const contaminatedBullets = [
        "Implemented a minimax AI agent with alpha-beta pruning, leveraging recursive search trees.",
        "Engineered Monte Carlo simulation agents evaluating random rollouts to benchmark decisions.",
        "Calculated candidate proximity using the Haversine formula to optimize alpha-beta node evaluations.",
        "Buffered audio voice memos via HTTP 206 byte-range streaming.",
        "Dispatched emergency SOS workflows across three parallel workers.",
      ];

      const cleanProject = adaptRepoToProjectItem({
        repo: connect4Repo,
        bullets: contaminatedBullets,
        inferredTechnologies: ["Python"],
        scaleBudget: { minBullets: 2, maxBullets: 4 },
        repoContextText: "connect 4 game engine minimax alpha beta monte carlo simulation python",
      });

      const bulletsStr = cleanProject.bullets.join("\n");
      // All 3 hallucinations MUST be rejected from Connect 4
      expect(bulletsStr).not.toContain("Haversine");
      expect(bulletsStr).not.toContain("HTTP 206");
      expect(bulletsStr).not.toContain("emergency SOS");

      // Authentic Connect 4 bullets are preserved
      expect(bulletsStr).toContain("minimax AI agent");
      expect(bulletsStr).toContain("Monte Carlo");

      // Rejects ungrounded game engine leak into wildfire alert app
      const embergencyCorpus =
        "embergency wildfire alert app maps geocoding openweathermap react vite";
      expect(
        isUngroundedHallucination(
          "Built a Real-time geocoding mechanism within the game engine, utilizing OpenWeatherMap API to locate nearby fires and extract lat/lon coordinates.",
          embergencyCorpus
        )
      ).toBe(true);

      // Rejects incongruous audio UI cues framed as security hardening / anti-exploit
      const toesDownCorpus =
        "toes down mobile word party game audio effects nextjs typescript";
      expect(
        isUngroundedHallucination(
          "Hardened game security by incorporating audio feedback for correct and skip actions, enhancing user engagement and minimizing potential exploits.",
          toesDownCorpus
        )
      ).toBe(true);

      // Penalizes standalone fragmented layout stubs with 6 words and no quantitative metrics
      const stubAudit = auditBulletSubstantiveness(
        "Guaranteed strict 1-page Letter layout geometry."
      );
      expect(stubAudit.score).toBeLessThanOrEqual(2.0);
      const safeHavenCorpus =
        "safehaven domestic violence platform geospatial coordinates haversine shelter radius search audio streaming emergency sos";
      expect(
        isUngroundedHallucination(
          "Calculated resource proximity using the Haversine formula across concentric bounding boxes.",
          safeHavenCorpus
        )
      ).toBe(false);
    });

    it("evaluates oversampled candidate bullets through heuristic tournament pruning", () => {
      const repo: GitHubRawRepo = {
        name: "data-pipeline",
        description: "High-throughput data ingestion and transformation engine",
        html_url: "https://github.com/test/data-pipeline",
        fork: false,
        archived: false,
        language: "TypeScript",
        stargazers_count: 10,
        forks_count: 2,
      };

      // 10 candidate bullets generated via oversampling for Tier 2 (budget: min 4, max 8)
      const candidateBullets = [
        "Architected an event-driven stream processing pipeline utilizing Node.js streams to handle 50MB payloads with sub-50ms latency.", // score: high (metric + concurrency)
        "Integrated distributed state machines with Redis persistence to guarantee idempotent job execution across worker clusters.", // score: high (persistence + concurrency)
        "Formulated radial spatial search indexing via bounding boxes to optimize geographic query performance.", // score: high (algorithm)
        "Automated continuous integration and deployment workflows via GitHub Actions for automated test runs.", // score: medium (~5.0)
        "Streamlined user interface styling across desktop and mobile screens, ensuring seamless responsive layouts.", // score: low (UI styling penalty)
        "Configured environment variables for local testing.", // score: 0 (chore)
        "Engineered WebSocket subscriptions with JWT authentication to push real-time anomaly alerts to connected dashboards.", // score: high (protocol + auth)
        "Implemented distributed lock acquisition utilizing Redis TTLs to eliminate race conditions in parallel task queues.", // score: high (concurrency + cache)
        "Optimized database query indexes across high-traffic PostgreSQL tables to reduce query latency by 45%.", // score: high (metric + persistence)
        "Updated documentation and readme files with setup guidelines.", // score: 0 (chore)
      ];

      const project = adaptRepoToProjectItem({
        repo,
        bullets: candidateBullets,
        inferredTechnologies: ["TypeScript", "Redis", "PostgreSQL", "Node.js"],
        manifestTechnologies: ["TypeScript", "Redis", "PostgreSQL"],
        scaleBudget: { minBullets: 4, maxBullets: 8 },
        repoContextText: "data pipeline event stream processing redis worker postgresql websocket jwt",
      });

      // 1. Chores must be strictly dropped
      expect(project.bullets.some((b) => b.includes("environment variables"))).toBe(false);
      expect(project.bullets.some((b) => b.includes("Updated documentation"))).toBe(false);

      // 2. Clamped strictly to maxBullets (8)
      expect(project.bullets.length).toBeLessThanOrEqual(8);
      expect(project.bullets.length).toBeGreaterThanOrEqual(4);

      // 3. High substantive bullets must survive the tournament
      const allText = project.bullets.join("\n");
      expect(allText).toContain("stream processing pipeline");
      expect(allText).toContain("distributed state machines");
      expect(allText).toContain("WebSocket subscriptions");

      // 4. Leading verbs are diversified
      const verbs = project.bullets.map((b) => b.split(" ")[0]);
      const uniqueVerbs = new Set(verbs);
      expect(uniqueVerbs.size).toBe(verbs.length);
    });

    it("does not artificially backfill weak reserve bullets when primary candidates satisfy minBullets", () => {
      const repo: GitHubRawRepo = {
        name: "analytics-tool",
        description: "CLI analytics utility",
        html_url: "https://github.com/test/analytics-tool",
        fork: false,
        archived: false,
        language: "Python",
        stargazers_count: 5,
        forks_count: 1,
      };

      // 4 high-quality bullets and 3 weak reserve bullets
      const bullets = [
        "Formulated recursive search tree traversal with alpha-beta pruning to benchmark heuristic decision matrices.", // high
        "Engineered concurrent thread pools utilizing Python workers to process 10,000 matrix operations in 250ms.", // high (metric + concurrency)
        "Automated test coverage with pytest across integration suites, validating boundary matrix conditions.", // high (tests)
        "Persisted benchmark telemetry into SQLite databases with schema migrations.", // high (persistence)
        "Streamlined styling across screens, ensuring seamless layouts.", // weak reserve
        "Adjusted user preferences for themes.", // weak reserve
      ];

      const project = adaptRepoToProjectItem({
        repo,
        bullets,
        inferredTechnologies: ["Python"],
        scaleBudget: { minBullets: 4, maxBullets: 8 },
        repoContextText: "analytics tool python thread search tree sqlite",
      });

      // Since 4 high-scoring bullets satisfy minBullets (4), weak reserve bullets should NOT be pulled in
      expect(project.bullets.length).toBe(4);
      expect(project.bullets.some((b) => b.includes("Streamlined styling"))).toBe(false);
      expect(project.bullets.some((b) => b.includes("Adjusted user preferences"))).toBe(false);
    });

    it("deduplicateOrSynthesizeBullets selects the higher scoring candidate without synthetic phrases", () => {
      const bulletA = {
        bullet: "Constructed an event dispatcher to synchronize game state transitions across active rounds.",
        score: 6.5,
        isChore: false,
        hasMetric: false,
      };
      const bulletB = {
        bullet: "Engineered an event dispatcher to synchronize game state transitions across active rounds in under 15ms.",
        score: 8.5,
        isChore: false,
        hasMetric: true,
      };

      const result = deduplicateOrSynthesizeBullets([bulletA, bulletB], 4);
      expect(result).toHaveLength(1);
      expect(result[0]!.score).toBe(8.5);
      expect(result[0]!.bullet).toContain("15ms");
      expect(result[0]!.bullet).not.toContain("dynamically coordinating");
    });

    it("deduplicates feature toggle and subsystem orchestration echoes via root stemming", () => {
      const bulletA = {
        bullet: "Configured a centralized feature orchestration system to gate application subsystems, ensuring strict architectural boundaries.",
        score: 7.0,
        isChore: false,
        hasMetric: false,
      };
      const bulletB = {
        bullet: "Configured a subsystem configuration matrix and feature toggles, enabling services to be enabled or disabled without touching application code.",
        score: 6.0,
        isChore: false,
        hasMetric: false,
      };

      const result = deduplicateOrSynthesizeBullets([bulletA, bulletB], 4);
      expect(result).toHaveLength(1);
      expect(result[0]!.score).toBe(7.0);
      expect(result[0]!.bullet).toContain("centralized feature orchestration");
    });

    it("diversifies repeated leading verbs across bullets on the same project card", () => {
      const bullets = [
        "Configured a centralized authentication pipeline with multi-factor tokens.",
        "Configured a real-time WebSocket connection pool with heartbeat telemetry.",
      ];
      const diversified = diversifyLeadingVerbs(bullets);
      expect(diversified[0]).toMatch(/^Configured\b/);
      expect(diversified[1]).toMatch(/^Architected\b/);
    });

    it("purges physical script filenames and directory paths from technology tags while preserving frameworks and scoped packages", () => {
      const rawTools = [
        "Python",
        "marqlo_players_final_ver.py",
        "matchup_visualizer.py",
        "eval_diagnostics.py",
        "[fileId].js",
        "src/utils/helpers.ts",
        "Next.js",
        "@radix-ui/react-dialog",
        "React",
        "Tailwind CSS",
        "husky",
        "eslint",
      ];

      const cleaned = dedupeTools(rawTools);
      expect(cleaned).toContain("Python");
      expect(cleaned).toContain("Next.js");
      expect(cleaned).toContain("Radix UI");
      expect(cleaned).toContain("React");
      expect(cleaned).toContain("TailwindCSS");

      // Filenames and scaffolding MUST be purged
      expect(cleaned).not.toContain("marqlo_players_final_ver.py");
      expect(cleaned).not.toContain("matchup_visualizer.py");
      expect(cleaned).not.toContain("eval_diagnostics.py");
      expect(cleaned).not.toContain("[fileId].js");
      expect(cleaned).not.toContain("src/utils/helpers.ts");
      expect(cleaned).not.toContain("husky");
      expect(cleaned).not.toContain("eslint");
    });

    it("strips bracketed dynamic route filenames like [fileId].js from bullet text", () => {
      const raw =
        "Built a private evidence journal and media streaming engine [fileId].js to allow survivors to capture admissible incident documentation.";
      const cleaned = stripFileSystemArtifacts(raw);
      expect(cleaned).not.toContain("[fileId].js");
      expect(cleaned).toContain("media streaming engine to allow survivors");
    });

    it("cleans stranded prepositions before punctuation resulting from filename stripping", () => {
      const raw = "Designed and implemented AI vs AI matches using matchup_visualizer.py, reporting wins and ties.";
      const cleaned = stripFileSystemArtifacts(raw);
      expect(cleaned).not.toContain("matchup_visualizer.py");
      expect(cleaned).not.toContain("using,");
      expect(cleaned).toBe("Designed and implemented AI vs AI matches, reporting wins and ties.");
    });

    it("accurately classifies engineering bullets into Universal CS Dimensions", () => {
      const secBullet =
        "Architected multi-tenant data isolation utilizing PostgreSQL, Prisma, and AES-256-GCM for authenticated symmetric encryption.";
      const uiBullet =
        "Integrated multi-card batch grab and 3D peek stack functionality using React and CSS transitions.";
      const dataBullet =
        "Synchronized a durable database persistence mechanism utilizing a Prisma-based storage solution with normalized schemas.";
      const netBullet =
        "Engineered a bot-evading job scraping pipeline using Google Cloud Pub/Sub delta sync.";
      const teleBullet =
        "Configured a real-time ASCII telemetry pipeline within the logging module, monitoring invocations via a 66-column terminal logger.";
      const logicBullet =
        "Formulated recursive search tree traversal with alpha-beta pruning to benchmark heuristic decision matrices.";

      expect(detectArchitecturalDimension(secBullet)).toBe("SECURITY_RELIABILITY");
      expect(detectArchitecturalDimension(uiBullet)).toBe("INTERFACE_INTERACTION");
      expect(detectArchitecturalDimension(dataBullet)).toBe("DATA_STORAGE");
      expect(detectArchitecturalDimension(netBullet)).toBe("NETWORKING_PROTOCOLS");
      expect(detectArchitecturalDimension(teleBullet)).toBe("OBSERVABILITY_TELEMETRY");
      expect(detectArchitecturalDimension(logicBullet)).toBe("COMPUTATIONAL_LOGIC");
    });

    it("guarantees architectural dimension breadth in tournament ranking so security and UI are not squeezed out", () => {
      const repo: GitHubRawRepo = {
        name: "flagship-platform",
        description: "Full-stack enterprise application",
        html_url: "https://github.com/test/flagship-platform",
        fork: false,
        archived: false,
        language: "TypeScript",
        stargazers_count: 50,
        forks_count: 10,
      };

      // Candidate pool containing multiple high-scoring router bullets along with security, UI, and data
      const candidates = [
        "Architected a multi-tier inference router utilizing a zero-token LLM dispatcher to optimize latency under 50ms.", // Logic + Metric (score 8.5)
        "Built a 3-tier fallback hierarchy within the inference router, leveraging a token-cost-aware matrix with sub-100ms response.", // Logic + Metric (score 8.5)
        "Deployed an inference router circuit breaker with automated failover handling 10,000 req/min.", // Logic + Metric (score 8.5)
        "Architected multi-tenant data isolation utilizing PostgreSQL, Prisma, and AES-256-GCM for authenticated symmetric encryption.", // Security (score 6.5)
        "Integrated multi-card batch grab and 3D peek stack functionality using React and CSS transitions for zero-reload drops.", // UI (score 6.5)
        "Synchronized a durable database persistence mechanism utilizing a Prisma-based storage solution.", // Storage (score 6.5)
        "Developed a real-time ASCII telemetry pipeline to monitor model invocations via a standardized 66-column terminal logger.", // Telemetry (score 6.5)
      ];

      const project = adaptRepoToProjectItem({
        repo,
        bullets: candidates,
        inferredTechnologies: ["TypeScript", "Next.js", "Prisma", "PostgreSQL"],
        manifestTechnologies: ["TypeScript", "Next.js"],
        scaleBudget: { minBullets: 4, maxBullets: 5 },
        repoContextText: "flagship platform nextjs prisma postgresql aes-256 react telemetry",
      });

      // Scale budget maxBullets is 5.
      // Pass 1 ensures Security (AES-256), UI (3D peek stack), Storage (Prisma), Telemetry (ASCII logger),
      // and Logic (Inference Router) EACH get a slot!
      // The 3 redundant router bullets do NOT crowd out Security or UI!
      expect(project.bullets.length).toBe(5);
      const allText = project.bullets.join("\n");
      expect(allText).toContain("AES-256-GCM");
      expect(allText).toContain("3D peek stack");
      expect(allText).toContain("ASCII telemetry");
      expect(allText).toContain("database persistence");
      expect(allText).toContain("inference router");
    });

    it("normalizes dropped direct objects and bare infinitives after utilizing/leveraging/using", () => {
      const bullet1 =
        "Architected an orchestration mechanism utilizing to gate all application subsystems during high-traffic spikes.";
      expect(sanitizeBulletString(bullet1)).toBe(
        "Architected an orchestration mechanism to gate all application subsystems during high-traffic spikes."
      );

      const bullet2 =
        "Built a media streaming engine leveraging to support admissible incident documentation.";
      expect(sanitizeBulletString(bullet2)).toBe(
        "Built a media streaming engine to support admissible incident documentation."
      );
    });

    it("cleans malformed participles, typos, and singular articles before plural noun phrases", () => {
      const raw =
        "Permitted users to create and ading custom packs by adding a text files to the data repository.";
      const cleaned = sanitizeBulletString(unrollPermissivePhrasing(raw));
      expect(cleaned).not.toContain("ading");
      expect(cleaned).not.toContain("a text files");
      expect(cleaned).toBe(
        "Engineered and added custom packs by adding text files to the data repository."
      );
    });

    it("harmonizes serial gerund lists when trailing conjunction verbs switch to past tense", () => {
      const raw =
        "Engineered agent architecture, including inheriting from basePlayer, implementing the play method, and registered the class in the agents mapping.";
      const cleaned = sanitizeBulletString(raw);
      expect(cleaned).toBe(
        "Engineered agent architecture, including inheriting from basePlayer, implementing the play method, and registering the class in the agents mapping."
      );
    });

    it("excludes build plugins, css processors, and compiler scaffolding while preserving build tools and test runners", () => {
      const rawTools = [
        "Vite",
        "@vitejs/plugin-react",
        "vite-plugin-pwa",
        "postcss",
        "autoprefixer",
        "@rollup/plugin-node-resolve",
        "babel-plugin-styled-components",
        "Vitest",
        "Webpack",
      ];
      const filtered = dedupeTools(rawTools);
      expect(filtered).toContain("Vite");
      expect(filtered).toContain("Vitest");
      expect(filtered).toContain("Webpack");
      expect(filtered).not.toContain("@vitejs/plugin-react");
      expect(filtered).not.toContain("vite-plugin-pwa");
      expect(filtered).not.toContain("postcss");
      expect(filtered).not.toContain("autoprefixer");
      expect(filtered).not.toContain("@rollup/plugin-node-resolve");
      expect(filtered).not.toContain("babel-plugin-styled-components");
    });

    it("elevates standard library print and console diagnostics to active inspection phrasing", () => {
      const raw =
        "Engineered an iterative diagnostics pipeline utilizing Python's print function to output execution times.";
      const cleaned = cleanTrivialPrimitives(raw);
      expect(cleaned).toBe(
        "Engineered an iterative diagnostics pipeline to inspect and output execution times."
      );
    });

    it("avoids lead verb collisions when diversifying repeated leading verbs across a project card", () => {
      const bullets = [
        "Engineered a distributed cache layer with Redis.",
        "Architected an event-driven pub/sub queue.",
        "Engineered a resilient database retry loop.",
        "Engineered an observability pipeline with OpenTelemetry.",
      ];
      const diversified = diversifyLeadingVerbs(bullets);
      // Lead verbs across all 4 bullets must be unique!
      const leadVerbs = diversified.map((b) => b.match(/^([A-Z][a-z]+)\b/)![1]);
      const uniqueVerbs = new Set(leadVerbs);
      expect(uniqueVerbs.size).toBe(4);
      expect(leadVerbs[0]).toBe("Engineered");
      expect(leadVerbs[1]).toBe("Architected");
      expect(leadVerbs[2]).not.toBe("Engineered");
      expect(leadVerbs[2]).not.toBe("Architected");
      expect(leadVerbs[3]).not.toBe("Engineered");
      expect(leadVerbs[3]).not.toBe("Architected");
      expect(leadVerbs[3]).not.toBe(leadVerbs[2]);
    });
  });
});
