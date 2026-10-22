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
  LOW_SIGNAL_CHORE_REGEX,
  DEEP_ANALYSIS_SYSTEM_PROMPT,
  FILTER_OUT_REGEX,
  PRIORITY_REGEX,
} from "@/lib/github";
import { consolidateProfiles } from "@/lib/profile/profile-consolidation";
import { getEmptyMasterProfileData } from "@/lib/validations/profile";

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
    it("classifies small repositories as Tier 1 with 2,500 budget and 2-3 bullets", () => {
      const scale = determineRepoScale({
        size: 1450,
        manifestCount: 1,
        hasMonorepoStructure: false,
      });

      expect(scale.tier).toBe(1);
      expect(scale.ingestCharBudget).toBe(2500);
      expect(scale.minBullets).toBe(2);
      expect(scale.maxBullets).toBe(3);
      expect(scale.targetScope).toContain("CLI tools");
    });

    it("classifies mid-scale services as Tier 2 with 5,500 budget and 4-6 bullets", () => {
      const scaleBySize = determineRepoScale({
        size: 7200,
        manifestCount: 1,
      });
      expect(scaleBySize.tier).toBe(2);
      expect(scaleBySize.ingestCharBudget).toBe(5500);
      expect(scaleBySize.minBullets).toBe(4);
      expect(scaleBySize.maxBullets).toBe(6);

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
      expect(deps).not.toContain("vitest");
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
      expect(parsedPrompt.targetBulletCount).toBe("2 to 3 high-density engineering bullets");
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

      // Verify Tier 3 scale and target bullets
      expect(parsedPrompt.repositoryScale).toContain("Tier 3");
      expect(parsedPrompt.targetBulletCount).toBe("6 to 10 high-density engineering bullets");

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
    it("handles multiple public repositories with custom raw file fetcher", async () => {
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
    });
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
      expect(DEEP_ANALYSIS_SYSTEM_PROMPT).toContain("Setting up environment variables");
      expect(DEEP_ANALYSIS_SYSTEM_PROMPT).toContain("Basic filesystem hygiene");
      expect(DEEP_ANALYSIS_SYSTEM_PROMPT).toContain("superficial demonstration artifacts");
      expect(DEEP_ANALYSIS_SYSTEM_PROMPT).toContain("Generic development tooling");
      expect(DEEP_ANALYSIS_SYSTEM_PROMPT).toContain("NO INTRODUCTORY OR DESCRIPTION BULLETS");
    });

    it("filters out low-signal chore bullets during adaptRepoToProjectItem", () => {
      const repo = {
        name: "data-service",
        description: "Data transformation microservice",
        html_url: "https://github.com/dev/data-service",
        fork: false,
        archived: false,
        language: "TypeScript",
        topics: [],
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
});
