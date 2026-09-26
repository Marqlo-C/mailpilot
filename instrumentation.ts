/**
 * Runs once when the Next.js server starts (Node runtime).
 * Installs DOM geometry polyfills before SSR evaluates pdf-parse / pdf.js.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/polyfills");
  }
}
