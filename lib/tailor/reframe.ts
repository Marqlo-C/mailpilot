import { z } from "zod";
import { callLLMWithFallback } from "@/lib/llm";
import type { TailorOptions } from "./schema.ssot";

export function buildReframeSystemPrompt(
  optionsOrInventMetrics:
    | boolean
    | {
        inventMetrics?: boolean;
        seniorityTier?: string;
      } = {}
): string {
  const options =
    typeof optionsOrInventMetrics === "boolean"
      ? { inventMetrics: optionsOrInventMetrics }
      : optionsOrInventMetrics;
  const inventMetrics = options.inventMetrics === true;

  const metricDirective = inventMetrics
    ? `METRIC SYNTHESIS PERMITTED (UNIVERSAL 4-DIMENSIONAL TAXONOMY):
- If a source bullet lacks concrete metrics, you MAY synthesize a modest, plausible metric calibrated strictly to the candidate's verified leveling (${options.seniorityTier || "Mid-Level Professional"}).
- Synthesized metrics MUST adapt directly to the NATIVE DISCIPLINE of that specific bullet across the 4 universal impact dimensions:
  1. Efficiency & Velocity: Turnaround time reduction (~10–20%), process cycle time speedup, queue clearing.
  2. Quality & Accuracy: Compliance rates (e.g., 98%+ verification accuracy), error rate reduction, protocol adherence.
  3. Volume & Throughput: Items/records/tickets/cases processed, stakeholders or units coordinated, asset volume handled.
  4. Satisfaction & Adoption: User/client/stakeholder feedback scores, workflow adoption rate, retention/renewal stability.
- STRICT DOMAIN DISCIPLINE: Never inject software/code tools, tech jargon, or foreign domain concepts into non-technical or legacy roles (e.g., never assign coding or cloud metrics to an administrative, logistical, or client-facing bullet).
- MODESTY & SENIORITY BAR: Keep synthesized metrics modest and realistic. NEVER invent massive corporate revenue, multi-million-dollar numbers, enterprise-scale claims, or unrealistic executive impact.`
    : `METRIC INTEGRITY (STRICT - NO INVENTED NUMBERS):
- If the source bullet already has numbers, latencies, percentages, or scale, NEVER change or overwrite those metrics. Refine sentence flow, action verbs, and Google XYZ structure while keeping all verified figures intact.
- If a source bullet has NO metrics, do NOT invent any numbers, percentages, or dollar amounts. Instead, emphasize qualitative execution scope, problem-solving impact, and procedural rigor. You MUST STILL RESTRUCTURE the bullet into the Google XYZ pattern ([Strong Action Verb] + [Outcome / Verified Impact] + [Method / Tooling]) using verified facts from the source text. NEVER leave the bullet un-reframed.`;

  return `You are an expert resume editor specializing in the Google XYZ resume framework. Reframe EVERY chosen bullet to highlight alignment with the target role description.

GOOGLE XYZ FRAMEWORK:
1. Follow Google's core XYZ structural formula for approximately 60%–70% of bullets:
   [Strong Action Verb] + [Quantifiable Impact / Scope / Metric] + [Method / Technical Approach]
   ("Accomplished [X] as measured by [Y] by doing [Z]").
   - STRUCTURAL PATTERN OVER RIGID TAGS: Do NOT force awkward literal template tags like "as measured by" or "by doing" unless they read naturally. Outcome-driven, fluid phrasing following Action + Metric + Method is strongly preferred.
2. For qualitative bullets (or when metric synthesis is disabled), apply the same structural XYZ pattern:
   [Strong Action Verb] + [Outcome / Verified Impact] + [Method / Tooling]
   DO NOT leave any bullet untouched or in raw source form. Every bullet must be actively restructured into the XYZ pattern.

${metricDirective}

FUNCTIONAL CROSSOVER & GROUND TRUTH:
- For bullets from earlier or cross-discipline roles, apply framing agility to highlight universal operational strengths (workflow orchestration, process automation, data accuracy, SLA/deadline adherence, troubleshooting, risk mitigation, and cross-functional delivery).
- UNBENDING GROUND TRUTH: Never invent tools, languages, platforms, certifications, systems, or responsibilities absent from the source bullet.

STRICT CONSTRAINTS:
1. TRUTH PRESERVATION: Never change or overwrite existing numbers, metrics, or substantiated tools from the source text.
2. ACTION-ORIENTED: Start each bullet with a strong action verb matching the candidate's verified level.
3. NO DUPLICATES & 1:1 MAPPING: Maintain a strict 1:1 mapping with the input bullet IDs. Every input ID must appear in reframedBullets with its reframed text.
4. LENGTH: Keep each bullet concise, between 16 and 34 words.

Return ONLY valid JSON:
{ "reframedBullets": [{ "id": string, "rawText": string }] }`;
}

