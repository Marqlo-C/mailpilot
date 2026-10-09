import type { gmail_v1 } from "googleapis";
import type { Account, AccountSettings, JobOpportunity } from "@prisma/client";
import { GaxiosError } from "gaxios";

import {
  getGmailClientForAccount,
  registerInboxWatch,
  rethrowIfInsufficientScope,
} from "@/lib/google";
import { cleanEmailPayload } from "@/lib/ai/email-cleaner";
import {
  classifyJobEmail,
  extractMessageBody,
  loadCandidateProfileSummary,
  sanitizeEmailBody,
  shouldClassifyEmail,
  type LlmProvider,
} from "@/lib/llm";
import {
  ensurePersistentProfileForAccount,
  mergeRulesWithPermanentSettings,
} from "@/lib/persistent-profile";
import { resolveApplicationType } from "@/lib/application-method";
import {
  getCompanyLogoUrl,
  inferDomainFromUrl,
} from "@/lib/company-logo";
import {
  genericRoleTitle,
  isGenericTitle,
  parseApplicationEmail,
} from "@/lib/parsers/application-parser";
import { prisma } from "@/lib/prisma";
import { parseListUnsubscribeHeaders } from "@/lib/unsubscribe";
import { dedupeLog, logStory, syncLog } from "@/lib/logging";
import { isLocationCompatible } from "@/lib/utils/location";
import {
  parseAccountRules,
  titleMatchesExcluded,
  type AccountRules,
} from "@/lib/validations/rules";

