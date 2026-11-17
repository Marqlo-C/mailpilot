import { describe, it, expect } from "vitest";
import { formatToastError } from "../toast-format";

describe("formatToastError", () => {
  it("returns fallback when input is empty or falsy", () => {
    expect(formatToastError(null)).toBe("Operation failed");
    expect(formatToastError(undefined)).toBe("Operation failed");
    expect(formatToastError("")).toBe("Operation failed");
    expect(formatToastError(null, "Custom fallback")).toBe("Custom fallback");
  });

  it("simplifies Ollama network failure with IP and URL to clean one-liner", () => {
    const rawError =
      "Local Ollama instance unreachable at http://192.168.1.76:11434: This operation was aborted";
    expect(formatToastError(rawError)).toBe("Local Ollama unreachable");
  });

  it("simplifies Ollama timeout to clean one-liner", () => {
    const rawError = "Ollama connection timeout after 5000ms";
    expect(formatToastError(rawError)).toBe("Ollama connection timed out");
  });

  it("simplifies generic network and rate-limit errors", () => {
    expect(formatToastError(new Error("fetch failed"))).toBe("Network request failed");
    expect(formatToastError("HTTP 429 Too Many Requests: Rate limit exceeded")).toBe("Rate limit reached");
    expect(formatToastError("401 Unauthorized token")).toBe("Unauthorized session");
    expect(formatToastError("Cloudflare 403 bot wall challenge")).toBe("Access blocked");
  });

  it("strips raw URLs and IPs from arbitrary error strings", () => {
    const raw = "Failed to connect to https://api.scrapingant.com/v2/usage?key=xyz";
    const formatted = formatToastError(raw);
    expect(formatted).not.toContain("https://");
    expect(formatted.length).toBeLessThanOrEqual(32);
  });

  it("truncates arbitrary long messages to 32 characters max with ellipsis", () => {
    const longMsg = "The database migration could not be processed due to unexpected lock";
    const formatted = formatToastError(longMsg);
    expect(formatted.length).toBeLessThanOrEqual(32);
    expect(formatted.endsWith("…")).toBe(true);
  });
});
