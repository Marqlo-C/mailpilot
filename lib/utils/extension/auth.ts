import { getAuthenticatedAccountId } from "@/lib/core/auth";
import { SESSION_COOKIE } from "@/lib/core/constants";
import { prisma } from "@/lib/core/prisma";

/**
 * Resolves the authenticated account ID for Chrome extension requests.
 * Checks:
 * 1. `x-mailpilot-session-token` header
 * 2. `Authorization: Bearer <token>` header
 * 3. Direct `cookie` header from Request
 * 4. Next.js `cookies()` via `getAuthenticatedAccountId()`
 */
export async function getExtensionAccountId(
  request: Request
): Promise<string | null> {
  const headerToken =
    request.headers.get("x-mailpilot-session-token") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (headerToken && headerToken.trim().length > 0) {
    try {
      const account = await prisma.account.findFirst({
        where: { id: headerToken.trim(), isActive: true },
        select: { id: true },
      });
      if (account?.id) {
        return account.id;
      }
    } catch (err) {
      console.error("[extension-auth] Failed to authenticate header token:", err);
    }
  }

  // Parse directly from Request cookie header
  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    for (const cookieName of [
      SESSION_COOKIE,
      "activeAccountId",
      "mailpilot_session",
    ]) {
      const regex = new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`);
      const match = cookieHeader.match(regex);
      if (match && match[1]) {
        const token = decodeURIComponent(match[1].trim());
        try {
          const account = await prisma.account.findFirst({
            where: { id: token, isActive: true },
            select: { id: true },
          });
          if (account?.id) {
            return account.id;
          }
        } catch (err) {
          console.error(
            "[extension-auth] Failed to authenticate cookie token:",
            err
          );
        }
      }
    }
  }

  try {
    return await getAuthenticatedAccountId();
  } catch {
    return null;
  }
}
