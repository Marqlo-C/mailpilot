import type { gmail_v1 } from "googleapis";

import { cleanEmailPayload } from "@/lib/ai/email-cleaner";
import {
  classifyEmail,
  extractMessageBody,
  isOllamaCircuitTripped,
  shouldClassifyEmail,
  type LlmProvider,
} from "@/lib/llm";
import {
  type JobClassification,
  extractMessageHtml,
  isValidEmployerName,
  isValidRoleTitle,
  sanitizeRoleTitle,
} from "@/lib/llm/classification";
import {
  isJobLeadsEmail,
  parseJobLeadsDigest,
  recoverJobLeadsCompany,
} from "./jobleads";
import {
  extractSalaryFromText,
  normalizeSalaryDisplay,
  parseSalaryMax,
  sanitizeCompanyName,
  type CandidateProfileSummary,
} from "@/lib/ai/classifier";
import {
  initSyncBatchTelemetry,
  logCompactSyncCard,
  logStory,
  syncLog,
} from "@/lib/logging";
import {
  buildSynthesizedJobOverview,
  extractCleanSnippet,
  isUnspecifiedPostedAt,
  normalizePostedAt,
  relativeTimeToIso,
  resolveJobOpportunity,
  sanitizeJobDescription,
  scrapeJobPostingJsonLd,
  unwrapTrackingUrl,
} from "@/lib/opportunities/context";
import {
  extractMatchCandidateLens,
  evaluateOpportunityMatch,
} from "@/lib/matching";
import { JOB_BOARD_KEYWORDS } from "@/lib/constants/job-sources";
import { prisma } from "@/lib/core/prisma";
import { parseFromHeader, type ClassifiableAccount } from "@/lib/gmail/sync";
import type { parseAccountRules } from "@/lib/validations/rules";
import { withRateLimitRetry } from "./candidates";
import { persistSyncOpportunity } from "./dedupe";

/**
 * Shared per-domain schedule to space requests to the exact same host
 * across concurrent messages and digest loops, avoiding bursts or 429 rate limits.
 */
const nextAvailableByDomain = new Map<string, number>();
const SAME_DOMAIN_DELAY_MS = 250;
const LINK_HYDRATION_CONCURRENCY = 3;

function scheduleDomainSlot(
  domain: string,
  delayMs: number = SAME_DOMAIN_DELAY_MS
): number {
  const now = Date.now();
  if (nextAvailableByDomain.size > 200) {
    for (const [d, time] of nextAvailableByDomain.entries()) {
      if (time < now - 60000) {
        nextAvailableByDomain.delete(d);
      }
    }
  }
  const nextSlot = Math.max(now, nextAvailableByDomain.get(domain) ?? 0);
  nextAvailableByDomain.set(domain, nextSlot + delayMs);
  return nextSlot - now;
}

function normalizeProvider(value: string | null | undefined): LlmProvider {
  return value === "LOCAL_OLLAMA" ? "LOCAL_OLLAMA" : "OPENROUTER";
}

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string | undefined {
  return (
    headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ??
    undefined
  );
}

export type ProcessSyncMessageInput = {
  gmail: gmail_v1.Gmail;
  account: ClassifiableAccount;
  messageId: string;
  index: number;
  total: number;
  rules: ReturnType<typeof parseAccountRules>;
  candidateProfile: CandidateProfileSummary | null;
  ollamaDownForSync: boolean;
  syncStartedAt?: number;
};

export type ProcessSyncMessageResult = {
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  opportunitiesUpserted: number;
  tier: "OLLAMA" | "CLOUD" | "NONE";
  ollamaDownForSync: boolean;
  usedScrapingAnt?: boolean;
  parsedCount?: number;
};

