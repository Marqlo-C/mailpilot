/**
 * Real Data Scoring Verification Script
 *
 * Runs live evaluation on real data from your Neon database against
 * your desktop Ollama instance (at OLLAMA_BASE_URL).
 *
 * Usage:
 *   npx tsx scripts/test-real-ollama-cutover.ts
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { prisma } from "../lib/core/prisma";
import { loadMasterProfileForDraft } from "../lib/profile/master-profile";
import { extractMatchCandidateLens } from "../lib/matching/lens";
import { resolveJobOpportunity } from "../lib/opportunities/context";
import { resolveOpportunityMatch } from "../lib/matching/resolver";
import { resolveOllamaBaseUrl } from "../lib/ai/local-ollama";

async function main() {
  const ollamaUrl = resolveOllamaBaseUrl();
  console.log("\n============================================================");
  console.log(" 🚀 LIVE REAL DATA SCORING TEST");
  console.log("============================================================");
  console.log(`Ollama Endpoint: ${ollamaUrl}`);

  // 1. Verify desktop Ollama connection and models
  try {
    const probe = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!probe.ok) throw new Error(`HTTP ${probe.status}`);
    const data = (await probe.json()) as { models?: Array<{ name: string }> };
    const modelNames = data.models?.map((m) => m.name) || [];
    console.log(`✓ Ollama Connection: ONLINE`);
    console.log(`✓ Available Models:  ${modelNames.slice(0, 5).join(", ")}`);
    const hasNomic = modelNames.some((m) => m.includes("nomic-embed-text"));
    if (!hasNomic) {
      console.warn("⚠ Warning: 'nomic-embed-text' not found in Ollama tags.");
    }
  } catch (err) {
    console.error(`❌ Could not connect to Ollama at ${ollamaUrl}:`, err);
    process.exit(1);
  }

  // 2. Load Real Account & Master Profile
  const account = await prisma.account.findFirst({
    where: { email: { not: "" } },
    include: { settings: true, profile: true },
  });

  if (!account) {
    console.error("❌ No account found in database.");
    process.exit(1);
  }

  console.log(`\nAccount:   ${account.email} (${account.id})`);
  const profile = await loadMasterProfileForDraft(account.id);
  const lens = extractMatchCandidateLens(profile, null);
  console.log(`Candidate: ${profile.fullName || "Candidate"} | Experiences: ${profile.experiences.length} | Skills: ${lens.skills.length}`);

  // 3. Fetch Real Opportunities from DB
  const realOpps = await prisma.jobOpportunity.findMany({
    where: { accountId: account.id },
    take: 3,
    orderBy: { receivedAt: "desc" },
  });

  if (realOpps.length === 0) {
    console.log("No opportunities found for this account. Fetching latest global opportunities...");
    const globalOpps = await prisma.jobOpportunity.findMany({
      take: 3,
      orderBy: { receivedAt: "desc" },
    });
    realOpps.push(...globalOpps);
  }

  console.log(`\nFound ${realOpps.length} real opportunities to evaluate.\n`);

  for (let i = 0; i < realOpps.length; i++) {
    const opp = realOpps[i];
    const normalized = resolveJobOpportunity(opp);

    console.log("------------------------------------------------------------");
    console.log(`[Job ${i + 1}] ${normalized.roleTitle} at ${normalized.company}`);
    console.log(`Legacy DB Match Score: ${opp.matchScore}%`);
    console.log("------------------------------------------------------------");

    // 1. Evaluate via Heuristic
    const heuristic = await resolveOpportunityMatch({
      opportunity: normalized,
      candidate: lens,
      profile,
      rules: { scoringEngine: "heuristic" },
    });
    console.log(`🔹 [HEURISTIC] Score: ${heuristic.score}% (Tier: ${heuristic.tier})`);
    console.log(`   Skills: ${heuristic.matchedSkills.length ? heuristic.matchedSkills.join(", ") : "None matched by keywords"}`);

    // 2. Evaluate via Live Embedded Vector Crossover
    const embedded = await resolveOpportunityMatch({
      opportunity: normalized,
      candidate: lens,
      profile,
      rules: {
        scoringEngine: "embedded",
        embeddingProvider: "local_ollama",
        embeddingModel: "nomic-embed-text",
      },
    });
    console.log(`🔹 [EMBEDDED - Live Vectors] Score: ${embedded.score}% (Tier: ${embedded.tier})`);
    console.log(`   Engine Used: ${embedded.scoringEngineUsed} | Latency: ${embedded.crossoverResult?.latencyMs ?? 0}ms`);
    console.log(`   Transferable Competencies: ${embedded.crossoverResult?.transferableSkills.length ?? 0}`);
    if (embedded.crossoverResult?.transferableSkills.length) {
      for (const t of embedded.crossoverResult.transferableSkills.slice(0, 2)) {
        console.log(`   -> Target: "${t.targetRequirement.slice(0, 50)}..."`);
        console.log(`      Anchor: "${t.verbatimAnchorText.slice(0, 50)}..." (Sim: ${(t.similarity * 100).toFixed(1)}%)`);
      }
    }
    console.log(`   Reason: ${embedded.reason.slice(0, 110)}...`);

    // 3. Evaluate via Hybrid (50/50)
    const hybrid = await resolveOpportunityMatch({
      opportunity: normalized,
      candidate: lens,
      profile,
      rules: {
        scoringEngine: "hybrid",
        embeddingProvider: "local_ollama",
        embeddingModel: "nomic-embed-text",
      },
    });
    console.log(`🔹 [HYBRID (50/50)] Score: ${hybrid.score}% (Tier: ${hybrid.tier})`);
    console.log(`   Calculation: 50% heuristic (${heuristic.score}%) + 50% vector (${embedded.score}%) = ${hybrid.score}%\n`);
  }

  console.log("============================================================");
  console.log(" ✅ Real Data & Live Ollama Testing Complete!");
  console.log("============================================================\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
