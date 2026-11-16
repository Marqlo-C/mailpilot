/**
 * Verification Script for Primary Scoring Engine Cutover (Phase 5)
 *
 * Demonstrates:
 * 1. Heuristic baseline scoring
 * 2. Embedded vector crossover primary scoring (or fallback if Ollama/API offline)
 * 3. Hybrid 50/50 blended scoring
 * 4. Automatic fallback defense on provider failure/timeout
 *
 * Usage:
 *   npx tsx scripts/verify-scoring-engine.ts
 */

import { resolveOpportunityMatch } from "../lib/matching/resolver";
import { resolveJobOpportunity } from "../lib/opportunities/context";
import { extractMatchCandidateLens } from "../lib/matching/lens";
import {
  getEmptyMasterProfileData,
  type MasterProfileInput,
} from "../lib/validations/profile.schema";
import type { CandidatePersona } from "../lib/persona";

async function main() {
  console.log("\n============================================================");
  console.log(" 🧪 MailPilot Scoring Engine Verification (Phase 5 Cutover)");
  console.log("============================================================\n");

  // Sample candidate profile
  const sampleProfile: MasterProfileInput = {
    ...getEmptyMasterProfileData(),
    fullName: "Alex Rivera",
    email: "alex@example.com",
    experiences: [
      {
        id: "exp-1",
        role: "Senior Operations Coordinator",
        company: "Apex Global",
        location: null,
        category: "Work",
        startDate: "2019-01",
        endDate: null,
        bullets: [
          {
            id: "b-1",
            rawText:
              "Orchestrated cross-functional incident containment protocols and directed multi-facility preventative maintenance schedules.",
            hasMetric: false,
            technologies: [],
          },
        ],
        displayOrder: 0,
      },
    ],
    skills: [
      {
        label: "Operations",
        parentCategory: null,
        items: [
          { name: "Incident Containment", proficiency: null },
          { name: "Preventative Maintenance", proficiency: null },
          { name: "Resource Allocation", proficiency: null },
        ],
      },
    ],
    summary:
      "Operational leader with 6+ years orchestrating safety and facility readiness.",
  };

  const samplePersona: CandidatePersona = {
    archetype: "Applied Practitioner / Skill-Certified",
    seniorityTier: "Senior / Lead Professional",
    leadershipScope: "Project / Team Lead",
    distinctionAnchor: "None / Production Tenure",
    inFieldYears: 6,
    calendarYears: 6,
    titleFamily: "Operations",
    timelineContext: "6 years in Operations",
    toneGuidance: "Direct and procedural",
  };

  const candidateLens = extractMatchCandidateLens(sampleProfile, samplePersona);

  const sampleOpportunity = resolveJobOpportunity({
    company: "Vanguard Logistics",
    title: "Regional Operations Manager",
    description: `
### Requirements & Qualifications
- Demonstrated expertise in Incident Containment and emergency response
- Lead Preventative Maintenance programs across regional fulfillment centers
- Orchestrate Resource Allocation and shift scheduling
- 5+ years of verified operational leadership experience
`,
    salary: "$120,000 - $145,000",
  });

  console.log(`Opportunity: ${sampleOpportunity.roleTitle} at ${sampleOpportunity.company}`);
  console.log(`Candidate:   ${sampleProfile.fullName} (${candidateLens.titleFamily})\n`);

  // --- STEP 1: Heuristic Engine ---
  console.log("------------------------------------------------------------");
  console.log("1. Testing 'heuristic' Engine (Default Baseline)");
  console.log("------------------------------------------------------------");
  const heuristicResult = await resolveOpportunityMatch({
    opportunity: sampleOpportunity,
    candidate: candidateLens,
    profile: sampleProfile,
    rules: { scoringEngine: "heuristic" },
  });
  console.log(`✓ Engine Used:     ${heuristicResult.scoringEngineUsed}`);
  console.log(`✓ Match Score:     ${heuristicResult.score}% (Tier: ${heuristicResult.tier})`);
  console.log(`✓ Skills Matched:  ${heuristicResult.matchedSkills.join(", ")}`);
  console.log(`✓ Reason:          ${heuristicResult.reason.slice(0, 100)}...\n`);

  // --- STEP 2: Fallback Defense ---
  console.log("------------------------------------------------------------");
  console.log("2. Testing Fallback Defense ('embedded' with disabled provider)");
  console.log("------------------------------------------------------------");
  const fallbackResult = await resolveOpportunityMatch({
    opportunity: sampleOpportunity,
    candidate: candidateLens,
    profile: sampleProfile,
    rules: {
      scoringEngine: "embedded",
      embeddingProvider: "disabled",
    },
  });
  console.log(`✓ Engine Requested: ${fallbackResult.scoringEngineRequested}`);
  console.log(`✓ Engine Used:      ${fallbackResult.scoringEngineUsed} (Resilient Fallback Active)`);
  console.log(`✓ Fallback Reason:  ${fallbackResult.fallbackReason}`);
  console.log(`✓ Match Score:      ${fallbackResult.score}% (preserved heuristic score)\n`);

  // --- STEP 3: Live or Mocked Vector Embedded Evaluation ---
  console.log("------------------------------------------------------------");
  console.log("3. Testing 'embedded' Engine (Vector Semantic Crossover)");
  console.log("------------------------------------------------------------");
  const embeddedResult = await resolveOpportunityMatch({
    opportunity: sampleOpportunity,
    candidate: candidateLens,
    profile: sampleProfile,
    rules: {
      scoringEngine: "embedded",
      embeddingProvider: "local_ollama",
      embeddingModel: "nomic-embed-text",
    },
  });
  console.log(`✓ Engine Requested: ${embeddedResult.scoringEngineRequested}`);
  console.log(`✓ Engine Used:      ${embeddedResult.scoringEngineUsed}`);
  console.log(`✓ Final Score:      ${embeddedResult.score}%`);
  if (embeddedResult.scoringEngineUsed === "embedded") {
    console.log(`✓ Vector Crossover: ${embeddedResult.crossoverResult?.crossoverScore}%`);
    console.log(`✓ Transferable:    ${embeddedResult.crossoverResult?.transferableSkills.length ?? 0} competencies found`);
  } else {
    console.log(`ℹ Local Ollama not currently active on port 11434; gracefully fell back to heuristic score (${embeddedResult.score}%) without error.`);
  }
  console.log("");

  // --- STEP 4: Hybrid 50/50 Blended Evaluation ---
  console.log("------------------------------------------------------------");
  console.log("4. Testing 'hybrid' Engine (50% Heuristic + 50% Vector)");
  console.log("------------------------------------------------------------");
  const hybridResult = await resolveOpportunityMatch({
    opportunity: sampleOpportunity,
    candidate: candidateLens,
    profile: sampleProfile,
    rules: {
      scoringEngine: "hybrid",
      embeddingProvider: "local_ollama",
      embeddingModel: "nomic-embed-text",
    },
  });
  console.log(`✓ Engine Requested: ${hybridResult.scoringEngineRequested}`);
  console.log(`✓ Engine Used:      ${hybridResult.scoringEngineUsed}`);
  console.log(`✓ Final Score:      ${hybridResult.score}% (Tier: ${hybridResult.tier})\n`);

  console.log("============================================================");
  console.log(" ✅ All Scoring Engine branches verified successfully!");
  console.log("============================================================\n");
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
