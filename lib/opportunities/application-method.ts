import type { ApplicationMethod } from "@/lib/validations/profile";

export type ApplicationType =
  | "DIRECT_EMAIL"
  | "EXTERNAL_LINK"
  | "QUICK_APPLY";

export type EmailCategory =
  | "DIRECT_RECRUITER"
  | "JOB_BOARD_DIGEST"
  | "APPLICATION_STATUS"
  | "IRRELEVANT";

/**
 * Classifies how a candidate should apply based on URL / recruiter contact.
 * Never returns DIRECT_EMAIL unless a real recruiter email is present.
 */
export function resolveApplicationType(input: {
  applyUrl?: string | null;
  recipientEmail?: string | null;
}): ApplicationType {
  const email = (input.recipientEmail ?? "").trim();
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "DIRECT_EMAIL";
  }

  const url = (input.applyUrl ?? "").trim().toLowerCase();
  if (!url) return "EXTERNAL_LINK";

  if (url.startsWith("mailto:")) {
    const mailto = url.replace(/^mailto:/i, "").split("?")[0] ?? "";
    if (mailto.includes("@")) return "DIRECT_EMAIL";
    return "EXTERNAL_LINK";
  }

  if (
    url.includes("linkedin.com/jobs") ||
    url.includes("easyapply") ||
    url.includes("glassdoor.com") ||
    url.includes("indeed.com")
  ) {
    return "QUICK_APPLY";
  }

  return "EXTERNAL_LINK";
}

/** @deprecated Prefer resolveApplicationType — kept for JobApplication bridge. */
export function resolveApplicationMethod(input: {
  actionUrl?: string | null;
  actionSummary?: string | null;
  recipientEmail?: string | null;
}): ApplicationMethod {
  const type = resolveApplicationType({
    applyUrl: input.actionUrl,
    recipientEmail:
      input.recipientEmail ??
      input.actionUrl?.match(/mailto:([^?&\s]+)/i)?.[1] ??
      input.actionSummary?.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ??
      null,
  });
  if (type === "DIRECT_EMAIL") return "DIRECT_EMAIL";
  if (type === "QUICK_APPLY") return "PORTAL_QUICK_APPLY";
  return "EXTERNAL_LINK";
}

export function dispatchTypeFromMethod(
  method: ApplicationMethod
): "EMAIL" | "PORTAL" {
  return method === "DIRECT_EMAIL" ? "EMAIL" : "PORTAL";
}

export function canDraftDirectEmail(recipientEmail: string | null | undefined): boolean {
  const email = (recipientEmail ?? "").trim();
  return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

/** Extracts a recruiter email from job/application fields. Never invents addresses. */
export function extractRecruiterEmail(input: {
  toEmail?: string | null;
  actionSummary?: string | null;
  actionUrl?: string | null;
  applyUrl?: string | null;
}): string | null {
  const mailtoSource = input.applyUrl || input.actionUrl;
  const mailtoRecipient = mailtoSource?.toLowerCase().startsWith("mailto:")
    ? mailtoSource.replace(/^mailto:/i, "").split("?")[0]?.trim()
    : null;
  const emailInSummary = input.actionSummary?.match(
    /[\w.+-]+@[\w-]+\.[\w.-]+/
  )?.[0];
  const candidate =
    (input.toEmail ?? "").trim() || mailtoRecipient || emailInSummary || null;
  return canDraftDirectEmail(candidate) ? candidate : null;
}
