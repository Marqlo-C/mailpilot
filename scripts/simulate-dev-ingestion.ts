/**
 * Simulated Dev Ingestion Pass (Phase 6.3)
 *
 * Simulates the ingestion of a candidate job opportunity in development mode
 * and confirms that the real-time terminal shadow telemetry card
 * (┌─ SHADOW EMBEDDED EVALUATION ...) renders cleanly.
 *
 * Usage:
 *   npx tsx scripts/simulate-dev-ingestion.ts
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

// Force development environment for terminal card rendering
Object.assign(process.env, {
  NODE_ENV: "development",
  LOG_ASCII_TABLES: "1",
});

import { dispatchShadowEvaluation } from "../lib/services/shadow-evaluation.service";
import { parseAccountRules } from "../lib/validations/rules.schema";
import type { MasterProfileInput } from "../lib/validations/profile.schema";

async function main() {
  console.log("\n============================================================");
  console.log(" 🧪 SIMULATING INGESTION PASS (DEV MODE TELEMETRY TEST)");
  console.log("============================================================\n");

  const simulatedRules = parseAccountRules({
    embeddingProvider: "local_ollama",
    embeddingModel: "nomic-embed-text",
    enableShadowEmbeddings: true,
    featureFlags: {
      shadow_evaluation: true,
    },
    crossoverScoreThreshold: 60,
  });

  const simulatedProfile: MasterProfileInput = {
    fullName: "Jordan Cross",
    email: "jordan@example.com",
    location: "San Francisco, CA",
    summary: "Senior Platform Architect specialized in high-throughput distributed systems.",
    links: [],
    skills: [
      {
        label: "Systems & Architecture",
        parentCategory: null,
        items: [
          { name: "Distributed Systems", proficiency: null },
          { name: "High-Throughput Pipelines", proficiency: null },
          { name: "Fault-Tolerant Consensus", proficiency: null },
        ],
      },
    ],
    experiences: [
      {
        id: "exp_sim_1",
        company: "Starlight Networks",
        role: "Principal Infrastructure Lead",
        location: "San Francisco, CA",
        category: "Engineering",
        startDate: "2021-03",
        endDate: "Present",
        displayOrder: 1,
        bullets: [
          {
            id: "b_sim_1",
            rawText:
              "Engineered distributed event streaming pipelines processing 1.2M messages/sec with sub-second replication latency.",
            technologies: ["Kafka", "Rust", "PostgreSQL"],
            hasMetric: true,
          },
          {
            id: "b_sim_2",
            rawText:
              "Architected multi-region fault tolerance reducing global failover time by 85%.",
            technologies: ["Kubernetes", "gRPC"],
            hasMetric: true,
          },
        ],
      },
    ],
    projects: [],
    education: [
      {
        id: "edu_sim_1",
        institution: "University of California",
        degree: "B.S. Computer Science",
        fieldOfStudy: "Computer Science",
        startDate: "2015",
        graduationDate: "2019",
        status: "GRADUATED",
        honors: [],
        coursework: [],
      },
    ],
    certifications: [],
    awards: [],
    interests: [],
  };

  const simulatedOpportunity = {
    id: "opp_sim_999",
    title: "Senior Distributed Systems Engineer",
    company: "Nexus Cloud Systems",
    description:
      "Seeking a Senior Distributed Systems Engineer to design high-throughput data streams, manage consensus replication, and build resilient infrastructure.",
    matchScore: 84,
  };

  console.log(`[simulate-ingestion] Dispatching shadow evaluation for:`);
  console.log(`  Role:    ${simulatedOpportunity.title}`);
  console.log(`  Company: ${simulatedOpportunity.company}`);
  console.log(`  Score:   ${simulatedOpportunity.matchScore}% (Heuristic Baseline)`);
  console.log(`\nWaiting for shadow evaluation execution...\n`);

  const result = await dispatchShadowEvaluation({
    accountId: "simulated_acc_1",
    opportunity: simulatedOpportunity,
    rules: simulatedRules,
    profile: simulatedProfile,
  });

  console.log("\n============================================================");
  if (result) {
    console.log(" ✓ Simulation Succeeded: Embedded crossover evaluation completed.");
    console.log(`   Crossover Score: ${result.crossoverScore}%`);
    console.log(`   Provider Used:   ${result.providerUsed}`);
    console.log(`   Latency:         ${result.latencyMs}ms`);
  } else {
    console.log(" ✓ Simulation Completed: Handled via silent fallback / logged telemetry.");
  }
  console.log("============================================================\n");
}

main().catch((err) => {
  console.error("Simulation failed:", err);
  process.exit(1);
});