/** Normalize role titles for fuzzy equality (strip Jr/Sr/II noise). */
function normalizeOpportunityTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\b(jr\.?|sr\.?|ii|iii|iv)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function opportunityTitlesMatch(a: string, b: string): boolean {
  const na = normalizeOpportunityTitle(a);
  const nb = normalizeOpportunityTitle(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function applyUrlsMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (!a?.trim() || !b?.trim()) return false;
  const na = a.trim().replace(/\/+$/, "");
  const nb = b.trim().replace(/\/+$/, "");
  return na.length > 0 && na === nb;
}

function isSuppressedOpportunity(row: JobOpportunity): boolean {
  if (row.status === "DISMISSED") return true;
  // User-archived (history) — do not resurrect via ingest.
  if (row.isArchived && row.previousStatus != null) return true;
  return false;
}

function isActiveOpportunityStatus(status: string): boolean {
  return (
    status === "DISCOVERED" ||
    status === "REVIEW_READY" ||
    status === "APPLIED" ||
    status === "LEAD"
  );
}

/**
 * Multi-tier opportunity dedupe before create:
 * 1) Same emailMessageId — applyUrl, else title + location
 * 2) Cross-email company + title + location (suppress dismissed/archived)
 * 3) null → caller inserts
 */
async function findMatchingOpportunity(input: {
  accountId: string;
  emailMessageId: string;
  company: string;
  title: string;
  location: string | null | undefined;
  applyUrl: string | null | undefined;
  isAlreadyApplied: boolean;
}): Promise<
  | { kind: "update"; row: JobOpportunity; upgradingPlaceholder: boolean }
  | { kind: "suppress"; row: JobOpportunity }
  | { kind: "none" }
> {
  const {
    accountId,
    emailMessageId,
    company,
    title,
    location,
    applyUrl,
    isAlreadyApplied,
  } = input;

  // ── Tier 1: same-email origin ───────────────────────────────────────────
  const sameEmailRows = await prisma.jobOpportunity.findMany({
    where: { accountId, emailMessageId },
  });

  const tier1 =
    sameEmailRows.find((row) => applyUrlsMatch(applyUrl, row.applyUrl)) ??
    sameEmailRows.find(
      (row) =>
        opportunityTitlesMatch(title, row.title) &&
        isLocationCompatible(location, row.location)
    );

  if (tier1) {
    const viaUrl = applyUrlsMatch(applyUrl, tier1.applyUrl);
    if (isSuppressedOpportunity(tier1)) {
      logStory(dedupeLog, "Tier 1 — same email, but left alone (dismissed/archived)", {
        company,
        title,
        "matched via": viaUrl ? "apply URL" : "title + location",
        "existing id": tier1.id,
      });
      return { kind: "suppress", row: tier1 };
    }
    logStory(dedupeLog, "Tier 1 — same email → update existing row", {
      company,
      title,
      "matched via": viaUrl ? "apply URL" : "title + location",
      "existing id": tier1.id,
    });
    return { kind: "update", row: tier1, upgradingPlaceholder: false };
  }

  // ── Tier 2: cross-email company + role + location ───────────────────────
  const companyRows = await prisma.jobOpportunity.findMany({
    where: {
      accountId,
      company: { equals: company, mode: "insensitive" },
    },
    orderBy: { receivedAt: "desc" },
  });

  let upgradingPlaceholder = false;
  let tier2 =
    companyRows.find(
      (row) =>
        opportunityTitlesMatch(title, row.title) &&
        isLocationCompatible(location, row.location)
    ) ?? null;

  // Upgrade generic placeholders when an applied confirmation carries a real title.
  if (
    !tier2 &&
    isAlreadyApplied &&
    !isGenericTitle(title, company)
  ) {
    const placeholder = companyRows.find(
      (row) =>
        isLocationCompatible(location, row.location) &&
        (isGenericTitle(row.title, company) ||
          row.title.toLowerCase() === "applied position" ||
          row.title.toLowerCase() === "applicant" ||
          row.title.toLowerCase() === genericRoleTitle(company).toLowerCase())
    );
    if (placeholder) {
      tier2 = placeholder;
      upgradingPlaceholder = true;
    }
  }

  if (tier2) {
    if (isSuppressedOpportunity(tier2)) {
      logStory(
        dedupeLog,
        "Tier 2 — same company/role/location, but left alone (dismissed/archived)",
        {
          company,
          title,
          location: location ?? "(none)",
          "existing id": tier2.id,
          status: tier2.status,
        }
      );
      return { kind: "suppress", row: tier2 };
    }
    if (isActiveOpportunityStatus(tier2.status) || !tier2.isArchived) {
      logStory(
        dedupeLog,
        "Tier 2 — cross-email company + title + location → update",
        {
          company,
          title,
          location: location ?? "(none)",
          "placeholder upgrade": upgradingPlaceholder ? "yes" : "no",
          "existing id": tier2.id,
        }
      );
      return { kind: "update", row: tier2, upgradingPlaceholder };
    }
    logStory(dedupeLog, "Tier 2 — matched but suppressed (not an active row)", {
      company,
      title,
      "existing id": tier2.id,
      status: tier2.status,
    });
    return { kind: "suppress", row: tier2 };
  }

  logStory(dedupeLog, "Tier 3 — no match → create new opportunity", {
    company,
    title,
    location: location ?? "(none)",
  });
  return { kind: "none" };
}

/**
 * Resolve account rules for ingestion (automation knobs from PermanentSettings).
 * Match threshold is not part of rules — use resolveMatchThreshold separately.
 */
export async function resolveIngestionRules(
  accountId: string,
  settingsRules: unknown
): Promise<AccountRules> {
  const accountRules = parseAccountRules(settingsRules);
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { id: true, email: true, persistentProfileId: true },
  });

  if (!account) return accountRules;

  const durable = await ensurePersistentProfileForAccount(account);
  return mergeRulesWithPermanentSettings(
    accountRules,
    durable.permanentSettings
  );
}

type SenderInfo = {
  name: string | null;
  email: string;
};

type AccountWithSettings = Account & {
  settings: AccountSettings | null;
};

/** Minimal account shape accepted by persistClassifiedEmail (webhook + historical scan). */
export type ClassifiableAccount = {
  id: string;
  email: string;
  persistentProfileId: string | null;
  settings: {
    llmProvider: string;
    localOllamaUrl: string | null;
    ollamaModel: string | null;
    rules: unknown;
  } | null;
};

/**
 * Result of a Gmail History API delta pass.
 *
 * NOTE: This advances `historyId` only. It does **not** stamp `lastSyncedAt`.
 * Sync Inbox owns `lastSyncedAt` (snapshot `runStartedAt` committed after the
 * full delta + job-query + PENDING_AI pass). See README "Inbox sync pipeline".
 */
export type InboxDeltaResult = {
  /** Message ids digested during this delta (empty when history expired). */
  messageIds: string[];
  /** True when startHistoryId was too old (Gmail 404) and the watch was renewed. */
  historyExpired: boolean;
  /** Watermark written to Account.historyId, if any. */
  historyId: string | null;
};

