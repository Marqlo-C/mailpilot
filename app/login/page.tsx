import { GoogleSignInButton } from "./google-sign-in-button";
import { LoginBackgroundVideo } from "./login-background-video";
import { LoginTrustFooter } from "./login-trust-footer";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const href =
    params.next && params.next.startsWith("/")
      ? `/api/auth/google?intent=login&next=${encodeURIComponent(params.next)}`
      : "/api/auth/google?intent=login";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
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
                  className="size-[length:var(--brand-mark)] object-contain"
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
              <h1 className="mt-3 text-xl font-semibold tracking-tight">
                We&apos;re so glad you made it! But...
              </h1>
              <p className="mx-auto mt-3 w-[100%] rounded-lg border border-dashed border-[#ffab72] bg-amber-500/8 px-3 py-2 text-left text-[11px] leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">
                  NOTICE: Early-Access Only.
                </span>{" "}
                Mail Pilot is currently restricted to authorized accounts only. Please contact the{" "}
                <a
                  href="https://github.com/marqlo-c"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-muted-foreground underline underline-offset-2 transition-colors hover:text-muted-foreground/80"
                >
                  developer
                </a>{" "}
                if you wish to gain access.
              </p>
            </div>

            {params.error ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
                Sign-in failed: {params.error}
              </p>
            ) : null}

            <div className="space-y-2.5">
              <h2 className="text-center text-sm font-semibold tracking-tight">
                Sign In or Create an Account
              </h2>
              <GoogleSignInButton href={href} />
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <div className="h-px flex-1 bg-border" />
                <span>or</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <a
                href="https://github.com/Marqlo-C/mailpilot"
                target="_blank"
                rel="noopener noreferrer"
                className="group relative flex h-11 w-full items-center justify-center overflow-hidden rounded-lg border border-[#24292f]/15 bg-[#24292f] text-sm font-medium text-white shadow-sm"
              >
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-0 bg-[#9a2a84] transition-[width] duration-300 ease-out group-hover:w-full"
                />
                <span className="relative z-10 inline-flex items-center gap-2.5">
                  <svg
                    className="size-5 fill-current"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                  </svg>
                  Open Repo in GitHub
                </span>
              </a>
            </div>
          </div>

          <LoginTrustFooter />
        </div>
      </div>
    </main>
  );
}
