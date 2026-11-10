"use server";

import { revalidatePath } from "next/cache";

import {
  countSendsToday,
  dispatchApplicationEmail,
  generateApplicationPdfPayload,
  getApplicationForDispatch,
  getDailySendLimit,
  markApplicationApplied,
  prepareApplicationDraft,
  refineApplicationDraft,
  updateApplicationLifecycleStatus,
  updateApplicationRecipient,
  updatePreparedDraft,
} from "@/lib/services/application-dispatch.service";
import {
  canDraftDirectEmail,
  extractRecruiterEmail,
} from "@/lib/opportunities/application-method";
import {
  InsufficientScopeError,
  REAUTH_REQUIRED_MESSAGE,
  isInsufficientScopeError,
} from "@/lib/gmail/google";
import { checkRateLimit } from "@/lib/core/ratelimit";
import {
  dispatchStatusSchema,
  saveDraftEditsSchema,
} from "@/lib/validations/dispatch.schema";
import { recipientEmailSchema } from "@/lib/validations/opportunity.schema";
import type { ApplicationStatus } from "@/lib/validations/profile.schema";

const NO_RECRUITER_EMAIL_ERROR =
  "No recruiter email address — email drafts are forbidden without a direct contact. Use the external apply link instead.";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function sendSingleApplication(
  applicationId: string,
  asDraft = false
): Promise<ActionResult<{ mode: "draft" | "sent" }>> {
  const application = await getApplicationForDispatch(applicationId);
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

  const rateLimit = await checkRateLimit(`dispatch:${accountId}`, "strict");
  if (!rateLimit.success) {
    return {
      ok: false,
      error: "Rate limit reached. Please wait a few seconds before dispatching again.",
    };
  }

  if (
    !extractRecruiterEmail({
      actionSummary: application.actionSummary,
      actionUrl: application.actionUrl,
      applyUrl: application.applyUrl,
    })
  ) {
    return { ok: false, error: NO_RECRUITER_EMAIL_ERROR };
  }

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
  ActionResult<{ subject: string; body: string; recipient: string | null }>
> {
  const application = await getApplicationForDispatch(applicationId);
  if (!application) {
    return { ok: false, error: "Application not found" };
  }
  if (!application.accountId) {
    return {
      ok: false,
      error: "Gmail account is unlinked. Reconnect to continue.",
    };
  }

  const recipientGate = extractRecruiterEmail({
    actionSummary: application.actionSummary,
    actionUrl: application.actionUrl,
    applyUrl: application.applyUrl,
  });

  try {
    if (
      application.draftSubject?.trim() &&
      application.draftBody?.trim() &&
      (application.opportunityStatus === "DRAFT_PREPARED" ||
        application.opportunityStatus === "DRAFT_SAVED_GMAIL")
    ) {
      return {
        ok: true,
        data: {
          subject: application.draftSubject,
          body: application.draftBody,
          recipient: recipientGate,
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

export async function refineApplicationDraftAction(
  applicationId: string,
  instruction: string
): Promise<ActionResult<{ subject: string; body: string }>> {
  const application = await getApplicationForDispatch(applicationId);
  if (!application?.accountId) {
    return { ok: false, error: "Application not found" };
  }

  try {
    const draft = await refineApplicationDraft(
      application.accountId,
      applicationId,
      instruction
    );
    revalidatePath("/jobs");
    return { ok: true, data: draft };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to refine draft",
    };
  }
}

/** Force a fresh LLM draft (ignores cached draftSubject/draftBody). */
export async function regenerateApplicationDraftAction(
  applicationId: string
): Promise<
  ActionResult<{ subject: string; body: string; recipient: string | null }>
> {
  const application = await getApplicationForDispatch(applicationId);
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
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to regenerate draft",
    };
  }
}

export async function updateApplicationRecipientAction(
  applicationId: string,
  recipientEmail: string
): Promise<ActionResult<{ recipientEmail: string }>> {
  const parsed = recipientEmailSchema.safeParse(recipientEmail);
  if (!parsed.success) {
    return { ok: false, error: "Invalid recipient email address" };
  }

  const application = await getApplicationForDispatch(applicationId);
  if (!application?.accountId) {
    return { ok: false, error: "Application not found" };
  }

  try {
    const data = await updateApplicationRecipient(
      application.accountId,
      applicationId,
      parsed.data
    );
    revalidatePath("/jobs");
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to update recipient",
    };
  }
}

/**
 * Persists user edits to the in-app draft before Gmail save/send.
 */
export async function saveDraftEdits(
  applicationId: string,
  input: { subject: string; body: string; recipientEmail?: string }
): Promise<ActionResult> {
  const application = await getApplicationForDispatch(applicationId);
  if (!application?.accountId) {
    return { ok: false, error: "Application not found" };
  }

  const parsed = saveDraftEditsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid draft data" };
  }

  const effectiveRecipient =
    parsed.data.recipientEmail !== undefined
      ? parsed.data.recipientEmail
      : extractRecruiterEmail({
          actionSummary: application.actionSummary,
          actionUrl: application.actionUrl,
          applyUrl: application.applyUrl,
        });

  if (!canDraftDirectEmail(effectiveRecipient)) {
    return { ok: false, error: NO_RECRUITER_EMAIL_ERROR };
  }

  try {
    await updatePreparedDraft(application.accountId, applicationId, {
      subject: parsed.data.subject,
      body: parsed.data.body,
      ...(parsed.data.recipientEmail !== undefined
        ? { recipientEmail: parsed.data.recipientEmail }
        : {}),
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

export async function markPortalAsApplied(
  applicationId: string
): Promise<ActionResult> {
  const ok = await markApplicationApplied(applicationId);
  if (!ok) {
    return { ok: false, error: "Application not found" };
  }

  revalidatePath("/jobs");
  return { ok: true };
}

export async function updateApplicationStatus(
  applicationId: string,
  status: string
): Promise<ActionResult> {
  const parsed = dispatchStatusSchema.safeParse(status);
  if (!parsed.success) {
    return { ok: false, error: "Invalid application status" };
  }

  const ok = await updateApplicationLifecycleStatus(
    applicationId,
    parsed.data as ApplicationStatus
  );
  if (!ok) {
    return { ok: false, error: "Application not found" };
  }

  revalidatePath("/jobs");
  return { ok: true };
}

export async function downloadTailoredPdfAction(
  applicationId: string,
  includeSummary = true
): Promise<ActionResult<{ base64: string; filename: string }>> {
  const result = await generateApplicationPdfPayload(applicationId, includeSummary);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  return {
    ok: true,
    data: {
      base64: result.base64,
      filename: result.filename,
    },
  };
}

export type { ApplicationStatus };
