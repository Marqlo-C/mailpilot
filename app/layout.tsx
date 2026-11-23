import type { Metadata } from "next";
import { cookies } from "next/headers";
import localFont from "next/font/local";

import "@/lib/document/polyfills";

import {
  AppShell,
  PreHydrationExtensionGuard,
} from "@/components/layout/app-shell";
import { SESSION_COOKIE } from "@/lib/core/constants";
import {
  getActiveAccount,
  getSidebarTabCounts,
  listAccounts,
  type SidebarTabCounts,
} from "@/lib/data";
import { readServerUiPreferences } from "@/lib/utils/ui/ui-preferences-server";
import { AppToaster } from "@/components/ui/app-toaster";

import "./globals.css";

const geistSans = localFont({
  src: "../public/fonts/geist-sans.woff2",
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = localFont({
  src: "../public/fonts/geist-mono.woff2",
  variable: "--font-geist-mono",
  display: "swap",
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
          suppressHydrationWarning
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
        <PreHydrationExtensionGuard />
        {/* Sidebar "Mail Pilot" wordmark — preload so Duplet is ready before paint. */}
        <link
          rel="preload"
          href="/fonts/DupletRounded-Bold-BF6606345a47d2e.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body
        suppressHydrationWarning
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
          isDev={process.env.NODE_ENV === "development"}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
