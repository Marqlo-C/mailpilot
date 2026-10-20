import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export type RateLimitTier = "standard" | "strict";

export type RateLimitResult = {
  success: boolean;
  remaining: number;
  reset: number;
  limit: number;
};

export const BYPASS_RATE_LIMIT_RESULT: RateLimitResult = {
  success: true,
  remaining: 999,
  reset: 0,
  limit: 999,
};

const isTest = process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);
const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
const isConfigured = Boolean(!isTest && redisUrl && redisToken);

const redis = isConfigured
  ? new Redis({
      url: redisUrl!,
      token: redisToken!,
    })
  : null;

/**
 * General API Limiter:
 * 30 tokens capacity, refilling 10 tokens every 10 seconds.
 */
export const apiRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.tokenBucket(10, "10 s", 30),
      prefix: "ratelimit:api",
      analytics: false,
    })
  : null;

/**
 * Sensitive / Mutating Limiter:
 * 5 tokens capacity, refilling 1 token every 12 seconds.
 * Calibrated for heavy operations like bulk sync, email dispatch, or purge.
 */
export const strictActionLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.tokenBucket(1, "12 s", 5),
      prefix: "ratelimit:strict",
      analytics: false,
    })
  : null;

/**
 * Checks rate limit for a given identifier against either the 'standard' or 'strict' tier.
 * Fails open gracefully if Upstash credentials are not configured or in the event of an outage.
 */
export async function checkRateLimit(
  identifier: string,
  tier: RateLimitTier = "standard",
  customLimiter?: Ratelimit | null
): Promise<RateLimitResult> {
  const limiter =
    customLimiter !== undefined
      ? customLimiter
      : tier === "strict"
        ? strictActionLimiter
        : apiRateLimiter;

  if (!limiter) {
    return BYPASS_RATE_LIMIT_RESULT;
  }

  try {
    const result = await limiter.limit(identifier);
    return {
      success: result.success,
      remaining: result.remaining,
      reset: result.reset,
      limit: result.limit,
    };
  } catch (error) {
    console.error(`[RateLimit] Failed to evaluate rate limit (${tier}):`, error);
    return BYPASS_RATE_LIMIT_RESULT;
  }
}

/**
 * Extracts client IP from incoming request or headers.
 */
export function getClientIp(req: Request | Headers): string {
  const headers = req instanceof Headers ? req : req.headers;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "127.0.0.1";
}
