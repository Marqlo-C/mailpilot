import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

import { getAuthorizationUrl } from "@/lib/google";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

export type OAuthIntent = "login" | "link";

/**
 * Initiates Google OAuth.
 * - `intent=login` (default): independent user sign-in / create separate profile
 * - `intent=link`: attach another mailbox to the currently authenticated profile
 * - `forceConsent=true`: force Google permission consent (refresh token / scope changes)
 */
export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(ip, "standard");
  if (!rateLimit.success) {
    const retryAfter = Math.max(
      1,
      Math.ceil((rateLimit.reset - Date.now()) / 1000)
    );
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": retryAfter.toString(),
          "X-RateLimit-Limit": rateLimit.limit.toString(),
          "X-RateLimit-Remaining": rateLimit.remaining.toString(),
          "X-RateLimit-Reset": rateLimit.reset.toString(),
        },
      }
    );
  }

  try {
    const intent: OAuthIntent =
      req.nextUrl.searchParams.get("intent") === "link" ? "link" : "login";
    const forceConsent =
      req.nextUrl.searchParams.get("forceConsent") === "true";

    const state = Buffer.from(
      JSON.stringify({
        intent,
        timestamp: Date.now(),
        nonce: randomBytes(16).toString("hex"),
      })
    ).toString("base64url");

    const authUrl = getAuthorizationUrl(state, { forceConsent });

    const response = NextResponse.redirect(authUrl);
    response.cookies.set("oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 10, // 10 minutes
    });

    return response;
  } catch (error) {
    console.error("Failed to initiate Google OAuth", error);
    return NextResponse.json(
      { error: "Failed to initiate Google OAuth" },
      { status: 500 }
    );
  }
}
