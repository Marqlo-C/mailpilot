import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Returns true when the cached client predates newer schema models
 * and must be replaced after `prisma generate`.
 */
function isStalePrismaClient(client: PrismaClient | undefined): boolean {
  if (!client) return true;
  const c = client as {
    persistentProfile?: unknown;
    subscriptionBriefing?: unknown;
  };
  return (
    typeof c.persistentProfile === "undefined" ||
    typeof c.subscriptionBriefing === "undefined"
  );
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient();
}

const cached = globalForPrisma.prisma;
if (cached && isStalePrismaClient(cached)) {
  void cached.$disconnect().catch(() => undefined);
  globalForPrisma.prisma = undefined;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