/**
 * Processes Gmail history deltas for an account:
 * fetches newly added messages, parses RFC 8058 headers, upserts Subscriptions,
 * runs job classification + rejection actions, and advances `historyId`.
 *
 * Does not update `lastSyncedAt` — callers that own the job-query watermark
 * (Sync Inbox) commit that after the full pipeline finishes.
 */
export async function processInboxDelta(
  emailAddress: string,
  notificationHistoryId: string
): Promise<InboxDeltaResult> {
  const account = await prisma.account.findUnique({
    where: { email: emailAddress },
    include: { settings: true },
  });

  if (!account || !account.isActive || !account.encryptedAccess) {
    logStory(
      syncLog,
      "Delta skipped — account inactive or credentials missing",
      { mailbox: emailAddress },
      "warn"
    );
    return { messageIds: [], historyExpired: false, historyId: null };
  }

  const gmail = await getGmailClientForAccount(account);
  const startHistoryId = account.historyId ?? notificationHistoryId;

  logStory(syncLog, "Step 1/4 — History delta", {
    mailbox: emailAddress,
    "starting from historyId": startHistoryId,
    note: "asking Gmail: what changed since this tip?",
  });

  let latestHistoryId = notificationHistoryId;
  let messageIds: string[] = [];
  let historyExpired = false;

  try {
    messageIds = await collectAddedMessageIds(gmail, startHistoryId);
    logStory(
      syncLog,
      messageIds.length === 0
        ? "Delta found 0 new message(s) to digest (inbox quiet since last tip)."
        : `Delta found ${messageIds.length} new message(s) to digest — processing subscriptions + classification…`
    );

    for (const messageId of messageIds) {
      try {
        await processMessage(gmail, account, messageId);
      } catch (error) {
        syncLog.error(
          { err: error, messageId, emailAddress },
          "Failed to process message during delta"
        );
      }
    }

    const profile = await gmail.users.getProfile({ userId: "me" });
    if (profile.data.historyId) {
      latestHistoryId = String(profile.data.historyId);
    }
  } catch (error) {
    if (isHistoryExpiredError(error)) {
      // History store no longer has startHistoryId — renew watch and signal
      // callers to use a wider lookback (gap cannot be replayed via History API).
      logStory(
        syncLog,
        "History tip expired (Gmail 404). Renewing watch; Sync Inbox will use a wider time lookback. Gap cannot be replayed via History API.",
        { mailbox: emailAddress },
        "warn"
      );
      const watch = await registerInboxWatch(gmail);
      latestHistoryId = watch.historyId;
      historyExpired = true;
      messageIds = [];
    } else {
      throw error;
    }
  }

  await prisma.account.update({
    where: { id: account.id },
    data: {
      historyId: latestHistoryId,
    },
  });

  logStory(syncLog, "Delta done", {
    digested: `${messageIds.length} message(s)`,
    "historyId advanced to": latestHistoryId,
    lastSyncedAt: "not touched (Sync Inbox owns that watermark)",
  });

  return {
    messageIds,
    historyExpired,
    historyId: latestHistoryId,
  };
}

