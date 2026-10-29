import { callLLMWithFallback } from "@/lib/llm";
import {
  type AnalyzeRepoParams,
  determineRepoScale,
} from "./schema.ssot";
import { extractSemanticMarkdownDigest } from "./prefilter";
import { groupDependenciesByDomain } from "./manifests";
import { deduceArchitecturalTopology } from "./topology";
import { dedupeTools } from "./tools";

export const DEEP_ANALYSIS_SYSTEM_PROMPT = `You are the Lead Systems Architect and Core Engineer who designed and implemented this codebase. You are articulating your own architectural decisions, mechanisms, data structures, and engineering execution for your technical portfolio.

CORE OBJECTIVE:
Translate repository documentation and manifests into concrete, authoritative engineering bullets that describe mechanisms, data flows, protocols, and architectural trade-offs that you engineered.

CRITICAL CONSTRAINTS:
1. NO INTRODUCTORY OR DESCRIPTION BULLETS: Never write a bullet summarizing what the app is or repeating the repository description/tagline. Bullet 0 must NOT be an introductory summary. Every single bullet must describe a specific technical mechanism, problem solved, or subsystem implemented.
2. BUILDER VOICE (BAN SPECTATOR & PM PHRASING):
   - NEVER write from an outside observer or user-manual perspective (e.g., do NOT write "Allowed users to...", "Enabled users to...", "Supported users in...").
   - NEVER start with formulaic templates: "Designed a [Name] system", "Implemented a [Name] mechanism".
   - Start directly with an active systems operational verb followed by the computational mechanism or data structure:
     Pattern: "[Operational Verb] [subsystem or mechanism] utilizing [underlying primitive, protocol, or data structure] to [system outcome]."
3. BANNED TRIVIAL TASKS & PRIMITIVES:
   Never generate bullets for low-signal chores or basic developer tasks:
   - Setting up environment variables or local configuration files (.env files).
   - Basic filesystem hygiene (creating folders, organizing assets into directories).
   - Generating superficial demonstration artifacts (screen recordings, screenshots, simple demo scripts).
   - Generic development tooling (installing dependencies, configuring linters, formatting, git hooks).
   - Never cite basic language built-in functions or trivial standard library calls as engineering achievements (e.g., do NOT cite 'setInterval', 'setTimeout', 'fetch()', 'window.addEventListener', or 'Math.random()'). Frame in terms of the underlying logic: state machines, animation frame synchronization, debounced workers, or event dispatchers.
   - Never cite generic click-to-deploy PaaS platforms (e.g., do NOT write "deployed to Vercel/Netlify using automatic redeployment on git push").
4. GROUNDED PRIMITIVES & ZERO SPECULATIVE HEDGING:
   - State strictly what was authored and implemented in this codebase.
   - NEVER use speculative hedging like '(e.g., RabbitMQ)', '(e.g., SHA-256)', '(e.g., Docker)', or 'such as X'.
   - NEVER invent unverified backend infrastructure (message queues, relational databases, containerization) for client-side applications. Ground all primitives in the actual dependencies and documentation.
5. NATURAL, DIVERSE ENGINEERING ACTION VERBS:
   - Use a rich, varied engineering vocabulary tailored to the specific accomplishment:
     Architected, Built, Formulated, Automated, Integrated, Configured, Optimized, Deployed, Streamlined, Instrumented, Scaled, Enforced, Formatted, Evaluated, Transformed, Profiled, Hardened, Decoupled, Synchronized, Persisted.
   - BAN REPETITIVE VERB ROTATIONS: Never begin consecutive bullets with the same operational verb (e.g., do NOT start multiple bullets with 'Serialized' or 'Dispatched'). Diversify verbs naturally across the full portfolio.
6. GROUNDED SPECIFICS & ZERO LATEX: Actively extract concrete constraints and parameters from repository documentation. NEVER use LaTeX math notation ($...$ or \\text{...}). Use clean plain text units (e.g., latency in ms, availability percentages, throughput in req/s, or payload sizes in KB/MB).
7. DIVERSITY REQUIREMENT: Never author two bullets describing different aspects of the same user feature. Each bullet must represent a completely distinct architectural layer (e.g., state synchronization, UI gesture handling, data ingestion, animation timing).
8. SUBSYSTEM COVERAGE: When verifiedArchitecturalSubsystems are provided, dedicate at least one bullet to each verified capability (test suites, containerization, schema persistence, CI/CD).
9. ZERO FILENAMES, PATHS, OR RAW EXTENSIONS: Never reference physical filenames, directory paths, or raw extensions (e.g., do NOT write 'main.py', 'connect4.py', 'src/data/', or '.txt files'). Refer exclusively to the architectural module, class, subsystem, or data format (e.g., 'within the game engine', 'in the decision agent', 'via line-delimited records').

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
    pureCodeBytes,
    manifestPaths = [],
    hasMonorepoStructure = false,
    structuralMarkers,
    languageMetrics,
    llmOptions,
  } = params;

  const verifiedTopology = deduceArchitecturalTopology(
    manifestTechnologies,
    manifestPaths
  );

  const subsystems = {
    hasDatabase: structuralMarkers?.hasDatabase,
    hasTests: structuralMarkers?.hasTests,
    hasContainerization: structuralMarkers?.hasContainerization,
    hasCiCd: structuralMarkers?.hasCiCd,
    hasMonorepo: hasMonorepoStructure || structuralMarkers?.hasMonorepo,
    hasMultiDomainTopology: Boolean(verifiedTopology),
  };

  const hasReadme = Boolean(readme && readme.trim().length > 0);
  const scaleBudget = determineRepoScale({
    size: repoSize,
    codeBytes: pureCodeBytes ?? structuralMarkers?.pureCodeBytes ?? null,
    subsystems,
    manifestCount:
      manifestPaths.length > 0
        ? manifestPaths.length
        : manifestTechnologies.length > 0
          ? 1
          : 0,
    hasMonorepoStructure,
    hasReadme,
  });

  const domainGroups = groupDependenciesByDomain(manifestTechnologies);

  const readmeDigest = readme
    ? extractSemanticMarkdownDigest(readme, scaleBudget.ingestCharBudget)
    : null;

  if (!readmeDigest && manifestTechnologies.length === 0) {
    return {
      bullets: [],
      technologies: dedupeTools(manifestTechnologies),
    };
  }

  const readmeLength = readme ? readme.trim().length : 0;
  const verifiedSubsystemsCount =
    (subsystems.hasDatabase ? 1 : 0) +
    (subsystems.hasTests ? 1 : 0) +
    (subsystems.hasContainerization ? 1 : 0) +
    (subsystems.hasCiCd ? 1 : 0) +
    (subsystems.hasMonorepo ? 1 : 0) +
    (subsystems.hasMultiDomainTopology ? 1 : 0);

  const resolvedCodeBytes = pureCodeBytes ?? structuralMarkers?.pureCodeBytes ?? null;

  // Rich context heuristic: repo has substantive README or substantial multi-manifest/subsystem depth
  const hasRichContext =
    hasReadme &&
    (readmeLength >= 1200 ||
      (manifestTechnologies.length >= 4 && (resolvedCodeBytes ?? 0) >= 25000) ||
      (verifiedSubsystemsCount >= 2 && readmeLength >= 800));

  // When context is rich, oversample candidate pool by +2 so heuristic tournament can prune weaker bullets.
  // When context is sparse (no README or short README), stay conservative to prevent hallucination.
  const oversampleDelta = hasRichContext ? 2 : 0;
  const candidateMin = scaleBudget.minBullets;
  const candidateMax = scaleBudget.maxBullets + oversampleDelta;

  const promptPayload: Record<string, unknown> = {
    repository: repoName,
    scaleTier: `Tier ${scaleBudget.tier} (${scaleBudget.targetScope})`,
    repositoryScale: `Tier ${scaleBudget.tier} (${scaleBudget.targetScope})`,
    targetBulletDensity: `Author between ${candidateMin} and ${candidateMax} candidate engineering bullets focusing on concrete technical mechanisms. Each bullet MUST describe a concrete technical mechanism or architectural subsystem—do NOT author Bullet 0 as a repository synopsis or repeat the description. These candidate bullets will undergo tournament selection and heuristic pruning.`,
    targetBulletCount: `${candidateMin} to ${candidateMax} candidate engineering bullets`,
    categorizedSystemsDependencies: domainGroups,
    readmeDigest: readmeDigest || "No README available",
  };

  if (description) {
    promptPayload.technicalScope = `Repository scope (do NOT repeat as a bullet): ${description}`;
  }

  if (verifiedTopology) {
    promptPayload.verifiedArchitecturalTopology = `Verified architectural topology: ${verifiedTopology}`;
  }

  const verifiedSubsystemsList: string[] = [];
  if (subsystems.hasDatabase) verifiedSubsystemsList.push("Database persistence & migrations");
  if (subsystems.hasTests) verifiedSubsystemsList.push("Automated test coverage (unit/integration/E2E)");
  if (subsystems.hasContainerization) verifiedSubsystemsList.push("Docker containerization & infrastructure");
  if (subsystems.hasCiCd) verifiedSubsystemsList.push("Automated CI/CD workflows");
  if (subsystems.hasMonorepo) verifiedSubsystemsList.push("Decoupled monorepo workspaces");
  if (subsystems.hasMultiDomainTopology && verifiedTopology) {
    verifiedSubsystemsList.push(`Multi-domain stack (${verifiedTopology})`);
  }

  if (verifiedSubsystemsList.length > 0) {
    promptPayload.verifiedArchitecturalSubsystems = verifiedSubsystemsList;
    promptPayload.subsystemGuidance = `Dedicate at least one bullet to each verified architectural subsystem: ${verifiedSubsystemsList.join("; ")}.`;
  }

  if (languageMetrics && Object.keys(languageMetrics).length > 0) {
    promptPayload.primaryLanguages = Object.keys(languageMetrics).slice(0, 4);
  }

  const userPrompt = JSON.stringify(promptPayload, null, 2);

  // Extract LLM configuration, supporting both flat options and nested llmOptions
  const nested = llmOptions?.llmOptions;
  const resolvedProvider = nested?.llmProvider ?? llmOptions?.llmProvider ?? "LOCAL_OLLAMA";
  const resolvedOllamaUrl = nested?.localOllamaUrl ?? llmOptions?.localOllamaUrl;
  const resolvedOllamaModel = nested?.ollamaModel ?? llmOptions?.ollamaModel;
  const resolvedDevModel = nested?.devModelOverride ?? llmOptions?.devModelOverride;
  const resolvedAllowCloud = nested?.allowCloudFallback ?? llmOptions?.allowCloudFallback;
  const resolvedAccountId = llmOptions?.accountId;
  const resolvedRules = llmOptions?.accountRules;

  try {
    const response = await callLLMWithFallback({
      systemPrompt: DEEP_ANALYSIS_SYSTEM_PROMPT,
      userPrompt,
      llmProvider: resolvedProvider,
      localOllamaUrl: resolvedOllamaUrl,
      ollamaModel: resolvedOllamaModel,
      devModelOverride: resolvedDevModel,
      allowCloudFallback: resolvedAllowCloud,
      accountId: resolvedAccountId,
      accountRules: resolvedRules,
      ollamaOptions: {
        temperature: 0.5,
      },
    });

    if (
      response &&
      Array.isArray(response.bullets) &&
      response.bullets.length > 0
    ) {
      const rawExtracted = Array.isArray(response.extractedTechnologies)
        ? response.extractedTechnologies.map(String).map((t) => t.trim()).filter(Boolean)
        : manifestTechnologies;

      // Technology Grounding Fence:
      // Reject phantom/hallucinated tech stacks (e.g. TypeORM on a client-side app).
      // Any extracted tool must be present in manifestTechnologies, languageMetrics, or explicitly documented in README/description.
      const manifestTechSet = new Set(
        manifestTechnologies.map((t) => t.toLowerCase().trim())
      );
      const languageTechSet = new Set(
        Object.keys(languageMetrics ?? {}).map((l) => l.toLowerCase().trim())
      );
      const docContext = `${repoName} ${description ?? ""} ${readme ?? ""}`.toLowerCase();

      const groundedExtracted = rawExtracted.filter((tech) => {
        const lower = tech.toLowerCase().trim();
        if (manifestTechSet.has(lower) || languageTechSet.has(lower)) {
          return true;
        }
        // Verify tool is actually mentioned as a word in README or description
        const escaped = lower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const wordRegex = new RegExp(`(?:^|[\\s\`"'(,])${escaped}(?:[\\s\`"')!?,]|$)`, "i");
        return wordRegex.test(docContext);
      });

      // Strictly bound returned bullets to the tier's maximum bullet density
      const clampedBullets = response.bullets
        .map(String)
        .map((b) => b.trim())
        .filter(Boolean)
        .slice(0, scaleBudget.maxBullets);

      return {
        bullets: clampedBullets,
        technologies: dedupeTools(
          groundedExtracted.length > 0 ? groundedExtracted : manifestTechnologies
        ),
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

  // Ensure minimum target density is met even in heuristic fallback
  if (scaleBudget.minBullets >= 3 && fallbackBullets.length < 3) {
    fallbackBullets.push(
      `Instrumented testing harnesses and automated build pipelines to validate subsystem stability and performance constraints.`
    );
  }

  return {
    bullets: fallbackBullets.slice(0, scaleBudget.maxBullets),
    technologies: dedupeTools(manifestTechnologies),
  };
}
