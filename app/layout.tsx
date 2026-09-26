import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";

import { AppShell } from "@/components/layout/app-shell";
import { SESSION_COOKIE } from "@/lib/constants";
import { getActiveAccount, listAccounts } from "@/lib/data";
import { Toaster } from "sonner";

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
      <html lang="en">
        <body
          className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}
        >
          {children}
          <Toaster richColors position="top-center" />
        </body>
      </html>
    );
  }

  const [accounts, active] = await Promise.all([
    listAccounts(),
    getActiveAccount(),
  ]);

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}
      >
        <AppShell
          accounts={accounts}
          activeAccountId={active?.id ?? null}
          activeEmail={active?.email ?? null}
          hasHistoryId={Boolean(active?.historyId)}
        >
          {children}
        </AppShell>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
