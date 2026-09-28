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
  loadCandidateProfileSummary,
  matchesJobSubjectKeywords,
  sanitizeEmailBody,
  type LlmProvider,
} from "@/lib/llm";
import {
  ensurePersistentProfileForAccount,
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
import { parseAccountRules, titleMatchesExcluded } from "@/lib/validations/rules";

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

  if (!account || !account.isActive || !account.encryptedAccess) {
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
    data: {
      historyId: latestHistoryId,
      lastSyncedAt: new Date(),
    },
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

  const sender = from ? parseFromHeader(from) : null;
  const candidateProfile = await loadCandidateProfileSummary(account.id);

  const classification = await classifyJobEmail({
    llmProvider,
    localOllamaUrl: settings?.localOllamaUrl,
    ollamaModel: settings?.ollamaModel,
    subject,
    body,
    fromEmail: sender?.email ?? null,
    candidateProfile,
  });

  if (!classification || !classification.is_job_related) {
    return;
  }

  if (classification.email_category === "IRRELEVANT") {
    return;
  }

  const rules = parseAccountRules(settings?.rules);
  const emailDate = message.data.internalDate
    ? new Date(Number(message.data.internalDate))
    : new Date();

  await persistClassifiedEmail({
    gmail,
    account,
    messageId,
    threadId,
    subject,
    body,
    sender,
    emailDate,
    classification,
    rules,
  });
}

/**
 * Persists LLM classification: APPLICATION_STATUS → JobApplication;
 * DIRECT_RECRUITER / JOB_BOARD_DIGEST → EmailMessage + JobOpportunity rows.
 * Returns how many new opportunities were created (digests may yield many).
 */
export async function persistClassifiedEmail(input: {
  gmail: gmail_v1.Gmail;
  account: ClassifiableAccount;
  messageId: string;
  threadId: string;
  subject: string;
  body: string;
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
    sender,
    emailDate,
    classification,
    rules,
  } = input;

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
      snippet: sanitizeEmailBody(body).slice(0, 500),
    },
    update: {
      threadId,
      subject,
      fromEmail: sender?.email ?? null,
      fromName: sender?.name ?? null,
      emailCategory: classification.email_category,
      emailDate,
      snippet: sanitizeEmailBody(body).slice(0, 500),
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
  const threshold = rules.matchScoreThreshold ?? 75;
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
    let matchReason = job.matchReason ?? null;
    const excluded = titleMatchesExcluded(cleanTitle, excludedTitles);
    if (excluded) {
      matchScore = Math.min(matchScore, 20);
      if (!matchReason?.trim()) {
        matchReason = "Title matches an excluded role pattern.";
      }
    }
    const scoreArchived = excluded || matchScore < threshold;
    const isAlreadyApplied = Boolean(job.isAlreadyApplied);

    // Scoped dedupe: exact (company + title), else upgrade a placeholder
    // for this company. Never overwrite a different real role at the company.
    let existing = await prisma.jobOpportunity.findFirst({
      where: {
        accountId: account.id,
        company: { equals: cleanCompany, mode: "insensitive" },
        title: { equals: cleanTitle, mode: "insensitive" },
      },
    });

    let upgradingPlaceholder = false;
    if (!existing && isAlreadyApplied && !isGenericTitle(cleanTitle, cleanCompany)) {
      existing = await prisma.jobOpportunity.findFirst({
        where: {
          accountId: account.id,
          company: { equals: cleanCompany, mode: "insensitive" },
          OR: [
            { title: { equals: "Applied Position", mode: "insensitive" } },
            { title: { equals: "Applicant", mode: "insensitive" } },
            {
              title: {
                equals: genericRoleTitle(cleanCompany),
                mode: "insensitive",
              },
            },
          ],
        },
        orderBy: { receivedAt: "desc" },
      });
      upgradingPlaceholder = Boolean(existing);
    }

    if (existing) {
      const userArchived =
        existing.status !== "DISMISSED" &&
        existing.isArchived &&
        existing.previousStatus != null;

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
        userArchived ||
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
          // Only refresh score-archive for still-DISCOVERED soft-hides.
          isArchived: preserveLifecycle
            ? resolvedStatus === "APPLIED"
              ? false
              : existing.isArchived
            : scoreArchived,
          // Clear user-archive markers once promoted to APPLIED.
          ...(resolvedStatus === "APPLIED"
            ? { previousStatus: null, dismissedAt: null }
            : {}),
        },
      });

      opportunitiesUpserted += 1;
      continue;
    }

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
        isArchived: initialStatus === "DISCOVERED" ? scoreArchived : false,
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
