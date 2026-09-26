"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  countSendsToday,
  dispatchApplicationEmail,
  getDailySendLimit,
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

  try {
    if (!asDraft) {
      const sentToday = await countSendsToday(application.accountId);
      const limit = await getDailySendLimit(application.accountId);
      if (sentToday >= limit) {
        return {
          ok: false,
          error: `Daily auto-send limit reached (${limit})`,
        };
      }
    }

    const result = await dispatchApplicationEmail(
      application.accountId,
      applicationId,
      { createDraftOnly: asDraft }
    );
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

  const limit = await getDailySendLimit(first.accountId);
  let sentToday = await countSendsToday(first.accountId);
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const id of applicationIds) {
    if (sentToday >= limit) {
      skipped += 1;
      continue;
    }
    try {
      await dispatchApplicationEmail(first.accountId, id, {
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
