import { NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE } from "@/lib/constants";

const PUBLIC_EXACT = new Set(["/login", "/favicon.ico"]);

const PUBLIC_PREFIXES = [
  "/api/auth",
  "/_next",
  "/logos",
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isProtectedPath(pathname: string): boolean {
  if (pathname === "/") return true;
  const protectedRoots = [
    "/dashboard",
    "/subscriptions",
    "/settings",
    "/jobs",
    "/radar",
  ];
  return protectedRoots.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`)
  );
}

/**
 * Route guard: require `mailpilot_session` for app shells; send anonymous
 * users to `/login`. Authenticated users hitting `/login` go home.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = request.cookies.get(SESSION_COOKIE)?.value?.trim();
  const hasSession = Boolean(session);

  if (isPublicPath(pathname)) {
    if (pathname === "/login" && hasSession) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (isProtectedPath(pathname) && !hasSession) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except static assets that never need auth checks.
     * Logos and favicon are still listed as public above for safety.
     */
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
