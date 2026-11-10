import { cookies } from "next/headers";
import { activePageTabCookieKey } from "./page-tabs";

/**
 * Server-side helper to read the persistent active tab directly from request cookies.
 * Enables Next.js Server Components to render the exact target tab on SSR,
 * eliminating client layout shift, double-rendering, and delayed paint.
 */
export async function readServerActivePageTab<T extends string>(
  href: string,
  allowed: readonly T[],
  accountId?: string | null
): Promise<T | null> {
  try {
    const cookieStore = await cookies();

    // 1. Check account-scoped cookie
    if (accountId) {
      const accountKey = activePageTabCookieKey(href, accountId);
      const accountVal = cookieStore.get(accountKey)?.value;
      if (accountVal && (allowed as readonly string[]).includes(accountVal)) {
        return accountVal as T;
      }
    }

    // 2. Check global fallback cookie
    const globalKey = activePageTabCookieKey(href, null);
    const globalVal = cookieStore.get(globalKey)?.value;
    if (globalVal && (allowed as readonly string[]).includes(globalVal)) {
      return globalVal as T;
    }

    return null;
  } catch {
    return null;
  }
}
