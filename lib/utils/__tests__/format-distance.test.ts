import { describe, expect, it } from "vitest";
import { formatRelativeTime, formatDistanceToNow } from "../format-distance";

describe("formatRelativeTime", () => {
  it("formats Date objects cleanly", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(twoDaysAgo, { addSuffix: false })).toBe("2d");
    expect(formatRelativeTime(twoDaysAgo, { addSuffix: true })).toBe("2d ago");
  });

  it("handles relative strings without referenceDate", () => {
    expect(formatRelativeTime("Posted: 3 days ago", { addSuffix: false })).toBe("3d");
    expect(formatRelativeTime("Posted: 3 days ago", { addSuffix: true })).toBe("3d ago");
    expect(formatRelativeTime("Posted: Today", { addSuffix: false })).toBe("0d");
    expect(formatRelativeTime("Posted: Today", { addSuffix: true })).toBe("0d ago");
    expect(formatRelativeTime("reposted 4 days ago", { addSuffix: false })).toBe("4d");
    expect(formatRelativeTime("5d", { addSuffix: false })).toBe("5d");
  });

  it("is strictly idempotent on already formatted relative strings", () => {
    expect(formatRelativeTime("3d", { addSuffix: false })).toBe("3d");
    expect(formatRelativeTime("4w", { addSuffix: false })).toBe("4w");
    expect(formatRelativeTime("2mo", { addSuffix: false })).toBe("2mo");
    expect(formatRelativeTime("3d ago", { addSuffix: true })).toBe("3d ago");
    expect(formatRelativeTime("4w ago", { addSuffix: true })).toBe("4w ago");
  });

  it("formats ISO strings relative to now", () => {
    const twoDaysAgoIso = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(twoDaysAgoIso, { addSuffix: false })).toBe("2d");
    expect(formatRelativeTime(twoDaysAgoIso, { addSuffix: true })).toBe("2d ago");
  });

  it("returns null for unspecified or null dates", () => {
    expect(formatRelativeTime(null)).toBeNull();
    expect(formatRelativeTime("unspecified")).toBeNull();
    expect(formatRelativeTime("not specified")).toBeNull();
    expect(formatRelativeTime("n/a")).toBeNull();
  });
});
