"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  countSendsToday,
  dispatchApplicationEmail,
  getDailySendLimit,
  prepareApplicationDraft,
  updatePreparedDraft,
} from "@/lib/dispatch";
import {
  InsufficientScopeError,
  REAUTH_REQUIRED_MESSAGE,
  isInsufficientScopeError,
} from "@/lib/google";
import { prisma } from "@/lib/prisma";
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from "@/lib/validations/profile";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const statusSchema = z.enum(APPLICATION_STATUSES);

export async function sendSingleApplication(
  applicationId: string,
  asDraft = false
): Promise<ActionResult<{ mode: "draft" | "sent" }>> {
  const application = await prisma.jobApplication.findUnique({
    where: { id: applicationId },
  });
  if (!application) {
    return { ok: false, error: "Application not found" };
  }
  if (!application.accountId) {
    return {
      ok: false,
      error: "Gmail account is unlinked. Reconnect to continue.",
    };
  }
  const accountId = application.accountId;

  try {
    if (!asDraft) {
      const sentToday = await countSendsToday(accountId);
      const limit = await getDailySendLimit(accountId);
      if (sentToday >= limit) {
        return {
          ok: false,
          error: `Daily auto-send limit reached (${limit})`,
        };
      }
    }

    const hasPreparedDraft = Boolean(
      application.draftSubject?.trim() && application.draftBody?.trim()
    );

    const result = await dispatchApplicationEmail(accountId, applicationId, {
      createDraftOnly: asDraft,
      usePreparedDraft: hasPreparedDraft,
    });
    revalidatePath("/jobs");
    revalidatePath("/");
    return { ok: true, data: result };
  } catch (error) {
    console.error("sendSingleApplication failed", error);
    if (
      error instanceof InsufficientScopeError ||
      isInsufficientScopeError(error)
    ) {
      return { ok: false, error: REAUTH_REQUIRED_MESSAGE };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Dispatch failed",
    };
  }
}

/**
 * Generates an editable in-app draft and persists subject/body on the job row.
 */
export async function prepareDraftForReview(
  applicationId: string
): Promise<
  ActionResult<{ subject: string; body: string; recipient: string }>
> {
  const application = await prisma.jobApplication.findUnique({
    where: { id: applicationId },
  });
  if (!application) {
    return { ok: false, error: "Application not found" };
  }
  if (!application.accountId) {
    return {
      ok: false,
      error: "Gmail account is unlinked. Reconnect to continue.",
    };
  }

  try {
    if (
      application.draftSubject?.trim() &&
      application.draftBody?.trim() &&
      (application.opportunityStatus === "DRAFT_PREPARED" ||
        application.opportunityStatus === "DRAFT_SAVED_GMAIL")
    ) {
      const account = await prisma.account.findUnique({
        where: { id: application.accountId },
      });
      const mailtoSource = application.applyUrl || application.actionUrl;
      const mailtoRecipient = mailtoSource?.startsWith("mailto:")
        ? mailtoSource.replace(/^mailto:/i, "").split("?")[0]
        : null;
      const emailInSummary = application.actionSummary?.match(
        /[\w.+-]+@[\w-]+\.[\w.-]+/
      )?.[0];
      return {
        ok: true,
        data: {
          subject: application.draftSubject,
          body: application.draftBody,
          recipient:
            mailtoRecipient || emailInSummary || account?.email || "",
        },
      };
    }

    const draft = await prepareApplicationDraft(
      application.accountId,
      applicationId
    );
    revalidatePath("/jobs");
    return {
      ok: true,
      data: {
        subject: draft.subject,
        body: draft.body,
        recipient: draft.recipient,
      },
    };
  } catch (error) {
    console.error("prepareDraftForReview failed", error);
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to prepare draft",
    };
  }
}

/**
 * Persists user edits to the in-app draft before Gmail save/send.
 */
export async function saveDraftEdits(
  applicationId: string,
  input: { subject: string; body: string }
): Promise<ActionResult> {
  const application = await prisma.jobApplication.findUnique({
    where: { id: applicationId },
  });
  if (!application?.accountId) {
    return { ok: false, error: "Application not found" };
  }

  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject || !body) {
    return { ok: false, error: "Subject and body are required" };
  }

  try {
    await updatePreparedDraft(application.accountId, applicationId, {
      subject,
      body,
    });
    revalidatePath("/jobs");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to save draft",
    };
  }
}

