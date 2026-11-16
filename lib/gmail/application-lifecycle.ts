import type { gmail_v1 } from "googleapis";

import { prisma } from "@/lib/core/prisma";
import { ensurePersistentProfileForAccount } from "@/lib/profile/persistent-profile";
import type { parseAccountRules } from "@/lib/validations/rules.schema";
import type { JobClassification } from "@/lib/validations/classification.schema";
import {
  applyRejectionAction,
  parseDeadline,
} from "./opportunity-matcher";

export type ApplicationLifecycleAccount = {
  id: string;
  email: string;
  persistentProfileId: string | null;
};

/**
 * Handles JobApplication database records for APPLICATION_STATUS emails:
 * checks existing thread/company rows, performs rejections (trash/label),
 * and updates or creates JobApplication entries.
 */
export async function handleJobApplicationLifecycle(input: {
  gmail: gmail_v1.Gmail;
  account: ApplicationLifecycleAccount;
  messageId: string;
  threadId: string;
  emailDate: Date;
  classification: JobClassification;
  rules: ReturnType<typeof parseAccountRules>;
  mappedStatus: "LEAD" | "APPLIED" | "OA" | "INTERVIEW" | "OFFER" | "REJECTION" | "ARCHIVED";
}): Promise<{
  createdCount: number;
  updatedCount: number;
  lastAction: string;
}> {
  const {
    gmail,
    account,
    messageId,
    threadId,
    emailDate,
    classification,
    rules,
    mappedStatus,
  } = input;

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
  let updatedCount = 0;
  let createdCount = 0;
  let lastAction = "";

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
      updatedCount += 1;
      lastAction = `JobApplication: Updated status to ${mappedStatus} (${existing.id})`;
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
      createdCount += 1;
      lastAction = `JobApplication: Recorded application status (${mappedStatus})`;
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
    createdCount += 1;
    lastAction = `JobApplication: Recorded application status (${mappedStatus})`;
  }

  return { createdCount, updatedCount, lastAction };
}
