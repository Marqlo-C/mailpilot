import { callLLMWithFallback } from "@/lib/llm";
import {
  type AnalyzeRepoParams,
  determineRepoScale,
} from "./schema.ssot";
import { extractSemanticMarkdownDigest } from "./prefilter";
import { groupDependenciesByDomain } from "./manifests";
import { deduceArchitecturalTopology } from "./topology";

export const DEEP_ANALYSIS_SYSTEM_PROMPT = `You are a Principal Systems Engineer reviewing code artifacts and documentation to author high-density technical resume bullets.

CORE OBJECTIVE:
Translate raw repository documentation and manifests into concrete, authoritative engineering bullets that describe mechanisms, data flows, protocols, and architectural trade-offs.

STRICT CONSTRAINTS & BANS:
1. NO INTRODUCTORY OR DESCRIPTION BULLETS: Never write a bullet that simply summarizes what the app or tool is (e.g., do NOT write "Architected a tool that helps users..."). Every single bullet must describe a specific technical mechanism, problem solved, or subsystem implemented.
2. NO NAME-DROPPING WITHOUT MECHANISM: Never write vague statements like "Used Python to do X" or "leveraged threads for caching". You MUST specify the technical primitive: data structures (bitboards, heaps, ASTs, circular buffers), networking/protocols (WebSockets, SSE, zero-copy, HTTP/2), concurrency models (mutexes, thread pools, async event loops), or algorithmic approaches (epsilon-greedy decay, Q-target freezing, geospatial indexing).
3. NATURAL, DIVERSE VERBS: Do NOT default to a repetitive loop of "Architected / Engineered / Implemented". Select verbs that describe the exact systems action:
   - Concurrency & Routing: Dispatched, Multiplexed, Sharded, Throttled, Decoupled, Synchronized, Isolated.
   - Data & Storage: Serialized, Materialized, Ingested, Partitioned, Normalized, Indexed.
   - Optimization & Testing: Profiled, Benchmarked, Vectorized, Quantized, Hardened.
4. GROUNDED SPECIFICS: Actively extract concrete constraints, dimensions, and operational parameters from the README (e.g., frame rates, episode bounds, reward formulations, latency bounds, HTTP status codes, schema models, tensor dimensions).
5. NO FAKE BUSINESS ROI: Never invent commercial revenue, user growth percentages, or fake organizational metrics. Ground all results strictly in computational efficiency, data integrity, protocol conformance, or automated pipeline reliability.

FORMAT & LENGTH:
- Each bullet must be 18 to 36 words, dense with technical specificity.
- Return ONLY valid JSON:
{
  "bullets": string[],
  "extractedTechnologies": string[]
}`;

export async function analyzeRepoArtifacts(
  params: AnalyzeRepoParams
): Promise<{ bullets: string[]; technologies: string[] }> {
  const {
    repoName,
    description,
    readme,
    manifestTechnologies,
    repoSize,
    manifestPaths = [],
    hasMonorepoStructure = false,
    llmOptions,
  } = params;

  const scaleBudget = determineRepoScale({
    size: repoSize,
    manifestCount:
      manifestPaths.length > 0
        ? manifestPaths.length
        : manifestTechnologies.length > 0
          ? 1
          : 0,
    hasMonorepoStructure,
  });

  const verifiedTopology = deduceArchitecturalTopology(
    manifestTechnologies,
    manifestPaths
  );

  const domainGroups = groupDependenciesByDomain(manifestTechnologies);

  const readmeDigest = readme
    ? extractSemanticMarkdownDigest(readme, scaleBudget.ingestCharBudget)
    : null;

  if (!readmeDigest && manifestTechnologies.length === 0) {
    return {
      bullets: [
        description
          ? `Engineered and maintained ${repoName}: ${description.replace(/\.$/, "")}.`
          : `Engineered and maintained the ${repoName} codebase.`,
      ],
      technologies: manifestTechnologies,
    };
  }

  // Fold description into technical context rather than an isolated summary field
  const promptPayload: Record<string, unknown> = {
    repository: repoName,
    technicalContext: description
      ? `Repository context: ${description}`
      : "Open-source systems repository",
    scaleTier: `Tier ${scaleBudget.tier} (${scaleBudget.targetScope})`,
    repositoryScale: `Tier ${scaleBudget.tier} (${scaleBudget.targetScope})`,
    targetBulletDensity: `Author between ${scaleBudget.minBullets} and ${scaleBudget.maxBullets} high-density engineering bullets. Each bullet MUST describe a concrete technical mechanism or architectural subsystem—do NOT write a repository summary bullet.`,
    targetBulletCount: `${scaleBudget.minBullets} to ${scaleBudget.maxBullets} high-density engineering bullets`,
    categorizedSystemsDependencies: domainGroups,
    readmeDigest: readmeDigest || "No README available",
  };

  if (verifiedTopology) {
    promptPayload.verifiedArchitecturalTopology = `Verified architectural topology: ${verifiedTopology}`;
  }

  const userPrompt = JSON.stringify(promptPayload, null, 2);

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
        bullets: response.bullets
          .map(String)
          .map((b) => b.trim())
          .filter(Boolean),
        technologies: Array.isArray(response.extractedTechnologies)
          ? response.extractedTechnologies
              .map(String)
              .map((t) => t.trim())
              .filter(Boolean)
          : manifestTechnologies,
      };
    }
  } catch (error) {
    console.warn(
      `LLM deep inference failed for ${repoName}, falling back to heuristics`,
      error
    );
  }

  // Deterministic systems-engineering fallback adhering to active action verbs and zero generic filler
  const fallbackBullets: string[] = [];
  const primaryDomain = Object.keys(domainGroups)[0];
  const domainTools = primaryDomain ? domainGroups[primaryDomain]?.slice(0, 4) : [];

  if (verifiedTopology) {
    fallbackBullets.push(
      `Engineered ${repoName} subsystem topology featuring ${verifiedTopology.toLowerCase().replace(/\.$/, "")}.`
    );
  } else if (description) {
    fallbackBullets.push(
      `Implemented core computational pipeline for ${repoName}, addressing ${description.replace(/\.$/, "")}.`
    );
  } else {
    fallbackBullets.push(
      `Engineered and maintained the ${repoName} systems architecture.`
    );
  }

  if (domainTools && domainTools.length > 0) {
    fallbackBullets.push(
      `Orchestrated ${primaryDomain.toLowerCase()} workflows utilizing ${domainTools.join(", ")}.`
    );
  } else if (manifestTechnologies.length > 0) {
    fallbackBullets.push(
      `Integrated systems dependencies and automated workflows utilizing ${manifestTechnologies.slice(0, 4).join(", ")}.`
    );
  }

  if (scaleBudget.tier >= 2) {
    fallbackBullets.push(
      `Hardened runtime execution and decoupled service layers to ensure deterministic throughput and fault tolerance.`
    );
  }
  if (scaleBudget.tier === 3) {
    fallbackBullets.push(
      `Partitioned distributed service modules across independent packages, synchronizing inter-process state and automated CI/CD pipelines.`
    );
  }

  return {
    bullets: fallbackBullets,
    technologies: manifestTechnologies,
  };
}
