import { describe, it, expect } from "vitest";
import { formatIsoDate, calculateDaysRemaining } from "../provider-usage-panel";

describe("ProviderUsagePanel Date Helpers", () => {
  it("formats valid ISO dates cleanly into month, day, year", () => {
    const formatted = formatIsoDate("2026-11-20T12:00:00.000Z");
    expect(formatted).toMatch(/Nov\s+20,\s+2026/);
  });

  it("safely falls back to raw string on invalid date", () => {
    const raw = "not-a-real-date";
    expect(formatIsoDate(raw)).toBe(raw);
  });

  it("calculates remaining days accurately", () => {
    const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const days = calculateDaysRemaining(futureDate);
    expect(days).toBeGreaterThanOrEqual(4);
    expect(days).toBeLessThanOrEqual(6);
  });

  it("returns 0 for past dates", () => {
    const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(calculateDaysRemaining(pastDate)).toBe(0);
  });
});
