import type { gmail_v1 } from "googleapis";
import type { Account, AccountSettings, JobOpportunity } from "@prisma/client";
import { GaxiosError } from "gaxios";

import {
  getGmailClientForAccount,
  registerInboxWatch,
  rethrowIfInsufficientScope,
} from "@/lib/gmail/google";
import { cleanEmailPayload } from "@/lib/ai/email-cleaner";
import {
  classifyJobEmail,
  extractMessageBody,
  extractMessageHtml,
  loadCandidateProfileSummary,
  sanitizeEmailBody,
  shouldClassifyEmail,
  type JobClassification,
  type LlmProvider,
} from "@/lib/ai";
import { isJobLeadsEmail, parseJobLeadsDigest } from "@/lib/opportunities/sync/jobleads";
import {
  ensurePersistentProfileForAccount,
  mergeRulesWithPermanentSettings,
} from "@/lib/profile/persistent-profile";
import { resolveApplicationType } from "@/lib/opportunities/application-method";
import {
  normalizeSalaryDisplay,
  parseSalaryMax,
  type CandidateProfileSummary,
} from "@/lib/ai/classifier";
import {
  normalizePostedAt,
  relativeTimeToIso,
  sanitizeCompanyName,
} from "@/lib/opportunities/context";
import {
  getCompanyLogoUrl,
  inferDomainFromUrl,
} from "@/lib/utils/company-logo";
import { isKnownJobDomain } from "@/lib/constants/job-sources";
import {
  genericRoleTitle,
  isGenericTitle,
  parseApplicationEmail,
} from "@/lib/gmail/application-parser";
import { prisma } from "@/lib/core/prisma";
import {
  advanceSubscriptionLastReceived,
  dateFromGmailInternalDate,
} from "@/lib/subscriptions/last-received";
import { parseListUnsubscribeHeaders } from "@/lib/gmail/unsubscribe";
import { logStory, syncLog } from "@/lib/logging";
import { isLocationCompatible } from "@/lib/utils/location";
import {
  parseAccountRules,
  titleMatchesExcluded,
  type AccountRules,
} from "@/lib/validations/rules.schema";
import {
  extractCleanSnippet,
  sanitizeJobDescription,
} from "@/lib/opportunities/context";


import {
  persistClassifiedEmail,
  mapClassificationStatus,
  applyRejectionAction,
  type ClassifiableAccount,
} from "./ingestion-pipeline";
import {
  parseFromHeader,
  maybeUpsertSubscription,
  type SenderInfo,
} from "./subscription-pipeline";

export {
  persistClassifiedEmail,
  mapClassificationStatus,
  applyRejectionAction,
  parseFromHeader,
  type ClassifiableAccount,
  type SenderInfo,
};

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

type AccountWithSettings = Account & {
  settings: AccountSettings | null;
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

    // Preload candidate profile and account rules once to eliminate N redundant queries across messages
    const [candidateProfile, accountRules] = await Promise.all([
      loadCandidateProfileSummary(account.id),
      resolveIngestionRules(account.id, account.settings?.rules),
    ]);

    for (const messageId of messageIds) {
      try {
        await processMessage(gmail, account, messageId, {
          candidateProfile,
          accountRules,
        });
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
  messageId: string,
  context?: {
    candidateProfile?: CandidateProfileSummary | null;
    accountRules?: AccountRules;
  }
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

  const sender = from ? parseFromHeader(from) : null;
  const isJobLeads = isJobLeadsEmail(sender?.email, sender?.name, from);
  const fullRawBody = extractMessageBody(message.data.payload, isJobLeads);
  const rawHtml = isJobLeads ? extractMessageHtml(message.data.payload) : null;
  const cleanedText = cleanEmailPayload(
    (rawHtml || fullRawBody).trim().length > 0
      ? (rawHtml || fullRawBody)
      : message.data.snippet ?? subject
  );

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

  const candidateProfile =
    context?.candidateProfile !== undefined
      ? context.candidateProfile
      : await loadCandidateProfileSummary(account.id);

  const accountRules =
    context?.accountRules !== undefined
      ? context.accountRules
      : await resolveIngestionRules(account.id, settings?.rules);
  const messageDate = message.data.internalDate
    ? new Date(Number(message.data.internalDate))
    : new Date();

  let classification: JobClassification | null = null;

  // Direct Deterministic Parser for JobLeads: bypass LLM completely to prevent aggregator hallucinations
  if (isJobLeads && rawHtml) {
    classification = parseJobLeadsDigest(rawHtml, {
      subject,
      receivedAt: messageDate,
    });
  }

  if (!classification) {
    try {
      classification = await classifyJobEmail({
        llmProvider,
        localOllamaUrl: settings?.localOllamaUrl,
        ollamaModel: settings?.ollamaModel,
        subject,
        body: cleanedText,
        fromEmail: sender?.email ?? null,
        candidateProfile,
        allowCloudFallback: accountRules.allowCloudFallback,
        accountId: account.id,
        accountRules,
        receivedAt: messageDate,
      });
    } catch {
      classification = null;
    }
  }

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