export const REFRAME_SYSTEM_PROMPT = buildReframeSystemPrompt({});

export const bulletItemSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform((val) => String(val)),
    rawText: z.string().optional(),
    text: z.string().optional(),
    bullet: z.string().optional(),
    content: z.string().optional(),
  })
  .transform((val) => ({
    id: val.id,
    rawText: (val.rawText ?? val.text ?? val.bullet ?? val.content ?? "").trim(),
  }));

export const reframeSchema = z.union([
  z.object({
    reframedBullets: z.array(bulletItemSchema),
  }),
  z.object({
    bullets: z.array(bulletItemSchema),
  }).transform((val) => ({ reframedBullets: val.bullets })),
  z.object({
    reframed_bullets: z.array(bulletItemSchema),
  }).transform((val) => ({ reframedBullets: val.reframed_bullets })),
  z.object({
    items: z.array(bulletItemSchema),
  }).transform((val) => ({ reframedBullets: val.items })),
]);

export interface BulletToReframe {
  id: string;
  rawText: string;
  kind: "experience" | "project";
  role?: string;
  company?: string;
  projectName?: string;
}

/** Strips conversational small-model artifacts such as 'Reframed as: "..."' or wrapping quotes. */
export function sanitizeReframedBulletText(text: string): string {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^(?:Reframed(?:\s+as)?|XYZ(?:\s+bullet)?|Bullet(?:\s+\d+)?)\s*:\s*/i, "");
  cleaned = cleaned.replace(/^["'“]([\s\S]*)["'”]$/, "$1").trim();
  cleaned = cleaned.replace(/^(?:Reframed(?:\s+as)?|XYZ(?:\s+bullet)?|Bullet(?:\s+\d+)?)\s*:\s*/i, "").trim();
  return cleaned;
}

/**
 * Re-frames surviving bullets using Google XYZ structure with 1:1 ID tracking.
 */
export async function executeBulletReframe(input: {
  bullets: BulletToReframe[];
  companyName?: string | null;
  roleTitle?: string | null;
  jobText?: string | null;
  jobRequirements?: string[];
  inventMetrics?: boolean;
  seniorityTier?: string;
  options?: TailorOptions;
}): Promise<Map<string, string>> {
  const { bullets, options } = input;
  const reframedMap = new Map<string, string>();

  if (bullets.length === 0) return reframedMap;

  const stageBUserPrompt = JSON.stringify({
    employer: {
      companyName: input.companyName ?? null,
      roleTitle: input.roleTitle ?? null,
    },
    jobText: input.jobText?.slice(0, 1500) ?? null,
    jobRequirements: (input.jobRequirements || []).slice(0, 12),
    bullets,
  });

  try {
    const rawResult = await callLLMWithFallback({
      systemPrompt: buildReframeSystemPrompt({
        inventMetrics: input.inventMetrics ?? false,
        seniorityTier: input.seniorityTier,
      }),
      userPrompt: stageBUserPrompt,
      llmProvider: options?.llmProvider ?? "OPENROUTER",
      localOllamaUrl: options?.localOllamaUrl,
      ollamaModel: options?.ollamaModel,
      devModelOverride: options?.devModelOverride,
      allowCloudFallback: options?.allowCloudFallback,
      accountId: options?.accountId,
      accountRules: options?.accountRules,
      ollamaOptions: { temperature: 0.35 },
    });

    if (rawResult) {
      const parsed = reframeSchema.safeParse(rawResult);
      if (parsed.success) {
        parsed.data.reframedBullets.forEach((b) => {
          const text = sanitizeReframedBulletText(b.rawText);
          if (text) {
            reframedMap.set(b.id.trim(), text);
            reframedMap.set(b.id.trim().toLowerCase(), text);
          }
        });

        // 1:1 index alignment fallback if counts match exactly
        if (parsed.data.reframedBullets.length === bullets.length) {
          bullets.forEach((orig, idx) => {
            const raw = parsed.data.reframedBullets[idx]?.rawText;
            const text = raw ? sanitizeReframedBulletText(raw) : "";
            if (text && !reframedMap.has(orig.id)) {
              reframedMap.set(orig.id, text);
            }
          });
        }
      }
    }
  } catch (err) {
    console.warn(
      "[Reframe] Stage B reframe failed, retaining original text:",
      err instanceof Error ? err.message : String(err)
    );
  }

  return reframedMap;
}
