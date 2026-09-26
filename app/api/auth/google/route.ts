import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

import { getAuthorizationUrl } from "@/lib/google";

export const runtime = "nodejs";

/**
 * Initiates Google OAuth (gmail.modify + gmail.compose + openid profile).
 * Default prompt is `select_account` so returning users skip the permissions
 * screen. Pass `?forceConsent=true` to re-prompt and obtain a fresh refresh token.
 */
export async function GET(req: NextRequest) {
  try {
    const forceConsent =
      req.nextUrl.searchParams.get("forceConsent") === "true";
    const state = randomBytes(24).toString("hex");
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
