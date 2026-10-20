import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchScrapingAntUsageFromApi,
  getOrRefreshScrapingAntUsage,
  SCRAPINGANT_USAGE_CACHE_TTL_MS,
} from "@/lib/scrapingant";
import { prisma } from "@/lib/prisma";

describe("ScrapingAnt Usage Service", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("fetchScrapingAntUsageFromApi", () => {
    it("returns null when API key is empty or whitespace", async () => {
      const result = await fetchScrapingAntUsageFromApi("   ");
      expect(result).toBeNull();
    });

    it("parses Free tier payload with 1 concurrent thread limit", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          plan_name: "Free",
          start_date: "2026-06-01T00:00:00",
          end_date: "2026-07-01T00:00:00",
          plan_total_credits: 10000,
          remained_credits: 8500,
        }),
      } as unknown as Response);

      const result = await fetchScrapingAntUsageFromApi("ant-test-key-1234");
      expect(result).not.toBeNull();
      expect(result?.planName).toBe("Free");
      expect(result?.planTotalCredits).toBe(10000);
      expect(result?.remainedCredits).toBe(8500);
      expect(result?.concurrencyLimit).toBe(1);
      expect(result?.startDate).toBe("2026-06-01T00:00:00");
      expect(result?.endDate).toBe("2026-07-01T00:00:00");
      expect(typeof result?.fetchedAt).toBe("string");
    });

    it("parses Paid Enthusiast tier payload with unlimited concurrency", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          plan_name: "Enthusiast",
          start_date: "2026-06-11T00:00:00",
          end_date: "2026-07-11T00:00:00",
          plan_total_credits: 100000,
          remained_credits: 92450,
        }),
      } as unknown as Response);

      const result = await fetchScrapingAntUsageFromApi("ant-test-key-paid");
      expect(result).not.toBeNull();
      expect(result?.planName).toBe("Enthusiast");
      expect(result?.planTotalCredits).toBe(100000);
      expect(result?.remainedCredits).toBe(92450);
      expect(result?.concurrencyLimit).toBeNull(); // Unlimited parallel threads
    });

    it("handles non-200 HTTP error status without throwing", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      } as unknown as Response);

      const result = await fetchScrapingAntUsageFromApi("ant-invalid-key");
      expect(result).toBeNull();
    });

    it("handles network failure or AbortError gracefully", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network timeout"));

      const result = await fetchScrapingAntUsageFromApi("ant-timeout-key");
      expect(result).toBeNull();
    });
  });

  describe("Cache TTL Constant", () => {
    it("is configured to 4 hours", () => {
      expect(SCRAPINGANT_USAGE_CACHE_TTL_MS).toBe(4 * 60 * 60 * 1000);
    });
  });
});
