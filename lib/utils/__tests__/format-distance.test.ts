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

  it("anchors relative strings against referenceDate (e.g. receivedAt)", () => {
    const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);

    // Email received 4 weeks ago, email says "5d" -> total age is 28d + 5d = 33d (~4w or 1mo)
    const anchored5d = formatRelativeTime("5d", {
      addSuffix: false,
      referenceDate: fourWeeksAgo,
    });
    expect(anchored5d).toMatch(/^(?:4w|1mo|33d)$/);

    // Email received 4 weeks ago, email says "today" -> total age is 28d = 4w
    const anchoredToday = formatRelativeTime("today", {
      addSuffix: false,
      referenceDate: fourWeeksAgo,
    });
    expect(anchoredToday).toBe("4w");

    // Email received 1 week ago, email says "3 days ago" -> total age is 7d + 3d = 10d (~1w)
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const anchored3d = formatRelativeTime("3 days ago", {
      addSuffix: false,
      referenceDate: oneWeekAgo,
    });
    expect(anchored3d).toMatch(/^(?:1w|10d)$/);
  });

  it("treats ISO strings as absolute dates without double-shifting against referenceDate", () => {
    const twoDaysAgoIso = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);

    const result = formatRelativeTime(twoDaysAgoIso, {
      addSuffix: false,
      referenceDate: fourWeeksAgo,
    });
    expect(result).toBe("2d");
  });

  it("returns null for unspecified or null dates", () => {
    expect(formatRelativeTime(null)).toBeNull();
    expect(formatRelativeTime("unspecified")).toBeNull();
    expect(formatRelativeTime("not specified")).toBeNull();
    expect(formatRelativeTime("n/a")).toBeNull();
  });
});
