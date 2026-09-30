/**
 * Runs once when the Next.js server starts (Node runtime).
 * Installs DOM geometry polyfills before SSR evaluates pdf-parse / pdf.js.
 * In development, clears hanging isSyncing locks left by interrupted after() work.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/polyfills");
  }

  if (process.env.NODE_ENV === "development") {
    const { prisma } = await import("@/lib/prisma");
    try {
      await prisma.account.updateMany({ data: { isSyncing: false } });
      console.log("[DevBoot] Cleared all hanging sync locks.");
      const softCleared = await prisma.jobOpportunity.updateMany({
        where: {
          isArchived: true,
          previousStatus: null,
          status: { not: "DISMISSED" },
        },
        data: { isArchived: false },
      });
      if (softCleared.count > 0) {
        console.log(
          `[DevBoot] Cleared ${softCleared.count} legacy score soft-archives.`
        );
      }
    } catch (error) {
      console.error("Failed to clear sync locks on boot:", error);
    }
  }
}