export async function processSyncMessage(
  params: ProcessSyncMessageInput
): Promise<ProcessSyncMessageResult> {
  const {
    gmail,
    account,
    messageId,
    index,
    total,
    rules,
    candidateProfile,
    syncStartedAt,
  } = params;

  const effectiveSyncStartedAt = syncStartedAt ?? Date.now();
  if (index === 1) {
    initSyncBatchTelemetry({ startTime: effectiveSyncStartedAt });
  }

  let ollamaDownForSync = params.ollamaDownForSync;
  const accountId = account.id;

  let message: gmail_v1.Schema$Message;
  try {
    const res = await withRateLimitRetry(() =>
      gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full",
      })
    );
    message = res.data;
  } catch (fetchErr: unknown) {
    const is404 =
      (typeof fetchErr === "object" &&
        fetchErr !== null &&
        (("status" in fetchErr &&
          (fetchErr as { status?: number }).status === 404) ||
          ("code" in fetchErr &&
            (fetchErr as { code?: number }).code === 404))) ||
      (fetchErr instanceof Error &&
        fetchErr.message.toLowerCase().includes("notfound"));

    if (is404) {
      await prisma.emailMessage.updateMany({
        where: { accountId, messageId },
        data: {
          emailCategory: "IRRELEVANT",
          rawBody: null,
        },
      });

      logCompactSyncCard({
        index,
        total,
        subject: "(Message deleted or moved)",
        messageId,
        isJob: false,
        routing: [],
        skipReason: "Message not found in Gmail (404)",
        syncStartedAt: effectiveSyncStartedAt,
      });

      return {
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 1,
        opportunitiesUpserted: 0,
        tier: "NONE",
        ollamaDownForSync,
      };
    }
    throw fetchErr;
  }

  const headers = message.payload?.headers;
  const subject = getHeader(headers, "Subject") ?? "";
  const from = getHeader(headers, "From");
  const sender = from ? parseFromHeader(from) : null;
  const isJobLeads = isJobLeadsEmail(sender?.email, sender?.name, from);
  const fullRawBody = extractMessageBody(message.payload, isJobLeads);
  const rawHtml = isJobLeads ? extractMessageHtml(message.payload) : null;
  const cleanedText = cleanEmailPayload(
    (rawHtml || fullRawBody).trim().length > 0
      ? (rawHtml || fullRawBody)
      : message.snippet ?? subject
  );

  // Fast-path: Filter out promotional & marketing emails without LLM invocation
  if (
    !shouldClassifyEmail({
      subject,
      body: cleanedText,
      fromEmail: sender?.email ?? null,
    })
  ) {
    await prisma.emailMessage.updateMany({
      where: { accountId, messageId },
      data: {
        emailCategory: "IRRELEVANT",
        rawBody: null,
      },
    });

    logCompactSyncCard({
      index,
      total,
      subject,
      messageId,
      isJob: false,
      routing: [],
      skipReason: "Non-Job / Marketing or Newsletter",
      syncStartedAt: effectiveSyncStartedAt,
    });

    return {
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 1,
      opportunitiesUpserted: 0,
      tier: "NONE",
      ollamaDownForSync,
    };
  }

  const llmProvider = normalizeProvider(account.settings?.llmProvider);
  const configuredOllamaUrl = account.settings?.localOllamaUrl ?? "";

  let classification: JobClassification | null = null;

  // Direct Deterministic Parser for JobLeads: bypass LLM completely to prevent aggregator hallucinations
  if (isJobLeads && rawHtml) {
    const jobleadsResult = parseJobLeadsDigest(rawHtml, {
      subject,
      receivedAt: message.internalDate
        ? new Date(Number(message.internalDate))
        : new Date(),
    });
    if (jobleadsResult && jobleadsResult.jobs.length > 0) {
      classification = jobleadsResult;
    }
  }

  const shouldFastFailLocalOllama =
    !classification &&
    llmProvider === "LOCAL_OLLAMA" &&
    !rules.allowCloudFallback &&
    (ollamaDownForSync || isOllamaCircuitTripped(configuredOllamaUrl));

  if (!classification && !shouldFastFailLocalOllama) {
    try {
      classification = await classifyEmail({
        llmProvider,
        localOllamaUrl: account.settings?.localOllamaUrl,
        ollamaModel: account.settings?.ollamaModel,
        subject,
        body: cleanedText,
        fromEmail: sender?.email ?? null,
        fromName: sender?.name ?? null,
        candidateProfile,
        allowCloudFallback: rules.allowCloudFallback,
        accountId: account.id,
        accountRules: rules,
        receivedAt: message.internalDate
          ? new Date(Number(message.internalDate))
          : new Date(),
      });
    } catch (err) {
      syncLog.warn(
        { err, messageId },
        "AI classification failed — checking fallback options"
      );
      classification = null;
    }

    if (
      llmProvider === "LOCAL_OLLAMA" &&
      !rules.allowCloudFallback &&
      isOllamaCircuitTripped(configuredOllamaUrl) &&
      !ollamaDownForSync
    ) {
      ollamaDownForSync = true;
      logStory(
        syncLog,
        "Local Ollama detected offline during sync pass. Fast-parking remaining messages as PENDING_AI.",
        { url: configuredOllamaUrl },
        "warn"
      );
    }
  }

  const routingLines =
    classification?.routingLines && classification.routingLines.length > 0
      ? classification.routingLines
      : [
          llmProvider === "LOCAL_OLLAMA"
            ? shouldFastFailLocalOllama
              ? "Tier 1: LOCAL_OLLAMA -> BYPASSED (Circuit Open) [0ms]"
              : "Tier 1: LOCAL_OLLAMA -> FAILED"
            : "Tier 1: LOCAL_OLLAMA -> NOT CONFIGURED",
          rules.allowCloudFallback
            ? "Tier 2: CLOUD_BYOK   -> FAILED / SKIPPED"
            : "Tier 2: CLOUD_BYOK   -> DISABLED (allowCloudFallback=false)",
        ];

  let tier: "OLLAMA" | "CLOUD" | "NONE" = "NONE";
  if (classification?.sourceTier === "TIER 1 (OLLAMA)") {
    tier = "OLLAMA";
  } else if (classification?.sourceTier === "TIER 2 (CLOUD)") {
    tier = "CLOUD";
  } else if (classification?.classificationMethod === "HEURISTIC") {
    tier = "NONE";
  } else if (classification) {
    tier = llmProvider === "LOCAL_OLLAMA" ? "OLLAMA" : "CLOUD";
  }

  if (
    !classification ||
    !classification.is_job_related ||
    !classification.jobs ||
    classification.jobs.length === 0 ||
    classification.email_category === "IRRELEVANT"
  ) {
    let skipReason = "Non-Job / Marketing or Newsletter";

    if (classification) {
      // Evaluated and confirmed not a job -> clear from PENDING_AI
      await prisma.emailMessage.updateMany({
        where: { accountId, messageId },
        data: {
          emailCategory: "IRRELEVANT",
          rawBody: null,
        },
      });
      skipReason = "Confirmed Non-Job / IRRELEVANT";
    } else {
      // Both Ollama and Cloud were unavailable or rate-limited -> park as PENDING_AI
      const threadId = message.threadId ?? messageId;
      const emailDate = message.internalDate
        ? new Date(Number(message.internalDate))
        : new Date();

      await prisma.emailMessage.upsert({
        where: {
          accountId_messageId: {
            accountId,
            messageId,
          },
        },
        create: {
          accountId,
          messageId,
          threadId,
          subject,
          fromEmail: sender?.email ?? null,
          fromName: sender?.name ?? null,
          emailCategory: "PENDING_AI",
          emailDate,
          snippet: extractCleanSnippet(cleanedText, 500, 1500, {
            roleTitle: subject,
            company: sender?.name ?? undefined,
          }),
          rawBody: null,
        },
        update: {
          emailCategory: "PENDING_AI",
          snippet: extractCleanSnippet(cleanedText, 500, 1500, {
            roleTitle: subject,
            company: sender?.name ?? undefined,
          }),
          rawBody: null,
        },
      });
      skipReason = "Parked as PENDING_AI (Model Unavailable)";
    }

    logCompactSyncCard({
      index,
      total,
      subject,
      messageId,
      isJob: false,
      routing: routingLines,
      skipReason,
      syncStartedAt: effectiveSyncStartedAt,
    });

    // Keep heartbeat fresh so background sync lock never becomes stale during skips/parking
    try {
      await prisma.account.update({
        where: { id: accountId },
        data: { syncHeartbeatAt: new Date() },
      });
    } catch {
      // Non-fatal heartbeat update
    }

    return {
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 1,
      opportunitiesUpserted: 0,
      tier,
      ollamaDownForSync,
    };
  }

  const threadId = message.threadId ?? messageId;
  const emailDate = message.internalDate
    ? new Date(Number(message.internalDate))
    : new Date();

  // Root level aggregator debiasing (Prevents StudySmarter/Vaia bleed)
  if (/studysmarter|vaia|jobleads/i.test(classification.company_name || "")) {
    classification.company_name = "Unknown Company";
  }

  for (const job of classification.jobs) {
    // 1. Validate and unwrap URLs (Fixes Localhost 404s)
    if (job.applyUrl) {
      const unwrapped = unwrapTrackingUrl(job.applyUrl);
      job.applyUrl = unwrapped && /^https?:\/\//i.test(unwrapped) ? unwrapped : null;
    }

    // 2. JobLeads & Aggregator Garbage Scrubbing
    const companyNoSpace = (job.company || "").replace(/\s+/g, "").toLowerCase();
    if (
      companyNoSpace.includes("basedonyour") ||
      companyNoSpace.includes("savedsearch") ||
      companyNoSpace.includes("jobalert") ||
      companyNoSpace.includes("toppicks") ||
      companyNoSpace === "jobleads" ||
      companyNoSpace === "jobleadsgmbh"
    ) {
      const recovered =
        rawHtml && job.title ? recoverJobLeadsCompany(job.title, rawHtml) : null;
      job.company = recovered || "Unknown Company";
    }

    if (job.title) {
      job.title = sanitizeRoleTitle(job.title);
    }

    // 3. StudySmarter / Vaia Aggregator De-biasing
    if (/studysmarter|vaia/i.test(job.company || "")) {
      const match = job.title?.match(/\(([^)]+)\)$/);
      if (match && match[1] && !/m\/f\/d|remote|hybrid|part.?time|full.?time/i.test(match[1])) {
        job.company = match[1].trim();
        job.title = job.title!.replace(/\([^)]+\)$/, "").trim();
      } else {
        job.company = sender?.name || "StudySmarter";
      }
    }

    job.company = sanitizeCompanyName(job.company);

    if (job.salary) {
      job.salary = normalizeSalaryDisplay(job.salary);
      if (job.salary && typeof job.salaryMax !== "number") {
        job.salaryMax = parseSalaryMax(job.salary);
      }
    }

    if (job.postedAt) {
      job.postedAt =
        relativeTimeToIso(job.postedAt, emailDate) ??
        normalizePostedAt(job.postedAt, null, emailDate);
    }

    // 4. Pre-scrub descriptions BEFORE database persistence
    const fallbackContext = {
      roleTitle: job.title,
      company: job.company,
      location: job.location,
      salary: job.salary,
    };
    const scrubbed = sanitizeJobDescription(job.description || "", 4000, fallbackContext);
    
    // Force DB to hold the clean synthesized string if it was just an alert banner
    job.description = scrubbed || buildSynthesizedJobOverview(fallbackContext);
  }

  // Evaluate inbound jobs (both rich specs and minimal leads via deterministic matching)
  if (candidateProfile) {
    const candidateLens = extractMatchCandidateLens(
      candidateProfile,
      candidateProfile.persona
    );
    for (const job of classification.jobs) {
      if (
        !job.matchScore ||
        job.matchScore === 0 ||
        /company are not directly related/i.test(job.matchReason || "") ||
        /digest recommendation/i.test(job.matchReason || "")
      ) {
        const normalized = resolveJobOpportunity({
          company: job.company,
          title: job.title,
          description: job.description,
          location: job.location,
          salary: job.salary,
          postedAt: job.postedAt,
          applyUrl: job.applyUrl,
        });
        const evaluated = evaluateOpportunityMatch({
          opportunity: normalized,
          candidate: candidateLens,
          mode: "HEURISTIC",
        });
        job.matchScore = evaluated.score;
        job.matchReason = evaluated.reason;
      }
    }
  } else {
    for (const job of classification.jobs) {
      if (!job.matchScore || job.matchScore === 0) {
        job.matchScore = 75;
        job.matchReason = "Lead identified from inbox.";
      }
    }
  }

  // Link Parser Enrichment: hydrate thin jobs (< 300 chars) via public JSON-LD in parallel pools
  const thinJobs = classification.jobs.filter(
    (job) =>
      (!job.description || job.description.length < 300) &&
      Boolean(job.applyUrl && /^https?:\/\//i.test(job.applyUrl))
  );

  const enrichedUrls = new Set<string>();
  let usedScrapingAnt = false;
  let parsedCount = 0;

  if (thinJobs.length > 0) {
    // 1. Deduplicate by applyUrl so identical cards in multi-job digests don't bleed into each other
    const uniqueThinJobs: typeof thinJobs = [];
    for (const job of thinJobs) {
      if (!job.applyUrl || enrichedUrls.has(job.applyUrl)) {
        continue;
      }
      enrichedUrls.add(job.applyUrl);
      uniqueThinJobs.push(job);
    }

    // 2. Per-domain rate limit tracking: space requests to the exact same domain by 250ms
    async function enrichJob(job: (typeof thinJobs)[number]) {
      let domain = "default";
      try {
        domain = new URL(job.applyUrl!).hostname.toLowerCase();
      } catch {
        domain = "default";
      }

      // Schedule next available slot for this domain across concurrent workers
      const waitMs = scheduleDomainSlot(domain, SAME_DOMAIN_DELAY_MS);
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }

      try {
        const { data: enriched, telemetry } = await scrapeJobPostingJsonLd(
          job.applyUrl!,
          rules
        );
        if (telemetry.includes("ScrapingAnt")) {
          usedScrapingAnt = true;
        }

        if (enriched) {
          if (enriched.logoUrl && /^https?:\/\//i.test(enriched.logoUrl)) {
            job.logoUrl = enriched.logoUrl;
          }
          if (!enriched.salary && enriched.description) {
            const extracted = extractSalaryFromText(enriched.description);
            if (extracted) {
              enriched.salary = extracted;
            }
          }
          if (enriched.salary && (!job.salary || !normalizeSalaryDisplay(job.salary))) {
            job.salary = normalizeSalaryDisplay(enriched.salary);
          }
          if (job.salary && typeof job.salaryMax !== "number") {
            job.salaryMax = parseSalaryMax(job.salary);
          }

          if (
            enriched.description &&
            enriched.description.length > (job.description?.length ?? 0)
          ) {
            const fallbackContext = {
              roleTitle: job.title,
              company: job.company,
              location: job.location,
              salary: job.salary,
            };
            const scrubbed = sanitizeJobDescription(enriched.description, 4000, fallbackContext);
            job.description = scrubbed || buildSynthesizedJobOverview(fallbackContext);
          }
          if (enriched.applyUrl && /^https?:\/\//i.test(enriched.applyUrl)) {
            job.applyUrl = enriched.applyUrl;
          }
          const isGarbageCompany =
            !job.company ||
            job.company === "Unknown Company" ||
            !isValidEmployerName(job.company) ||
            JOB_BOARD_KEYWORDS.some((kw) => (job.company || "").toLowerCase().includes(kw));

          // In digests, ALWAYS OVERWRITE aggregator names with the real scraped company
          if (
            enriched.company &&
            isValidEmployerName(enriched.company) &&
            isGarbageCompany
          ) {
            job.company = sanitizeCompanyName(enriched.company);
          }

          const isGarbageTitle =
            !job.title ||
            job.title === "Role" ||
            !isValidRoleTitle(job.title);

          if (
            enriched.title &&
            isValidRoleTitle(enriched.title) &&
            isGarbageTitle
          ) {
            job.title = sanitizeRoleTitle(enriched.title);
          }

          if (
            enriched.location &&
            (!job.location ||
             /unspecified/i.test(job.location) ||
             /^\d{5}(?:-\d{4})?$/.test(job.location.trim()))
          ) {
            job.location = enriched.location;
          }
          if ((!job.salary || !normalizeSalaryDisplay(job.salary)) && job.description) {
            const extracted = extractSalaryFromText(job.description);
            if (extracted) {
              job.salary = extracted;
            }
          }
          if (job.salary && typeof job.salaryMax !== "number") {
            job.salaryMax = parseSalaryMax(job.salary);
          }

          if (isUnspecifiedPostedAt(job.postedAt)) {
            const backfilledPostedAt =
              relativeTimeToIso(enriched.datePosted, emailDate) ??
              normalizePostedAt(
                enriched.datePosted,
                enriched.description || job.description,
                emailDate
              );
            if (backfilledPostedAt) {
              job.postedAt = backfilledPostedAt;
            } else {
              job.postedAt = null;
            }
          } else {
            job.postedAt =
              relativeTimeToIso(job.postedAt, emailDate) ??
              normalizePostedAt(job.postedAt, null, emailDate);
          }

          // Recalculate matchScore and matchReason with the newly hydrated rich spec
          if (candidateProfile && job.description && job.description.length >= 300) {
            const candidateLens = extractMatchCandidateLens(
              candidateProfile,
              candidateProfile.persona
            );
            const normalized = resolveJobOpportunity({
              company: job.company,
              title: job.title,
              description: job.description,
              location: job.location,
              salary: job.salary,
              postedAt: job.postedAt,
              applyUrl: job.applyUrl,
            });
            const evaluated = evaluateOpportunityMatch({
              opportunity: normalized,
              candidate: candidateLens,
              mode: "HEURISTIC",
            });
            job.matchScore = evaluated.score;
            job.matchReason = evaluated.reason;
            job.classificationMethod = "HEURISTIC";
          }
        }

        const targetLabel = (
          job.company && job.company !== "Unknown Company"
            ? job.company
            : job.title || "Job"
        ).slice(0, 28);

        let outcome = telemetry;
        if (outcome.includes("409") || outcome.includes("423") || outcome.includes("concurrency") || outcome.includes("Concurrency")) {
          outcome = "Skipped (ScrapingAnt: Concurrency Limit)";
        } else if (outcome.includes("ScrapingAnt (BYOK Key)")) {
          const chars = Math.min(enriched?.description?.length ?? 0, 4000);
          outcome = `ScrapingAnt (${(chars / 1000).toFixed(1)}k)`;
        } else if (outcome.includes("LinkedIn Guest API")) {
          const chars = Math.min(enriched?.description?.length ?? 0, 4000);
          outcome = `LinkedIn Guest API (${(chars / 1000).toFixed(1)}k)`;
        } else if (outcome.includes("Direct HTML")) {
          const chars = Math.min(enriched?.description?.length ?? 0, 4000);
          outcome = `Direct HTML (${(chars / 1000).toFixed(1)}k)`;
        } else if (outcome.includes("Nuxt SSR State")) {
          const chars = Math.min(enriched?.description?.length ?? 0, 4000);
          outcome = `Nuxt SSR State (${(chars / 1000).toFixed(1)}k)`;
        } else if (outcome.includes("JSON-LD")) {
          const chars = Math.min(enriched?.description?.length ?? 0, 4000);
          outcome = `JSON-LD (${(chars / 1000).toFixed(1)}k)`;
        } else if (outcome.includes("Glassdoor")) {
          outcome = "Deferred (Glassdoor On-Demand)";
        } else if (outcome.includes("Indeed")) {
          outcome = "Deferred (Indeed On-Demand)";
        }

        if (
          enriched?.description &&
          enriched.description.length >= 300 &&
          !outcome.includes("Deferred") &&
          !outcome.includes("Skipped")
        ) {
          parsedCount += 1;
        }

        const logLine = `  ├─ [LinkParser] ${targetLabel} -> ${outcome}`;
        console.log(logLine.length > 90 ? `${logLine.slice(0, 87)}...` : logLine);
      } catch {
        const targetLabel = (
          job.company && job.company !== "Unknown Company"
            ? job.company
            : job.title || "Job"
        ).slice(0, 28);
        const logLine = `  ├─ [LinkParser] ${targetLabel} -> Skipped (Network Error)`;
        console.log(logLine.length > 90 ? `${logLine.slice(0, 87)}...` : logLine);
      }
    }

    // 3. Run bounded concurrency pool (up to 3 concurrent requests)
    const executing = new Set<Promise<void>>();
    for (const job of uniqueThinJobs) {
      const p: Promise<void> = enrichJob(job).finally(() => {
        executing.delete(p);
      });
      executing.add(p);
      if (executing.size >= LINK_HYDRATION_CONCURRENCY) {
        await Promise.race(executing);
      }
    }
    await Promise.all(executing);
  }

  const dedupeResult = await persistSyncOpportunity({
    gmail,
    account,
    messageId,
    threadId,
    subject,
    cleanedText,
    sender,
    emailDate,
    classification: {
      ...classification,
      routingLines: classification.routingLines ?? routingLines,
    },
    rules,
    classificationMethod: (classification.classificationMethod as "AI" | "HEURISTIC" | "HYBRID") ?? "AI",
    index,
    total,
    syncStartedAt: effectiveSyncStartedAt,
  });

  return {
    createdCount: dedupeResult.createdCount,
    updatedCount: dedupeResult.updatedCount,
    skippedCount: 0,
    opportunitiesUpserted: dedupeResult.opportunitiesUpserted,
    tier,
    ollamaDownForSync,
    usedScrapingAnt,
    parsedCount,
  };
}
