import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";

import "@/lib/document/polyfills";

import { AppShell } from "@/components/layout/app-shell";
import { SESSION_COOKIE } from "@/lib/core/constants";
import {
  getActiveAccount,
  getSidebarTabCounts,
  listAccounts,
  type SidebarTabCounts,
} from "@/lib/data";
import { readServerUiPreferences } from "@/lib/ui/ui-preferences-server";
import { AppToaster } from "@/components/ui/app-toaster";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MailPilot+",
  description:
    "Intelligent inbox triage and autonomous job application engine",
  icons: {
    icon: "/logos/colored-logo-only.png",
    shortcut: "/logos/colored-logo-only.png",
    apple: "/logos/colored-logo-only.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const hasSession = Boolean(cookieStore.get(SESSION_COOKIE)?.value?.trim());

  if (!hasSession) {
    return (
      <html lang="en" suppressHydrationWarning>
        <body
          className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}
        >
          {children}
          <AppToaster />
        </body>
      </html>
    );
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
    <html
      lang="en"
      suppressHydrationWarning
      data-mp-tab-rail={
        initialUiPreferences.tabRail === "dark" ? "dark" : undefined
      }
      data-mp-rail-action={
        initialUiPreferences.railAction === "dark" ? "dark" : undefined
      }
      data-mp-toolbar={
        initialUiPreferences.toolbar === "dark" ? "dark" : undefined
      }
    >
      <head>
        {/* Sidebar "Mail Pilot" wordmark — preload so Duplet is ready before paint. */}
        <link
          rel="preload"
          href="/fonts/DupletRounded-Bold-BF6606345a47d2e.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        {active?.id ? (
          <script
            dangerouslySetInnerHTML={{
              __html: `(()=>{try{var id=${JSON.stringify(
                active.id
              )};var sc=function(n,v){var p=id.replace(/[^a-zA-Z0-9]/g,"_");document.cookie="mp_ui_"+n+"_"+p+"="+encodeURIComponent(v)+"; path=/; max-age=31536000; SameSite=Lax";document.cookie="mp_ui_"+n+"_global="+encodeURIComponent(v)+"; path=/; max-age=31536000; SameSite=Lax";};var tr=localStorage.getItem("mailpilot_tab_rail:"+id)||localStorage.getItem("mailpilot_tab_rail_global");if(tr==="dark"){document.documentElement.dataset.mpTabRail="dark";sc("tab_rail","dark");}else if(tr==="light"){delete document.documentElement.dataset.mpTabRail;sc("tab_rail","light");}var ra=localStorage.getItem("mailpilot_rail_action:"+id)||localStorage.getItem("mailpilot_rail_action_global");if(ra==="dark"){document.documentElement.dataset.mpRailAction="dark";sc("rail_action","dark");}else if(ra==="light"){delete document.documentElement.dataset.mpRailAction;sc("rail_action","light");}var tb=localStorage.getItem("mailpilot_toolbar:"+id)||localStorage.getItem("mailpilot_toolbar_global");if(tb==="dark"){document.documentElement.dataset.mpToolbar="dark";sc("toolbar","dark");}else if(tb==="light"){delete document.documentElement.dataset.mpToolbar;sc("toolbar","light");}var wm=localStorage.getItem("mailpilot_wavy_meter:"+id)||localStorage.getItem("mailpilot_wavy_meter_global");if(wm){sc("wavy_meter",wm);}var wt=localStorage.getItem("mailpilot_wave_toggle:"+id)||localStorage.getItem("mailpilot_wave_toggle_global");if(wt){sc("wave_toggle",wt);}}catch(e){}})();`,
            }}
          />
        ) : null}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}
      >
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
        >
          {children}
        </AppShell>
        <AppToaster />
      </body>
    </html>
  );
}
