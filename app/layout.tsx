import type { Metadata } from "next";
import localFont from "next/font/local";

import "@/lib/document/polyfills";

import { PreHydrationExtensionGuard } from "@/components/layout/app-shell";
import { AppToaster } from "@/components/ui/app-toaster";

import "./globals.css";

const geistSans = localFont({
  src: "../public/fonts/geist-sans.woff2",
  variable: "--font-geist-sans",
  display: "swap",
  // Size-adjusted fallbacks render Times-like; only Duplet+Geist should show.
  adjustFontFallback: false,
});

const geistMono = localFont({
  src: "../public/fonts/geist-mono.woff2",
  variable: "--font-geist-mono",
  display: "swap",
  adjustFontFallback: false,
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

/**
 * Sync document shell only. Session/AppShell live in `app/(app)/layout.tsx`
 * so `/login` is never under an `await cookies()` Suspense boundary
 * (that was hydrating as main vs Suspense).
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="preload"
          href="/fonts/DupletRounded-Bold-BF6606345a47d2e.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/DupletRounded-Semibold-BF6606345a87ef5.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <PreHydrationExtensionGuard />
      </head>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} ${geistSans.className} min-h-dvh antialiased`}
      >
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
