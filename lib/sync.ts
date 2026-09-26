import type { gmail_v1 } from "googleapis";
import type { Account, AccountSettings } from "@prisma/client";
import { GaxiosError } from "gaxios";

import {
  getGmailClientForAccount,
  registerInboxWatch,
  rethrowIfInsufficientScope,
} from "@/lib/google";
import {
  classifyJobEmail,
  extractMessageBody,
  matchesJobSubjectKeywords,
  type LlmProvider,
} from "@/lib/llm";
import { prisma } from "@/lib/prisma";
import { parseListUnsubscribeHeaders } from "@/lib/unsubscribe";
import { parseAccountRules } from "@/lib/validations/rules";

type SenderInfo = {
  name: string | null;
  email: string;
};

type AccountWithSettings = Account & {
  settings: AccountSettings | null;
};

/**
 * Processes Gmail history deltas for an account:
 * fetches newly added messages, parses RFC 8058 headers, upserts Subscriptions,
 * runs job classification + rejection actions, and advances historyId.
 */
export async function processInboxDelta(
  emailAddress: string,
  notificationHistoryId: string
): Promise<void> {
  const account = await prisma.account.findUnique({
    where: { email: emailAddress },
    include: { settings: true },
  });

  if (!account || !account.isActive) {
    console.warn(`Ignoring delta for unknown/inactive account: ${emailAddress}`);
    return;
  }

  const gmail = await getGmailClientForAccount(account);
  const startHistoryId = account.historyId ?? notificationHistoryId;

  let latestHistoryId = notificationHistoryId;

  try {
    const messageIds = await collectAddedMessageIds(gmail, startHistoryId);

    for (const messageId of messageIds) {
      try {
        await processMessage(gmail, account, messageId);
      } catch (error) {
        console.error(
          `Failed to process message ${messageId} for ${emailAddress}`,
          error
        );
      }
    }

    const profile = await gmail.users.getProfile({ userId: "me" });
    if (profile.data.historyId) {
      latestHistoryId = String(profile.data.historyId);
    }
  } catch (error) {
    if (isHistoryExpiredError(error)) {
      console.warn(
        `History ID expired for ${emailAddress}; re-registering watch`
      );
      const watch = await registerInboxWatch(gmail);
      latestHistoryId = watch.historyId;
    } else {
      throw error;
    }
  }

  await prisma.account.update({
    where: { id: account.id },
    data: { historyId: latestHistoryId },
  });
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

  if (!matchesJobSubjectKeywords(subject)) {
    return;
  }

  const body = extractMessageBody(message.data.payload);
  const settings = account.settings;
  const llmProvider = normalizeProvider(settings?.llmProvider);

  const classification = await classifyJobEmail({
    llmProvider,
    localOllamaUrl: settings?.localOllamaUrl,
    subject,
    body,
  });

  if (!classification || !classification.is_job_related) {
    return;
  }

  const rules = parseAccountRules(settings?.rules);
  const emailDate = message.data.internalDate
    ? new Date(Number(message.data.internalDate))
    : new Date();

  const mappedStatus = mapClassificationStatus(classification.status);
  const lifecycleStatuses = new Set([
    "OA",
    "INTERVIEW",
    "OFFER",
    "REJECTION",
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

  // Lifecycle reconciliation: update existing thread/company application when possible
  if (lifecycleStatuses.has(mappedStatus)) {
    const existing =
      (await prisma.jobApplication.findFirst({
        where: { accountId: account.id, threadId },
      })) ??
      (companyName
        ? await prisma.jobApplication.findFirst({
            where: {
              accountId: account.id,
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
      return;
    }
  }

  await prisma.jobApplication.upsert({
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
      companyName,
      roleTitle: classification.role_title,
      status: mappedStatus,
      dispatchType: classification.action_url ? "PORTAL" : "EMAIL",
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
