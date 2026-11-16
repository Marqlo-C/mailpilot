"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/core/auth";
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
import {
  idParamSchema,
  instructionParamSchema,
  actionError,
  actionSuccess,
  type ServerActionResult,
} from "@/lib/validations/action.schema";
import type { ApplicationStatus } from "@/lib/validations/profile.schema";

const NO_RECRUITER_EMAIL_ERROR =
  "No recruiter email address — email drafts are forbidden without a direct contact. Use the external apply link instead.";

export type ActionResult<T = void> = ServerActionResult<T>;

export type { ServerActionResult, ApplicationStatus };

async function checkAuthSession(): Promise<ServerActionResult<string>> {
  const session = await auth();
  if (!session) return actionError("Unauthorized");
  return actionSuccess(session.accountId);
}

export async function sendSingleApplication(
  applicationId: string,
  asDraft = false
): Promise<ServerActionResult<{ mode: "draft" | "sent" }>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const parsedId = idParamSchema.safeParse(applicationId);
  if (!parsedId.success) return actionError(parsedId.error.issues[0]?.message ?? "Invalid application ID");

  const application = await getApplicationForDispatch(parsedId.data);
  if (!application) {
    return actionError("Application not found");
  }
  if (!application.accountId) {
    return actionError("Gmail account is unlinked. Reconnect to continue.");
  }
  const accountId = application.accountId;

  const rateLimit = await checkRateLimit(`dispatch:${accountId}`, "strict");
  if (!rateLimit.success) {
    return actionError("Rate limit reached. Please wait a few seconds before dispatching another application.");
  }

  const sendsToday = await countSendsToday(accountId);
  const dailyLimit = await getDailySendLimit(accountId);
  if (!asDraft && sendsToday >= dailyLimit) {
    return actionError(`Daily application limit reached (${sendsToday}/${dailyLimit}). Drafts can still be prepared for review.`);
  }

  if (
    !extractRecruiterEmail({
      actionSummary: application.actionSummary,
      actionUrl: application.actionUrl,
      applyUrl: application.applyUrl,
    })
  ) {
    return actionError(NO_RECRUITER_EMAIL_ERROR);
  }

  try {
    const hasPreparedDraft = Boolean(
      application.draftSubject?.trim() && application.draftBody?.trim()
    );

    const result = await dispatchApplicationEmail(accountId, parsedId.data, {
      createDraftOnly: asDraft,
      usePreparedDraft: hasPreparedDraft,
    });
    revalidatePath("/jobs");
    revalidatePath("/");
    return actionSuccess(result);
  } catch (error) {
    if (error instanceof InsufficientScopeError || isInsufficientScopeError(error)) {
      return actionError(REAUTH_REQUIRED_MESSAGE);
    }
    return actionError(error instanceof Error ? error.message : "Failed to dispatch application");
  }
}

export async function prepareDraftForReview(
  applicationId: string
): Promise<
  ServerActionResult<{ subject: string; body: string; recipient: string | null }>
> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const parsedId = idParamSchema.safeParse(applicationId);
  if (!parsedId.success) return actionError(parsedId.error.issues[0]?.message ?? "Invalid application ID");

  const application = await getApplicationForDispatch(parsedId.data);
  if (!application) {
    return actionError("Application not found");
  }
  if (!application.accountId) {
    return actionError("Gmail account is unlinked. Reconnect to continue.");
  }

  const recipientGate = extractRecruiterEmail({
    actionSummary: application.actionSummary,
    actionUrl: application.actionUrl,
    applyUrl: application.applyUrl,
  });

  if (!canDraftDirectEmail(recipientGate)) {
    return actionError(NO_RECRUITER_EMAIL_ERROR);
  }

  try {
    if (application.draftSubject && application.draftBody) {
      return actionSuccess({
        subject: application.draftSubject,
        body: application.draftBody,
        recipient: recipientGate,
      });
    }

    const draft = await prepareApplicationDraft(
      application.accountId,
      parsedId.data
    );
    revalidatePath("/jobs");
    return actionSuccess({
      subject: draft.subject,
      body: draft.body,
      recipient: draft.recipient,
    });
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Failed to prepare draft");
  }
}

export async function refineApplicationDraftAction(
  applicationId: string,
  instruction: string
): Promise<ServerActionResult<{ subject: string; body: string }>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const parsedId = idParamSchema.safeParse(applicationId);
  if (!parsedId.success) return actionError(parsedId.error.issues[0]?.message ?? "Invalid application ID");

  const parsedInstr = instructionParamSchema.safeParse(instruction);
  if (!parsedInstr.success) return actionError(parsedInstr.error.issues[0]?.message ?? "Invalid instruction");

  const application = await getApplicationForDispatch(parsedId.data);
  if (!application?.accountId) {
    return actionError("Application not found");
  }

  try {
    const draft = await refineApplicationDraft(
      application.accountId,
      parsedId.data,
      parsedInstr.data
    );
    revalidatePath("/jobs");
    return actionSuccess(draft);
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Failed to refine draft");
  }
}

