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
  { value: "outbound", label: "Outbound" },
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