async function collectAddedMessageIds(
  gmail: gmail_v1.Gmail,
  startHistoryId: string
): Promise<string[]> {
  const ids = new Set<string>();
  let pageToken: string | undefined;

  do {
    const response = await gmail.users.history.list({
      userId: "me",
      startHistoryId,
      historyTypes: ["messageAdded"],
      labelId: "INBOX",
      pageToken,
    });

    for (const record of response.data.history ?? []) {
      for (const added of record.messagesAdded ?? []) {
        if (added.message?.id) {
          ids.add(added.message.id);
        }
      }
    }

    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return [...ids];
}

async function processMessage(
  gmail: gmail_v1.Gmail,
  account: AccountWithSettings,
  messageId: string
): Promise<void> {
  const message = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const headers = message.data.payload?.headers ?? [];
  const getHeader = (name: string): string | undefined =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ??
    undefined;

  const from = getHeader("From");
  const subject = getHeader("Subject") ?? "";
  const threadId = message.data.threadId ?? messageId;

  if (from) {
    await maybeUpsertSubscription({
      accountId: account.id,
      from,
      listUnsubscribe: getHeader("List-Unsubscribe"),
      listUnsubscribePost: getHeader("List-Unsubscribe-Post"),
      internalDate: message.data.internalDate,
    });
  }

  const fullRawBody = extractMessageBody(message.data.payload);
  const cleanedText = cleanEmailPayload(
    fullRawBody.trim().length > 0
      ? fullRawBody
      : message.data.snippet ?? subject
  );
  const sender = from ? parseFromHeader(from) : null;

  if (
    !shouldClassifyEmail({
      subject,
      body: cleanedText,
      snippet: message.data.snippet,
      fromEmail: sender?.email ?? null,
    })
  ) {
    return;
  }

  const settings = account.settings;
  const llmProvider = normalizeProvider(settings?.llmProvider);

  const candidateProfile = await loadCandidateProfileSummary(account.id);

  const accountRules = await resolveIngestionRules(
    account.id,
    settings?.rules
  );
  const classification = await classifyJobEmail({
    llmProvider,
    localOllamaUrl: settings?.localOllamaUrl,
    ollamaModel: settings?.ollamaModel,
    subject,
    body: cleanedText,
    fromEmail: sender?.email ?? null,
    candidateProfile,
    allowCloudFallback: accountRules.allowCloudFallback,
  });

  if (
    !classification ||
    !classification.is_job_related ||
    classification.email_category === "IRRELEVANT"
  ) {
    if (classification) {
      await prisma.emailMessage.updateMany({
        where: { accountId: account.id, messageId },
        data: {
          emailCategory: "IRRELEVANT",
          rawBody: fullRawBody.trim().length > 0 ? fullRawBody : null,
        },
      });
    } else if (
      shouldClassifyEmail({
        subject,
        body: cleanedText,
        snippet: message.data.snippet,
        fromEmail: sender?.email ?? null,
      })
    ) {
      const emailDate = message.data.internalDate
        ? new Date(Number(message.data.internalDate))
        : new Date();

      await prisma.emailMessage.upsert({
        where: {
          accountId_messageId: {
            accountId: account.id,
            messageId,
          },
        },
        create: {
          accountId: account.id,
          messageId,
          threadId,
          subject,
          fromEmail: sender?.email ?? null,
          fromName: sender?.name ?? null,
          emailCategory: "PENDING_AI",
          emailDate,
          snippet: cleanedText.slice(0, 500),
          rawBody: fullRawBody.trim().length > 0 ? fullRawBody : null,
        },
        update: {
          emailCategory: "PENDING_AI",
          rawBody: fullRawBody.trim().length > 0 ? fullRawBody : null,
        },
      });
    }
    return;
  }

  const rules = accountRules;
  const emailDate = message.data.internalDate
    ? new Date(Number(message.data.internalDate))
    : new Date();

  await persistClassifiedEmail({
    gmail,
    account,
    messageId,
    threadId,
    subject,
    body: cleanedText,
    rawBody: fullRawBody,
    sender,
    emailDate,
    classification,
    rules,
  });
}

/**
 * Persists LLM classification: APPLICATION_STATUS → JobApplication;
 * DIRECT_RECRUITER / JOB_BOARD_DIGEST → EmailMessage + JobOpportunity rows.
 *
 * Opportunity rows use 3-tier dedupe (see `findMatchingOpportunity`):
 * same `emailMessageId` → company+title+location → create.
 * Never unique-indexes `emailMessageId` alone (digests yield many roles).
 */
export async function persistClassifiedEmail(input: {
  gmail: gmail_v1.Gmail;
  account: ClassifiableAccount;
  messageId: string;
  threadId: string;
  subject: string;
  /** Cleaned body used for parsing / snippet preview / already-classified LLM text. */
  body: string;
  /** Full extracted Gmail body preserved for drafting. */
  rawBody?: string | null;
  sender: SenderInfo | null;
  emailDate: Date;
  classification: NonNullable<
    Awaited<ReturnType<typeof classifyJobEmail>>
  >;
  rules: ReturnType<typeof parseAccountRules>;
}): Promise<{ opportunitiesUpserted: number; applicationTouched: boolean }> {
  const {
    gmail,
    account,
    messageId,
    threadId,
    subject,
    body,
    rawBody,
    sender,
    emailDate,
    classification,
    rules,
  } = input;

  const storedRawBody =
    typeof rawBody === "string" && rawBody.trim().length > 0
      ? rawBody
      : null;
  const snippetPreview = sanitizeEmailBody(body).slice(0, 500);

  const emailMessage = await prisma.emailMessage.upsert({
    where: {
      accountId_messageId: {
        accountId: account.id,
        messageId,
      },
    },
    create: {
      accountId: account.id,
      messageId,
      threadId,
      subject,
      fromEmail: sender?.email ?? null,
      fromName: sender?.name ?? null,
      emailCategory: classification.email_category,
      emailDate,
      snippet: snippetPreview,
      rawBody: storedRawBody,
    },
    update: {
      threadId,
      subject,
      fromEmail: sender?.email ?? null,
      fromName: sender?.name ?? null,
      emailCategory: classification.email_category,
      emailDate,
      snippet: snippetPreview,
      ...(storedRawBody ? { rawBody: storedRawBody } : {}),
    },
  });

  // APPLICATION_STATUS → JobApplication lifecycle, unless we already have
  // JobOpportunity listings (avoids Applied-tab duplicates).
  if (classification.email_category === "APPLICATION_STATUS") {
    const mappedStatus = mapClassificationStatus(classification.status);

    // Enrich company/title/location from confirmation body when possible.
    const parsedApp = parseApplicationEmail(subject, body);
    if (parsedApp) {
      classification.company_name = parsedApp.company;
      classification.role_title = parsedApp.title;
      if (classification.jobs.length > 0) {
        const job0 = classification.jobs[0];
        job0.company = parsedApp.company;
        if (!isGenericTitle(parsedApp.title, parsedApp.company)) {
          job0.title = parsedApp.title;
        }
        if (parsedApp.location) {
          job0.location = parsedApp.location;
        }
        job0.isAlreadyApplied = true;
      }
    }

    // Fall through to JobOpportunity upsert when listings were extracted.
    // If APPLICATION_STATUS has no jobs array, synthesize one from header fields
    // so standalone confirmations still appear under Applied.
    if (classification.jobs.length === 0) {
      if (
        mappedStatus === "APPLIED" &&
        (classification.company_name?.trim() ||
          classification.role_title?.trim())
      ) {
        classification.jobs.push({
          company: classification.company_name?.trim() || "Unknown Company",
          companyDomain: null,
          title:
            classification.role_title?.trim() ||
            genericRoleTitle(
              classification.company_name?.trim() || "Unknown Company"
            ),
          location: null,
          salary: null,
          salaryMax: null,
          postedAt: null,
          description:
            classification.action_summary ??
            "Application confirmation detected via inbox",
          applyUrl: classification.action_url,
          applicationType: "EXTERNAL_LINK",
          recipientEmail: null,
          recipientName: null,
          isAlreadyApplied: true,
          matchScore: 80,
          matchReason: "Application confirmed via email receipt.",
        });

      }
    }

    const preferOpportunityPipeline =
      mappedStatus === "APPLIED" && classification.jobs.length > 0;


    if (preferOpportunityPipeline) {
      // Remove dual-pipeline duplicates (all APPLIED JobApplications for company).
      const companyName = classification.company_name?.trim();
      const removed = await prisma.jobApplication.deleteMany({
        where: {
          accountId: account.id,
          OR: [
            { messageId },
            ...(companyName
              ? [
                  {
                    companyName: {
                      equals: companyName,
                      mode: "insensitive" as const,
                    },
                    status: "APPLIED" as const,
                  },
                ]
              : []),
          ],
        },
      });

    } else {
      const lifecycleStatuses = new Set([
        "OA",
        "INTERVIEW",
        "OFFER",
        "REJECTION",
        "APPLIED",
      ]);

      let isTrashed = false;
      let isArchived = false;

      if (mappedStatus === "REJECTION") {
        const action = await applyRejectionAction(gmail, messageId, rules);
        isTrashed = action.isTrashed;
        isArchived = action.isArchived;
      }

      const actionRequired =
        mappedStatus === "INTERVIEW" || mappedStatus === "OA"
          ? true
          : classification.action_required;

      const deadlineAt = parseDeadline(classification.deadline_iso);
      const companyName = classification.company_name;
      const durable = await ensurePersistentProfileForAccount(account);

      if (lifecycleStatuses.has(mappedStatus)) {
        const existing =
          (await prisma.jobApplication.findFirst({
            where: {
              OR: [
                { accountId: account.id, threadId },
                { persistentProfileId: durable.id, threadId },
              ],
            },
          })) ??
          (companyName
            ? await prisma.jobApplication.findFirst({
                where: {
                  OR: [
                    { accountId: account.id },
                    { persistentProfileId: durable.id },
                  ],
                  companyName: {
                    contains: companyName,
                    mode: "insensitive",
                  },
                  status: {
                    in: ["LEAD", "APPLIED", "OA", "INTERVIEW", "OFFER"],
                  },
                },
                orderBy: { updatedAt: "desc" },
              })
            : null);

        if (existing) {
          await prisma.jobApplication.update({
            where: { id: existing.id },
            data: {
              messageId,
              threadId,
              accountId: account.id,
              persistentProfileId: durable.id,
              status: mappedStatus,
              companyName: companyName ?? existing.companyName,
              roleTitle: classification.role_title ?? existing.roleTitle,
              actionRequired,
              actionSummary: classification.action_summary,
              actionUrl: classification.action_url,
              deadlineAt,
              emailDate,
              isTrashed,
              isArchived,
            },
          });
        } else {
          await prisma.jobApplication.upsert({
            where: {
              accountId_messageId: {
                accountId: account.id,
                messageId,
              },
            },
            create: {
              accountId: account.id,
              persistentProfileId: durable.id,
              messageId,
              threadId,
              companyName,
              roleTitle: classification.role_title,
              status: mappedStatus,
              dispatchType: "EMAIL",
              applicationMethod: "DIRECT_EMAIL",
              opportunityStatus: "DETECTED",
              dispatchStatus: "PENDING_REVIEW",
              actionRequired,
              actionSummary: classification.action_summary,
              actionUrl: classification.action_url,
              deadlineAt,
              emailDate,
              isTrashed,
              isArchived,
            },
            update: {
              persistentProfileId: durable.id,
              companyName,
              roleTitle: classification.role_title,
              status: mappedStatus,
              actionRequired,
              actionSummary: classification.action_summary,
              actionUrl: classification.action_url,
              deadlineAt,
              emailDate,
              isTrashed,
              isArchived,
            },
          });
        }
      } else {
        await prisma.jobApplication.upsert({
          where: {
            accountId_messageId: {
              accountId: account.id,
              messageId,
            },
          },
          create: {
            accountId: account.id,
            persistentProfileId: durable.id,
            messageId,
            threadId,
            companyName,
            roleTitle: classification.role_title,
            status: mappedStatus,
            dispatchType: "EMAIL",
            applicationMethod: "DIRECT_EMAIL",
            opportunityStatus: "DETECTED",
            dispatchStatus: "PENDING_REVIEW",
            actionRequired,
            actionSummary: classification.action_summary,
            actionUrl: classification.action_url,
            deadlineAt,
            emailDate,
            isTrashed,
            isArchived,
          },
          update: {
            persistentProfileId: durable.id,
            companyName,
            roleTitle: classification.role_title,
            status: mappedStatus,
            actionRequired,
            actionSummary: classification.action_summary,
            actionUrl: classification.action_url,
            deadlineAt,
            emailDate,
            isTrashed,
            isArchived,
          },
        });
      }

      if (classification.jobs.length === 0) {
        return { opportunitiesUpserted: 0, applicationTouched: true };
      }
    }
  }

  // DIRECT_RECRUITER / JOB_BOARD_DIGEST / applied listings → JobOpportunity rows
  const excludedTitles = rules.excludedTitles ?? [];
  let opportunitiesUpserted = 0;
  for (const job of classification.jobs) {
    const cleanCompany = job.company.trim();
    const cleanTitle = job.title.trim();
    if (!cleanCompany || !cleanTitle) continue;

    const applicationType = resolveApplicationType({
      applyUrl: job.applyUrl,
      recipientEmail: job.recipientEmail,
    });
    // Strict: never store a recipient unless application type is direct email.
    const recipientEmail =
      applicationType === "DIRECT_EMAIL" ? job.recipientEmail : null;

    const companyDomain =
      job.companyDomain ?? inferDomainFromUrl(job.applyUrl) ?? null;
    const logoUrl = getCompanyLogoUrl(cleanCompany, companyDomain);
    let matchScore =
      typeof job.matchScore === "number" ? job.matchScore : 0;
    // Guard: fractional scores that skipped normalizeClassification.
    if (matchScore > 0 && matchScore <= 1) {
      matchScore = Math.round(matchScore * 100);
    }
    let matchReason = job.matchReason ?? null;
    const excluded = titleMatchesExcluded(cleanTitle, excludedTitles);
    if (excluded) {
      matchScore = Math.min(matchScore, 20);
      if (!matchReason?.trim()) {
        matchReason = "Title matches an excluded role pattern.";
      }
    }
    // Visibility vs threshold is evaluated at read time; do not persist soft-archive.
    const isAlreadyApplied = Boolean(job.isAlreadyApplied);

    // Multi-tier dedupe: same-email → company+title+location → create.
    // Shared by webhook delta, Sync Inbox, and historical scan (all call this).
    const match = await findMatchingOpportunity({
      accountId: account.id,
      emailMessageId: emailMessage.id,
      company: cleanCompany,
      title: cleanTitle,
      location: job.location,
      applyUrl: job.applyUrl,
      isAlreadyApplied,
    });

    if (match.kind === "suppress") {
      // DISMISSED / user-archived — do not overwrite or re-create.
      continue;
    }

    if (match.kind === "update") {
      const existing = match.row;
      const upgradingPlaceholder = match.upgradingPlaceholder;

      // Upgrade to APPLIED when email confirms application; never reset
      // APPLIED / DISMISSED / REVIEW_READY back to DISCOVERED.
      let resolvedStatus = existing.status;
      if (
        isAlreadyApplied &&
        existing.status !== "APPLIED" &&
        existing.status !== "DISMISSED"
      ) {
        resolvedStatus = "APPLIED";
      }

      const shouldUpgradeTitle =
        upgradingPlaceholder &&
        !isGenericTitle(cleanTitle, cleanCompany) &&
        cleanTitle !== existing.title;

      const preserveLifecycle =
        existing.status === "APPLIED" ||
        existing.status === "DISMISSED" ||
        existing.status === "REVIEW_READY" ||
        resolvedStatus === "APPLIED";

      const appliedAt =
        resolvedStatus === "APPLIED"
          ? existing.appliedAt ?? emailDate ?? new Date()
          : existing.appliedAt;

      await prisma.jobOpportunity.update({
        where: { id: existing.id },
        data: {
          ...(shouldUpgradeTitle ? { title: cleanTitle } : {}),
          location: job.location ?? existing.location,
          salary: job.salary ?? existing.salary,
          salaryMax:
            typeof job.salaryMax === "number"
              ? job.salaryMax
              : existing.salaryMax,
          postedAt: job.postedAt ?? existing.postedAt,
          // Keep the freshest sighting timestamp without inventing duplicates.
          receivedAt:
            emailDate > existing.receivedAt ? emailDate : existing.receivedAt,
          description: job.description ?? existing.description,
          applyUrl: job.applyUrl ?? existing.applyUrl,
          applicationType,
          recipientEmail: recipientEmail ?? existing.recipientEmail,
          recipientName: job.recipientName ?? existing.recipientName,
          companyDomain: existing.companyDomain ?? companyDomain,
          logoUrl: existing.logoUrl ?? logoUrl,
          matchScore,
          matchReason: matchReason ?? existing.matchReason,
          status: resolvedStatus,
          appliedAt,
          emailMessageId: emailMessage.id,
          isArchived: preserveLifecycle
            ? resolvedStatus === "APPLIED"
              ? false
              : existing.isArchived
            : false,
          ...(resolvedStatus === "APPLIED"
            ? { previousStatus: null, dismissedAt: null }
            : {}),
        },
      });

      opportunitiesUpserted += 1;
      continue;
    }

    // ── Tier 3: insert ────────────────────────────────────────────────────
    const initialStatus = isAlreadyApplied ? "APPLIED" : "DISCOVERED";

    await prisma.jobOpportunity.create({
      data: {
        accountId: account.id,
        emailMessageId: emailMessage.id,
        company: cleanCompany,
        title: cleanTitle,
        location: job.location ?? null,
        salary: job.salary ?? null,
        salaryMax:
          typeof job.salaryMax === "number" ? job.salaryMax : null,
        postedAt: job.postedAt ?? null,
        receivedAt: emailDate,
        description: job.description ?? null,
        applyUrl: job.applyUrl ?? null,
        applicationType,
        recipientEmail,
        recipientName: job.recipientName ?? null,
        companyDomain,
        logoUrl,
        matchScore,
        matchReason,
        status: initialStatus,
        appliedAt: isAlreadyApplied ? emailDate ?? new Date() : null,
        isArchived: false,
      },
    });

    opportunitiesUpserted += 1;
  }

  return {
    opportunitiesUpserted,
    applicationTouched: classification.email_category === "APPLICATION_STATUS",
  };
}

export function mapClassificationStatus(
  status: string
): "LEAD" | "APPLIED" | "OA" | "INTERVIEW" | "OFFER" | "REJECTION" | "ARCHIVED" {
  switch (status) {
    case "OA":
    case "INTERVIEW":
    case "OFFER":
    case "REJECTION":
    case "LEAD":
    case "APPLIED":
    case "ARCHIVED":
      return status;
    case "RECEIVED":
      return "APPLIED";
    case "OTHER":
    default:
      return "LEAD";
  }
}

async function maybeUpsertSubscription(input: {
  accountId: string;
  from: string;
  listUnsubscribe: string | undefined;
  listUnsubscribePost: string | undefined;
  internalDate: string | null | undefined;
}): Promise<void> {
  if (!input.listUnsubscribe) {
    return;
  }

  const sender = parseFromHeader(input.from);
  if (!sender) {
    return;
  }

  const targets = parseListUnsubscribeHeaders(
    input.listUnsubscribe,
    input.listUnsubscribePost
  );

  if (!targets.unsubHttpUrl && !targets.unsubPostUrl && !targets.unsubMailto) {
    return;
  }

  const receivedAt = input.internalDate
    ? new Date(Number(input.internalDate))
    : new Date();

  await prisma.subscription.upsert({
    where: {
      accountId_senderEmail: {
        accountId: input.accountId,
        senderEmail: sender.email,
      },
    },
    create: {
      accountId: input.accountId,
      senderName: sender.name,
      senderEmail: sender.email,
      unsubHttpUrl: targets.unsubHttpUrl,
      unsubPostUrl: targets.unsubPostUrl,
      unsubPostBody: targets.unsubPostBody,
      unsubMailto: targets.unsubMailto,
      status: "ACTIVE",
      emailCount: 1,
      lastReceivedAt: receivedAt,
    },
    update: {
      senderName: sender.name ?? undefined,
      unsubHttpUrl: targets.unsubHttpUrl ?? undefined,
      unsubPostUrl: targets.unsubPostUrl ?? undefined,
      unsubPostBody: targets.unsubPostBody ?? undefined,
      unsubMailto: targets.unsubMailto ?? undefined,
      emailCount: { increment: 1 },
      lastReceivedAt: receivedAt,
    },
  });
}

export async function applyRejectionAction(
  gmail: gmail_v1.Gmail,
  messageId: string,
  rules: ReturnType<typeof parseAccountRules>
): Promise<{ isTrashed: boolean; isArchived: boolean }> {
  try {
    if (rules.rejectionMode === "AUTO_TRASH") {
      await gmail.users.messages.trash({ userId: "me", id: messageId });
      return { isTrashed: true, isArchived: false };
    }

    // LABEL_ONLY — apply rejection label and archive out of Inbox
    const labelIds: string[] = [];
    if (rules.rejectionLabelId) {
      labelIds.push(rules.rejectionLabelId);
    }

    await gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: {
        addLabelIds: labelIds.length > 0 ? labelIds : undefined,
        removeLabelIds: ["INBOX"],
      },
    });

    return { isTrashed: false, isArchived: true };
  } catch (error) {
    rethrowIfInsufficientScope(error);
  }
}

function normalizeProvider(value: string | null | undefined): LlmProvider {
  return value === "LOCAL_OLLAMA" ? "LOCAL_OLLAMA" : "OPENROUTER";
}

function parseDeadline(iso: string | null): Date | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Parses `Name <email@domain>` / bare email From headers.
 */
export function parseFromHeader(from: string): SenderInfo | null {
  const angle = from.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (angle) {
    const rawName = angle[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
    const email = angle[2]?.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return null;
    }
    return { name: rawName.length > 0 ? rawName : null, email };
  }

  const bare = from.trim().toLowerCase();
  if (!bare.includes("@")) {
    return null;
  }

  return { name: null, email: bare };
}

function isHistoryExpiredError(error: unknown): boolean {
  if (error instanceof GaxiosError) {
    return error.response?.status === 404;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: number | string }).code === 404
  ) {
    return true;
  }

  return false;
}
