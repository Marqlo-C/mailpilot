import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

import { getAuthorizationUrl } from "@/lib/google";

export const runtime = "nodejs";

/**
 * Initiates Google OAuth with gmail.modify + gmail.readonly scopes.
 * Stores a CSRF state token in an httpOnly cookie for the callback.
 */
export async function GET() {
  try {
    const state = randomBytes(24).toString("hex");
    const authUrl = getAuthorizationUrl(state);

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