/** Force a fresh LLM draft (ignores cached draftSubject/draftBody). */
export async function regenerateApplicationDraftAction(
  applicationId: string
): Promise<
  ServerActionResult<{ subject: string; body: string; recipient: string | null }>
> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const parsedId = idParamSchema.safeParse(applicationId);
  if (!parsedId.success) return actionError(parsedId.error.issues[0]?.message ?? "Invalid application ID");

  const application = await getApplicationForDispatch(parsedId.data);
  if (!application) {
    return actionError("Application not found");
  }
  if (!application.accountId) {
    return actionError("Gmail account is unlinked. Reconnect to continue.");
  }

  try {
    const draft = await prepareApplicationDraft(
      application.accountId,
      parsedId.data
    );
    revalidatePath("/jobs");
    return actionSuccess({
      subject: draft.subject,
      body: draft.body,
      recipient: draft.recipient,
    });
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Failed to regenerate draft");
  }
}

export async function updateApplicationRecipientAction(
  applicationId: string,
  recipientEmail: string
): Promise<ServerActionResult<{ recipientEmail: string }>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const parsedId = idParamSchema.safeParse(applicationId);
  if (!parsedId.success) return actionError(parsedId.error.issues[0]?.message ?? "Invalid application ID");

  const parsed = recipientEmailSchema.safeParse(recipientEmail);
  if (!parsed.success) {
    return actionError("Invalid recipient email address");
  }

  const application = await getApplicationForDispatch(parsedId.data);
  if (!application?.accountId) {
    return actionError("Application not found");
  }

  try {
    const data = await updateApplicationRecipient(
      application.accountId,
      parsedId.data,
      parsed.data
    );
    revalidatePath("/jobs");
    return actionSuccess(data);
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Failed to update recipient");
  }
}

/**
 * Persists user edits to the in-app draft before Gmail save/send.
 */
export async function saveDraftEdits(
  applicationId: string,
  input: { subject: string; body: string; recipientEmail?: string }
): Promise<ServerActionResult<void>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const parsedId = idParamSchema.safeParse(applicationId);
  if (!parsedId.success) return actionError(parsedId.error.issues[0]?.message ?? "Invalid application ID");

  const application = await getApplicationForDispatch(parsedId.data);
  if (!application?.accountId) {
    return actionError("Application not found");
  }

  const parsed = saveDraftEditsSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid draft data");
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
    return actionError(NO_RECRUITER_EMAIL_ERROR);
  }

  try {
    await updatePreparedDraft(application.accountId, parsedId.data, {
      subject: parsed.data.subject,
      body: parsed.data.body,
      ...(parsed.data.recipientEmail !== undefined
        ? { recipientEmail: parsed.data.recipientEmail }
        : {}),
    });
    revalidatePath("/jobs");
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Failed to save draft");
  }
}

export async function markPortalAsApplied(
  applicationId: string
): Promise<ServerActionResult<void>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const parsedId = idParamSchema.safeParse(applicationId);
  if (!parsedId.success) return actionError(parsedId.error.issues[0]?.message ?? "Invalid application ID");

  const ok = await markApplicationApplied(parsedId.data);
  if (!ok) {
    return actionError("Application not found");
  }

  revalidatePath("/jobs");
  return actionSuccess(undefined);
}

export async function updateApplicationStatus(
  applicationId: string,
  status: string
): Promise<ServerActionResult<void>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const parsedId = idParamSchema.safeParse(applicationId);
  if (!parsedId.success) return actionError(parsedId.error.issues[0]?.message ?? "Invalid application ID");

  const parsed = dispatchStatusSchema.safeParse(status);
  if (!parsed.success) {
    return actionError("Invalid application status");
  }

  const ok = await updateApplicationLifecycleStatus(
    parsedId.data,
    parsed.data as ApplicationStatus
  );
  if (!ok) {
    return actionError("Application not found");
  }

  revalidatePath("/jobs");
  return actionSuccess(undefined);
}

export async function downloadTailoredPdfAction(
  applicationId: string,
  includeSummary = true
): Promise<ServerActionResult<{ base64: string; filename: string }>> {
  const authGate = await checkAuthSession();
  if (!authGate.success) return authGate;

  const parsedId = idParamSchema.safeParse(applicationId);
  if (!parsedId.success) return actionError(parsedId.error.issues[0]?.message ?? "Invalid application ID");

  const result = await generateApplicationPdfPayload(parsedId.data, includeSummary);
  if (!result.ok) {
    return actionError(result.error ?? "Failed to generate application PDF");
  }

  return actionSuccess({
    base64: result.base64,
    filename: result.filename,
  });
}
