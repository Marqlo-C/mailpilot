import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

const FEATURES = [
  "Zero-token profile sync",
  "Human-in-the-loop applications",
  "Automated newsletter cleanup",
] as const;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const href =
    params.next && params.next.startsWith("/")
      ? `/api/auth/google?next=${encodeURIComponent(params.next)}`
      : "/api/auth/google";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-200/50 via-background to-background dark:from-sky-950/40 dark:via-background dark:to-background"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl dark:bg-cyan-500/10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 bottom-1/4 h-80 w-80 rounded-full bg-amber-300/20 blur-3xl dark:bg-amber-500/10"
      />

      <div className="relative z-10 w-full max-w-md animate-in fade-in zoom-in-95 duration-700 ease-out">
        <div className="rounded-2xl border border-border/80 bg-card/80 p-8 shadow-xl shadow-sky-500/10 backdrop-blur-xl dark:shadow-sky-900/30">
          <div className="flex flex-col items-center text-center">
            <div className="relative mb-6">
              <div
                aria-hidden
                className="absolute inset-0 scale-150 rounded-full bg-sky-400/30 blur-2xl animate-pulse duration-1000 dark:bg-sky-500/20"
              />
              <Logo
                variant="full"
                size="lg"
                showWordmark={false}
                priority
                className="relative"
              />
            </div>

            <h1 className="text-3xl font-semibold tracking-tight">
              MailPilot+
            </h1>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Intelligent Inbox Triage & Autonomous Job Application Engine
            </p>

            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {FEATURES.map((label) => (
                <Badge key={label} variant="secondary" className="font-normal">
                  {label}
                </Badge>
              ))}
            </div>

            {params.error ? (
              <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                Sign-in failed: {params.error}
              </p>
            ) : null}

            <Button asChild size="lg" className="mt-8 w-full gap-2">
              <Link href={href}>
                <GoogleGlyph className="h-5 w-5" />
                Continue with Google
              </Link>
            </Button>

            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Secured via Google OAuth. Read, modify, and compose permissions
              are requested exclusively for mailbox automation.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
