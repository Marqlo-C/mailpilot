"use client";

import { useEffect } from "react";

import { BRANDING } from "@/lib/constants/branding";
import { LoginAuthControls } from "@/components/features/login/google-sign-in-button";
import { LoginBackgroundVideo } from "@/components/features/login/login-background-video";
import { LOGIN_READY_SHELL_CLASSNAME } from "@/components/features/login/login-shell";
import { LoginTrustFooter } from "@/components/features/login/login-trust-footer";
import { restoreParkedExtensionNodesToBody } from "@/instrumentation-client";

/**
 * Login card + background. Spacing/type scale match `origin/main` login.
 * `id` is allowlisted by the extension park guard so `<main>` stays under body.
 */
export function LoginView() {
  useEffect(() => {
    restoreParkedExtensionNodesToBody();
  }, []);

  return (
    <main id="mailpilot-login-root" className={LOGIN_READY_SHELL_CLASSNAME}>
      <LoginBackgroundVideo />

      <div className="relative z-10 w-full max-w-sm animate-in fade-in zoom-in-95 duration-700 ease-out">
        <div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border bg-card shadow-xl">
          <div className="space-y-5 px-6 pb-3 pt-6 sm:px-8 sm:pb-3 sm:pt-8">
            <div className="text-center">
              <div className="mx-auto mb-1 flex flex-col items-center [--brand-mark:4rem] [--brand-stack-gap:calc(var(--brand-mark)*0.125)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logos/transparent-logo-only.png"
                  alt=""
                  width={64}
                  height={64}
                  decoding="async"
                  fetchPriority="high"
                  aria-hidden
                  className="size-[var(--brand-mark)] object-contain"
                />
                <span className="mt-[calc(var(--brand-stack-gap)-0.75rem)] inline-flex h-[calc(var(--brand-mark)*0.7)] max-w-[min(100%,calc(var(--brand-mark)*4))] items-center justify-center overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/logos/transparent-color-wordmark-inline.png"
                    alt="Mail Pilot"
                    width={320}
                    height={88}
                    decoding="async"
                    fetchPriority="high"
                    className="pointer-events-none h-[calc(var(--brand-mark)*1.375)] w-auto max-w-none object-contain"
                  />
                </span>
              </div>
              <h1 className="font-wordmark mt-3 text-2xl font-bold tracking-tight">
                We&apos;re so glad you made it! But...
              </h1>
              <p className="mx-auto mt-3 w-[100%] rounded-lg border border-dashed border-[#ffab72] bg-[#ffab72]/9 px-3 py-2 text-justify text-[10px] leading-relaxed text-muted-foreground">
                {/* Last push used invalid `text-[sm]`, so the label inherited 10px from the p. */}
                <span className="mb-0.5 block text-center text-[10px] font-medium text-foreground">
                  NOTICE (Early-Access Build) :
                </span>{" "}
                At this time, Mail Pilot is restricted to authorized accounts
                only. Please contact the{" "}
                <a
                  href={BRANDING.developerGithubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-muted-foreground underline underline-offset-2 transition-colors hover:text-muted-foreground/80"
                >
                  developer
                </a>{" "}
                if you wish to gain access.
              </p>
            </div>

            <LoginAuthControls />
          </div>

          <LoginTrustFooter />
        </div>
      </div>
    </main>
  );
}
