/**
 * Tabs each sidebar page can open. Labels here are the ones the tab rails
 * render, so the sidebar menu and the rail stay the same list.
 */

const SIDEBAR_PAGE_TAB_KEY = "mailpilot.sidebarPageTab";

export const JOB_RADAR_TAB_LABEL = {
  leads: "Leads",
  applied: "Applied",
  action: "Action Required",
  history: "History",
} as const;

export const JOB_RADAR_PAGE_TABS = [
  { value: "leads", label: JOB_RADAR_TAB_LABEL.leads },
  { value: "applied", label: JOB_RADAR_TAB_LABEL.applied },
  { value: "action", label: JOB_RADAR_TAB_LABEL.action },
  { value: "history", label: JOB_RADAR_TAB_LABEL.history },
] as const;

export type JobRadarPageTab = (typeof JOB_RADAR_PAGE_TABS)[number]["value"];

export const SUBSCRIPTION_TAB_LABEL = {
  active: "Subscribed",
  archive: "Unsubscribed",
} as const;

export const SUBSCRIPTION_PAGE_TABS = [
  { value: "active", label: SUBSCRIPTION_TAB_LABEL.active },
  { value: "archive", label: SUBSCRIPTION_TAB_LABEL.archive },
] as const;

export type SubscriptionPageTab =
  (typeof SUBSCRIPTION_PAGE_TABS)[number]["value"];

export const SETTINGS_PAGE_TABS = [
  { value: "accounts", label: "Accounts" },
  { value: "profile", label: "Profile" },
  { value: "outbound", label: "Tailoring & Layout" },
  { value: "automation", label: "Automation" },
  { value: "ai", label: "AI & Models" },
  { value: "ui", label: "UI" },
] as const;

export type SettingsPageTab = (typeof SETTINGS_PAGE_TABS)[number]["value"];

export type SidebarPageTab = {
  value: string;
  label: string;
};

export function sidebarTabsForHref(href: string): readonly SidebarPageTab[] {
  if (href === "/jobs") return JOB_RADAR_PAGE_TABS;
  if (href === "/subscriptions") return SUBSCRIPTION_PAGE_TABS;
  if (href === "/settings") return SETTINGS_PAGE_TABS;
  return [];
}

type StoredSidebarPageTab = {
  href: string;
  tab: string;
};

/** Remember which tab a sidebar menu click should land on. */
export function rememberSidebarPageTab(href: string, tab: string): void {
  if (typeof window === "undefined") return;
  const payload: StoredSidebarPageTab = { href, tab };
  sessionStorage.setItem(SIDEBAR_PAGE_TAB_KEY, JSON.stringify(payload));
}

export function clearSidebarPageTab(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SIDEBAR_PAGE_TAB_KEY);
}

/**
 * Read a pending tab for this page without clearing it. Callers clear on a
 * timeout so a strict-mode remount can still read the same value.
 */
export function peekSidebarPageTab<T extends string>(
  href: string,
  allowed: readonly T[]
): T | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(SIDEBAR_PAGE_TAB_KEY);
  if (!raw) return null;
  let parsed: StoredSidebarPageTab;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value !== "object" ||
      value === null ||
      !("href" in value) ||
      !("tab" in value) ||
      typeof value.href !== "string" ||
      typeof value.tab !== "string"
    ) {
      sessionStorage.removeItem(SIDEBAR_PAGE_TAB_KEY);
      return null;
    }
    parsed = { href: value.href, tab: value.tab };
  } catch {
    sessionStorage.removeItem(SIDEBAR_PAGE_TAB_KEY);
    return null;
  }
  if (parsed.href !== href) return null;
  return allowed.find((tab) => tab === parsed.tab) ?? null;
}

function activePageTabStorageKey(href: string, accountId?: string | null): string {
  const accountPrefix = accountId ? `account:${accountId}` : "global";
  return `mailpilot_active_tab:${accountPrefix}:${href}`;
}

export function activePageTabCookieKey(href: string, accountId?: string | null): string {
  const cleanHref = href.replace(/[^a-zA-Z0-9]/g, "_");
  const accountPrefix = accountId ? accountId.replace(/[^a-zA-Z0-9]/g, "_") : "global";
  return `mp_tab_${cleanHref}_${accountPrefix}`;
}

/**
 * Persist the active tab for a page in account-scoped localStorage and cookie.
 * Survives page refreshes and browser reloads.
 */
export function persistActivePageTab(
  href: string,
  tab: string,
  accountId?: string | null
): void {
  if (typeof window === "undefined") return;

  // 1. Account-scoped localStorage
  try {
    localStorage.setItem(activePageTabStorageKey(href, accountId), tab);
  } catch {
    // Ignore quota or private mode errors
  }

  // 2. Cookie backup for browser session/refreshes
  try {
    const cookieName = activePageTabCookieKey(href, accountId);
    document.cookie = `${cookieName}=${encodeURIComponent(tab)}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    // Ignore cookie errors
  }
}

/**
 * Read the persistent active tab for a page from account-scoped localStorage or cookie backup.
 */
export function readActivePageTab<T extends string>(
  href: string,
  allowed: readonly T[],
  accountId?: string | null
): T | null {
  if (typeof window === "undefined") return null;

  // 1. Try account-scoped localStorage
  try {
    const scopedVal = localStorage.getItem(activePageTabStorageKey(href, accountId));
    if (scopedVal && (allowed as readonly string[]).includes(scopedVal)) {
      return scopedVal as T;
    }

    // Fallback to global localStorage if account-scoped was not present
    if (accountId) {
      const globalVal = localStorage.getItem(activePageTabStorageKey(href, null));
      if (globalVal && (allowed as readonly string[]).includes(globalVal)) {
        return globalVal as T;
      }
    }
  } catch {
    // Ignore storage read error, proceed to cookie fallback
  }

  // 2. Cookie fallback
  try {
    const cookieName = activePageTabCookieKey(href, accountId);
    const match = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${cookieName}=`));
    if (match) {
      const val = decodeURIComponent(match.split("=")[1] || "");
      if (val && (allowed as readonly string[]).includes(val)) {
        return val as T;
      }
    }
  } catch {
    // Ignore cookie read error
  }

  return null;
}

/**
 * Resolves the tab to display upon mounting or refreshing a page.
 * 1. Checks pending sidebar menu click (one-time navigation)
 * 2. Checks persistent account-scoped storage from last session
 * 3. Falls back to default initial tab
 */
export function resolveInitialPageTab<T extends string>(params: {
  href: string;
  allowed: readonly T[];
  fallback: T;
  accountId?: string | null;
}): T {
  const pending = peekSidebarPageTab(params.href, params.allowed);
  if (pending) return pending;

  const persistent = readActivePageTab(params.href, params.allowed, params.accountId);
  if (persistent) return persistent;

  return params.fallback;
}
