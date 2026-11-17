/**
 * Pure utility to sanitize and constrain toast message strings into crisp,
 * tactile one-liners (max ~32 characters).
 * Strips raw URLs, internal IP addresses, HTTP status codes, and exception noise.
 */

const MAX_TOAST_LENGTH = 32;

/**
 * Clean and truncate an error string or Error object into a compact one-liner.
 */
export function formatToastError(error: unknown, fallback = "Operation failed"): string {
  if (!error) return fallback;

  let raw = "";
  if (typeof error === "string") {
    raw = error;
  } else if (error instanceof Error) {
    raw = error.message;
  } else if (typeof error === "object" && error !== null) {
    const candidate =
      "message" in error && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "error" in error && typeof (error as { error?: unknown }).error === "string"
        ? (error as { error: string }).error
        : "";
    raw = candidate || fallback;
  } else {
    raw = fallback;
  }

  raw = raw.trim();
  if (!raw) return fallback;

  const lower = raw.toLowerCase();

  // Common Ollama faults
  if (lower.includes("ollama")) {
    if (lower.includes("unreachable") || lower.includes("econnrefused")) {
      return "Local Ollama unreachable";
    }
    if (lower.includes("timeout") || lower.includes("aborted") || lower.includes("timed out")) {
      return "Ollama connection timed out";
    }
    if (lower.includes("http 500") || lower.includes("http 502") || lower.includes("http 503")) {
      return "Ollama server error";
    }
    if (lower.includes("not found") || lower.includes("404")) {
      return "Ollama model not found";
    }
    return "Ollama error";
  }

  // Network & transport faults
  if (lower.includes("econnrefused") || lower.includes("unreachable")) {
    return "Service unreachable";
  }
  if (lower.includes("timeout") || lower.includes("aborted") || lower.includes("timed out")) {
    return "Connection timed out";
  }
  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("fetch failed")) {
    return "Network request failed";
  }
  if (lower.includes("rate limit") || lower.includes("429")) {
    return "Rate limit reached";
  }
  if (lower.includes("unauthorized") || lower.includes("401")) {
    return "Unauthorized session";
  }
  if (lower.includes("forbidden") || lower.includes("403") || lower.includes("bot wall")) {
    return "Access blocked";
  }

  // Strip URLs (http://..., https://...) and IP:port references
  let cleaned = raw
    .replace(/https?:\/\/[^\s)]+/gi, "")
    .replace(/\b\d{1,3}(\.\d{1,3}){3}(:\d+)?\b/g, "")
    .replace(/^error:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  // If stripping left empty or trailing punctuation noise
  cleaned = cleaned.replace(/[:;,\-—\s]+$/, "").trim();

  if (!cleaned) return fallback;

  if (cleaned.length <= MAX_TOAST_LENGTH) {
    return cleaned;
  }

  return `${cleaned.slice(0, MAX_TOAST_LENGTH - 1).trim()}…`;
}
