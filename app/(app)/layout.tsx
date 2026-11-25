import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { SESSION_COOKIE } from "@/lib/core/constants";
import {
  getActiveAccount,
  getSidebarTabCounts,
  listAccounts,
  type SidebarTabCounts,
} from "@/lib/data";
import { readServerUiPreferences } from "@/lib/utils/ui/ui-preferences-server";

/**
 * Authenticated app chrome. Isolated from `/login` so `await cookies()` here
 * cannot inject a Suspense boundary into the login page slot.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const hasSession = Boolean(cookieStore.get(SESSION_COOKIE)?.value?.trim());
  if (!hasSession) {
    redirect("/login");
  }

  const [accounts, active] = await Promise.all([
    listAccounts(),
    getActiveAccount(),
  ]);
  const [tabCounts, initialUiPreferences] = await Promise.all([
    active
      ? getSidebarTabCounts(active.id, active.persistentProfileId)
      : Promise.resolve<SidebarTabCounts>({
          jobs: { leads: 0, applied: 0, action: 0, history: 0 },
          subscriptions: { active: 0, archive: 0 },
        }),
    readServerUiPreferences(active?.id ?? null),
  ]);

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: [
            initialUiPreferences.tabRail === "dark"
              ? 'document.documentElement.setAttribute("data-mp-tab-rail","dark")'
              : 'document.documentElement.removeAttribute("data-mp-tab-rail")',
            initialUiPreferences.railAction === "dark"
              ? 'document.documentElement.setAttribute("data-mp-rail-action","dark")'
              : 'document.documentElement.removeAttribute("data-mp-rail-action")',
            initialUiPreferences.toolbar === "dark"
              ? 'document.documentElement.setAttribute("data-mp-toolbar","dark")'
              : 'document.documentElement.removeAttribute("data-mp-toolbar")',
          ].join(";"),
        }}
      />
      <link
        rel="preload"
        href="/fonts/DupletRounded-Bold-BF6606345a47d2e.woff2"
        as="font"
        type="font/woff2"
        crossOrigin="anonymous"
      />
      <AppShell
        accounts={accounts}
        activeAccountId={active?.id ?? null}
        activeEmail={active?.email ?? null}
        initialIsSyncing={Boolean(active?.isSyncing)}
        initialPendingClassificationCount={
          active?.pendingClassificationCount ?? 0
        }
        tabCounts={tabCounts}
        initialUiPreferences={initialUiPreferences}
        isDev={process.env.NODE_ENV === "development"}
      >
        {children}
      </AppShell>
    </>
  );
}
