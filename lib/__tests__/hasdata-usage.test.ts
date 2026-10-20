import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchHasDataUsageFromApi,
  getOrRefreshHasDataUsage,
  HASDATA_USAGE_CACHE_TTL_MS,
} from "@/lib/hasdata";

describe("HasData Usage Service", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("fetchHasDataUsageFromApi", () => {
    it("returns null when API key is empty or whitespace", async () => {
      const result = await fetchHasDataUsageFromApi("   ");
      expect(result).toBeNull();
    });

    it("parses Free tier payload with 1 concurrency limit from nested data block", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: "ok",
          data: {
            totalCredits: 1000,
            availableCredits: 750,
            concurrentRequests: 0,
            availableConcurrency: 1,
          },
        }),
      } as unknown as Response);

      const result = await fetchHasDataUsageFromApi("hd-test-key-free");
      expect(result).not.toBeNull();
      expect(result?.planName).toBe("Free");
      expect(result?.totalCredits).toBe(1000);
      expect(result?.availableCredits).toBe(750);
      expect(result?.concurrentRequests).toBe(0);
      expect(result?.availableConcurrency).toBe(1);
      expect(typeof result?.fetchedAt).toBe("string");
    });

    it("parses Startup tier with 5 concurrency and 200,000 credits", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: "ok",
          data: {
            totalCredits: 200000,
            availableCredits: 185420,
            concurrentRequests: 2,
            availableConcurrency: 5,
            planName: "Startup",
            startDate: "2026-06-01T00:00:00Z",
            endDate: "2026-07-01T00:00:00Z",
          },
        }),
      } as unknown as Response);

      const result = await fetchHasDataUsageFromApi("hd-test-key-startup");
      expect(result).not.toBeNull();
      expect(result?.planName).toBe("Startup");
      expect(result?.totalCredits).toBe(200000);
      expect(result?.availableCredits).toBe(185420);
      expect(result?.concurrentRequests).toBe(2);
      expect(result?.availableConcurrency).toBe(5);
      expect(result?.startDate).toBe("2026-06-01T00:00:00.000Z");
      expect(result?.endDate).toBe("2026-07-01T00:00:00.000Z");
    });

    it("parses high-scale tier payload and infers Scale plan", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: "ok",
          data: {
            totalCredits: 10000000,
            availableCredits: 5473702,
            concurrentRequests: 1,
            availableConcurrency: 100,
          },
        }),
      } as unknown as Response);

      const result = await fetchHasDataUsageFromApi("hd-test-key-scale");
      expect(result).not.toBeNull();
      expect(result?.planName).toBe("Scale");
      expect(result?.totalCredits).toBe(10000000);
      expect(result?.availableCredits).toBe(5473702);
      expect(result?.availableConcurrency).toBe(100);
    });

    it("handles root-level usage payloads without nested data object", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          totalCredits: 1000000,
          availableCredits: 850000,
          concurrentRequests: 0,
          availableConcurrency: 15,
        }),
      } as unknown as Response);

      const result = await fetchHasDataUsageFromApi("hd-test-key-root");
      expect(result).not.toBeNull();
      expect(result?.planName).toBe("Basic");
      expect(result?.totalCredits).toBe(1000000);
      expect(result?.availableCredits).toBe(850000);
      expect(result?.availableConcurrency).toBe(15);
    });

    it("extracts renewal date and start date from nested subscription or unix timestamps", async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/user/me/usage")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              status: "ok",
              data: {
                totalCredits: 200000,
                availableCredits: 195000,
                concurrentRequests: 0,
                availableConcurrency: 5,
              },
            }),
          } as unknown as Response;
        }
        if (url.includes("/user/me")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              subscription: {
                current_period_start: 1717200000, // Unix epoch seconds
                current_period_end: 1719792000,
              },
            }),
          } as unknown as Response;
        }
        return { ok: false, status: 404 } as unknown as Response;
      });

      const result = await fetchHasDataUsageFromApi("hd-test-key-subscription");
      expect(result).not.toBeNull();
      expect(result?.startDate).toBe(new Date(1717200000 * 1000).toISOString());
      expect(result?.endDate).toBe(new Date(1719792000 * 1000).toISOString());
    });

    it("handles non-200 HTTP error status without throwing", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      } as unknown as Response);

      const result = await fetchHasDataUsageFromApi("hd-invalid-key");
      expect(result).toBeNull();
    });

    it("handles network failure or AbortError gracefully", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network timeout"));

      const result = await fetchHasDataUsageFromApi("hd-timeout-key");
      expect(result).toBeNull();
    });
  });

  describe("Cache TTL Constant", () => {
    it("is configured to 4 hours", () => {
      expect(HASDATA_USAGE_CACHE_TTL_MS).toBe(4 * 60 * 60 * 1000);
    });
  });
});
