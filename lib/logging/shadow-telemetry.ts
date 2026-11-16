import { isAsciiTableLoggingEnabled, truncate } from "./index";

export interface ShadowEvaluationTelemetryParams {
  /** Unique ID of the evaluated job opportunity */
  opportunityId: string;
  /** Role or job title */
  title: string;
  /** Company or employer name */
  company: string;
  /** Legacy heuristic or AI match score (0 - 100) */
  heuristicScore: number;
  /** Embedded semantic crossover match score (0 - 100) */
  crossoverScore: number;
  /** Count of grounded transferable skills extracted */
  transferableSkillsCount: number;
  /** Embedding provider utilized (e.g. "local_ollama", "openai", "gemini", "jina") */
  provider: string;
  /** Embedding model name */
  model?: string;
  /** Total evaluation duration in milliseconds */
  latencyMs: number;
  /** Optional error detail if execution failed silently */
  error?: string | null;
}

/**
 * Emits structured side-by-side comparison telemetry between the legacy heuristic
 * match score and the embedded semantic crossover score.
 *
 * In development, renders a formatted 100-column ASCII terminal card.
 * In production, emits a compact structured JSON payload.
 *
 * @param params - Telemetry metrics for the shadow evaluation
 */
export function logShadowEvaluationTelemetry(
  params: ShadowEvaluationTelemetryParams
): void {
  const {
    opportunityId,
    title,
    company,
    heuristicScore,
    crossoverScore,
    transferableSkillsCount,
    provider,
    model,
    latencyMs,
    error,
  } = params;

  if (!isAsciiTableLoggingEnabled()) {
    console.info(
      JSON.stringify({
        scope: "ShadowEmbeddingTelemetry",
        opportunityId,
        company,
        title,
        heuristicScore,
        crossoverScore,
        transferableSkillsCount,
        provider,
        model,
        latencyMs,
        ...(error ? { error } : {}),
      })
    );
    return;
  }

  // Verbose card layout only when explicitly requested via LOG_SHADOW_CARDS=1
  if (process.env.LOG_SHADOW_CARDS === "1") {
    const modelTag = model
      ? ` [${truncate(provider, 15)}:${truncate(model, 25)}]`
      : ` [${truncate(provider, 20)}]`;
    const header =
      `┌─ SHADOW EMBEDDED EVALUATION${modelTag} `.padEnd(99, "─") + "┐";

    console.log(`\n${header}`);

    const targetLine = `Opportunity : ${truncate(company || "Unknown", 30)} — ${truncate(
      title || "Job",
      38
    )} (${truncate(opportunityId, 16)})`.padEnd(96);
    console.log(`│ ${targetLine} │`);

    if (error) {
      const errLine = `Status      : FAILED SILENTLY (${truncate(
        error,
        60
      )})`.padEnd(96);
      console.log(`│ ${errLine} │`);
      const latLine = `Latency     : ${latencyMs}ms (sync pipeline unblocked)`.padEnd(
        96
      );
      console.log(`│ ${latLine} │`);
    } else {
      const delta = crossoverScore - heuristicScore;
      const deltaSign = delta > 0 ? `+${delta}` : `${delta}`;
      const scoreLine = `Scores      : Heuristic: ${heuristicScore}% │ Embedded Crossover: ${crossoverScore}% (Δ ${deltaSign}%)`.padEnd(
        96
      );
      console.log(`│ ${scoreLine} │`);

      const skillsLine = `Skills      : ${transferableSkillsCount} transferable skills mapped │ Latency: ${latencyMs}ms`.padEnd(
        96
      );
      console.log(`│ ${skillsLine} │`);
    }

    console.log(`└${"─".repeat(98)}┘`);
    return;
  }

  // Compact Single-Line Telemetry (Default in Development - strictly <= 98 chars)
  if (error) {
    const errSuffix = `FAILED (${truncate(error, 30)}) (${latencyMs}ms)`;
    const maxTargetLen = Math.max(16, 96 - 19 - errSuffix.length - 2);
    const target = truncate(`${company || "Unknown"} — ${title || "Job"}`, maxTargetLen);
    const line = `  ├─ [Shadow Eval] ${target}: ${errSuffix}`;
    console.log(line.length > 98 ? line.slice(0, 98) : line);
  } else {
    const delta = crossoverScore - heuristicScore;
    const deltaSign = delta > 0 ? `+${delta}` : `${delta}`;
    const metrics = `Heur: ${heuristicScore}% │ Embed: ${crossoverScore}% (Δ ${deltaSign}%) │ ${transferableSkillsCount} skills (${latencyMs}ms)`;
    const maxTargetLen = Math.max(16, 96 - 19 - metrics.length - 2);
    const target = truncate(`${company || "Unknown"} — ${title || "Job"}`, maxTargetLen);
    const line = `  ├─ [Shadow Eval] ${target}: ${metrics}`;
    console.log(line.length > 98 ? line.slice(0, 98) : line);
  }
}
