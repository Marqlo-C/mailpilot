import type { ApplicationMethod } from "@/lib/validations/profile";

/**
 * Classifies how a candidate should apply based on detected action URL / summary.
 */
export function resolveApplicationMethod(input: {
  actionUrl?: string | null;
  actionSummary?: string | null;
}): ApplicationMethod {
  const url = (input.actionUrl ?? "").trim();
  if (!url) {
    return "DIRECT_EMAIL";
  }

  const lower = url.toLowerCase();
  if (lower.startsWith("mailto:")) return "DIRECT_EMAIL";

  if (
    lower.includes("linkedin.com") ||
    lower.includes("indeed.com") ||
    lower.includes("glassdoor.com") ||
    lower.includes("handshake")
  ) {
    return "EXTERNAL_LINK";
  }

  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    return "PORTAL_QUICK_APPLY";
  }

  return "DIRECT_EMAIL";
}

export function dispatchTypeFromMethod(
  method: ApplicationMethod
): "EMAIL" | "PORTAL" {
  return method === "DIRECT_EMAIL" ? "EMAIL" : "PORTAL";
}