export async function batchSendApplications(
  applicationIds: string[]
): Promise<ActionResult<{ sent: number; skipped: number; errors: string[] }>> {
  if (applicationIds.length === 0) {
    return { ok: false, error: "No applications selected" };
  }

  const first = await prisma.jobApplication.findUnique({
    where: { id: applicationIds[0] },
  });
  if (!first) {
    return { ok: false, error: "Application not found" };
  }
  if (!first.accountId) {
    return {
      ok: false,
      error: "Gmail account is unlinked. Reconnect to continue.",
    };
  }
  const accountId = first.accountId;

  const limit = await getDailySendLimit(accountId);
  let sentToday = await countSendsToday(accountId);
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const id of applicationIds) {
    if (sentToday >= limit) {
      skipped += 1;
      continue;
    }
    try {
      await dispatchApplicationEmail(accountId, id, {
        createDraftOnly: false,
      });
      sent += 1;
      sentToday += 1;
    } catch (error) {
      errors.push(
        error instanceof Error ? `${id}: ${error.message}` : `${id}: failed`
      );
    }
  }

  revalidatePath("/jobs");
  revalidatePath("/");
  return { ok: true, data: { sent, skipped, errors } };
}

export async function markPortalAsApplied(
  applicationId: string
): Promise<ActionResult> {
  const application = await prisma.jobApplication.findUnique({
    where: { id: applicationId },
  });
  if (!application) {
    return { ok: false, error: "Application not found" };
  }

  const now = new Date();
  await prisma.jobApplication.update({
    where: { id: applicationId },
    data: {
      status: "APPLIED",
      dispatchStatus: "MANUAL_APPLIED",
      dispatchType: "PORTAL",
      applicationMethod: "PORTAL_QUICK_APPLY",
      opportunityStatus: "SENT",
      appliedAt: now,
    },
  });

  revalidatePath("/jobs");
  return { ok: true };
}

export async function updateApplicationStatus(
  applicationId: string,
  status: string
): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) {
    return { ok: false, error: "Invalid application status" };
  }

  const application = await prisma.jobApplication.findUnique({
    where: { id: applicationId },
  });
  if (!application) {
    return { ok: false, error: "Application not found" };
  }

  await prisma.jobApplication.update({
    where: { id: applicationId },
    data: {
      status: parsed.data,
      isArchived: parsed.data === "ARCHIVED",
      actionRequired:
        parsed.data === "OA" || parsed.data === "INTERVIEW"
          ? true
          : application.actionRequired,
    },
  });

  revalidatePath("/jobs");
  return { ok: true };
}

export async function downloadTailoredPdfAction(
  applicationId: string
): Promise<ActionResult<{ base64: string; filename: string }>> {
  // Lazy import to keep action surface thin
  const { generateTailoredResumePdf } = await import("@/lib/pdf-generator");
  const { tailorResumeForJob } = await import("@/lib/resume-tailor");
  const { getMasterProfile } = await import("@/app/actions/profile");

  const application = await prisma.jobApplication.findUnique({
    where: { id: applicationId },
  });
  if (!application) {
    return { ok: false, error: "Application not found" };
  }

  if (!application.accountId) {
    return {
      ok: false,
      error: "Gmail account is unlinked. Reconnect to download tailored PDFs.",
    };
  }

  const profileResult = await getMasterProfile(application.accountId);
  if (!profileResult.ok || !profileResult.data) {
    return { ok: false, error: profileResult.ok ? "No profile" : profileResult.error };
  }

  const { updatedAt: _updatedAt, ...profile } = profileResult.data;
  const tailored = await tailorResumeForJob(
    [
      application.roleTitle ?? "",
      application.companyName ?? "",
      application.actionSummary ?? "",
    ].filter(Boolean),
    profile
  );

  const pdf = await generateTailoredResumePdf(
    profile,
    tailored.selectedExperience
  );

  return {
    ok: true,
    data: {
      base64: pdf.toString("base64"),
      filename: `${profile.fullName.replace(/\s+/g, "_")}_Resume.pdf`,
    },
  };
}

export type { ApplicationStatus };
