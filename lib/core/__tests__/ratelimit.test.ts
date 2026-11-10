import { describe, it, expect, vi } from "vitest";
import type { Ratelimit } from "@upstash/ratelimit";
import {
  checkRateLimit,
  getClientIp,
  BYPASS_RATE_LIMIT_RESULT,
} from "@/lib/core/ratelimit";

describe("Rate Limiting Utility (lib/ratelimit.ts)", () => {
  describe("checkRateLimit", () => {
    it("returns bypass object when Upstash credentials are absent / limiter is null", async () => {
      const result = await checkRateLimit("test-identifier", "standard");
      expect(result).toEqual({
        success: true,
        remaining: 999,
        reset: 0,
        limit: 999,
      });
      expect(result).toEqual(BYPASS_RATE_LIMIT_RESULT);

      const nullResult = await checkRateLimit("test-identifier", "standard", null);
      expect(nullResult).toEqual(BYPASS_RATE_LIMIT_RESULT);
    });

    it("checks rate limit using custom limiter and returns success result", async () => {
      const mockLimiter = {
        limit: vi.fn().mockResolvedValueOnce({
          success: true,
          limit: 30,
          remaining: 29,
          reset: 1710000010000,
          pending: Promise.resolve(),
        }),
      } as unknown as Ratelimit;

      const result = await checkRateLimit("192.168.1.1", "standard", mockLimiter);
      expect(mockLimiter.limit).toHaveBeenCalledWith("192.168.1.1");
      expect(result).toEqual({
        success: true,
        limit: 30,
        remaining: 29,
        reset: 1710000010000,
      });
    });

    it("returns blocked result when rate limit is exceeded", async () => {
      const mockLimiter = {
        limit: vi.fn().mockResolvedValueOnce({
          success: false,
          limit: 5,
          remaining: 0,
          reset: 1710000012000,
          pending: Promise.resolve(),
        }),
      } as unknown as Ratelimit;

      const result = await checkRateLimit("account-123", "strict", mockLimiter);
      expect(mockLimiter.limit).toHaveBeenCalledWith("account-123");
      expect(result).toEqual({
        success: false,
        limit: 5,
        remaining: 0,
        reset: 1710000012000,
      });
    });

    it("fails open gracefully when limiter throws an unexpected error", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const mockLimiter = {
        limit: vi.fn().mockRejectedValueOnce(new Error("Upstash connection timeout")),
      } as unknown as Ratelimit;

      const result = await checkRateLimit("192.168.1.1", "standard", mockLimiter);
      expect(result).toEqual(BYPASS_RATE_LIMIT_RESULT);
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe("getClientIp", () => {
    it("extracts the first IP from x-forwarded-for header", () => {
      const req = new Request("http://localhost:3000", {
        headers: {
          "x-forwarded-for": "203.0.113.195, 70.41.3.18, 150.172.238.178",
        },
      });
      expect(getClientIp(req)).toBe("203.0.113.195");
    });

    it("extracts IP from x-real-ip when x-forwarded-for is missing", () => {
      const req = new Request("http://localhost:3000", {
        headers: {
          "x-real-ip": "198.51.100.42",
        },
      });
      expect(getClientIp(req)).toBe("198.51.100.42");
    });

    it("prefers x-forwarded-for over x-real-ip", () => {
      const req = new Request("http://localhost:3000", {
        headers: {
          "x-forwarded-for": "203.0.113.5",
          "x-real-ip": "198.51.100.42",
        },
      });
      expect(getClientIp(req)).toBe("203.0.113.5");
    });

    it("falls back to 127.0.0.1 when no IP headers are present", () => {
      const req = new Request("http://localhost:3000");
      expect(getClientIp(req)).toBe("127.0.0.1");
    });

    it("supports Headers object directly", () => {
      const headers = new Headers();
      headers.set("x-forwarded-for", "192.0.2.1");
      expect(getClientIp(headers)).toBe("192.0.2.1");
    });
  });
});
