import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import type { PoolConfig } from "pg";

const HERMETIC_FALLBACK_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:5432/mailpilot";

/**
 * Incremented whenever adapter/TLS pool configuration changes so `next dev` HMR
 * automatically discards any cached client built with older pool settings.
 */
const PRISMA_POOL_CONFIG_VERSION = 2;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaPoolConfigVersion: number | undefined;
};

/**
 * Returns true when the cached client predates newer schema models or pool config
 * and must be replaced after `prisma generate` or HMR.
 */
function isStalePrismaClient(
  client: PrismaClient | undefined,
  version: number | undefined
): boolean {
  if (!client || version !== PRISMA_POOL_CONFIG_VERSION) return true;
  const c = client as {
    persistentProfile?: unknown;
    subscriptionBriefing?: unknown;
  };
  return (
    typeof c.persistentProfile === "undefined" ||
    typeof c.subscriptionBriefing === "undefined"
  );
}

/**
 * Builds the `pg` pool config for the Prisma 7 driver adapter.
 *
 * - `connection_limit` is a Prisma 6 URL parameter that `pg` ignores, so it is
 *   mapped to the pool `max` to keep serverless connection usage bounded.
 * - `pg-connection-string` v2 treats `sslmode=require` in the URL as an alias
 *   for `verify-full` (`rejectUnauthorized: true`), which breaks managed
 *   PostgreSQL providers using project-scoped self-signed CAs (e.g. Aiven) when
 *   `DATABASE_CA_CERT` is not set. We strip `sslmode` from the URL and apply
 *   standard libpq / Prisma 6 `sslmode=require` semantics (`rejectUnauthorized: false`)
 *   unless `DATABASE_CA_CERT` or `sslmode=verify-full` / `verify-ca` is specified.
 * - The pool is lazy: no socket opens until the first query, so importing this
 *   module stays hermetic in tests and builds without `DATABASE_URL`.
 */
export function buildPoolConfig(
  databaseUrl: string | undefined,
  caCert: string | undefined
): PoolConfig {
  const effectiveUrl =
    databaseUrl && databaseUrl.trim().length > 0
      ? databaseUrl.trim()
      : HERMETIC_FALLBACK_DATABASE_URL;

  const config: PoolConfig = {};
  let connectionString = effectiveUrl;
  let sslmode: string | null = null;

  try {
    const url = new URL(effectiveUrl);
    const limit = Number(url.searchParams.get("connection_limit"));
    if (Number.isInteger(limit) && limit > 0) {
      config.max = limit;
    }
    sslmode = url.searchParams.get("sslmode")?.toLowerCase() ?? null;
    url.searchParams.delete("connection_limit");
    url.searchParams.delete("sslmode");
    connectionString = url.toString();
  } catch {
    // Non-URL connection strings are passed through to `pg` unchanged.
  }

  config.connectionString = connectionString;
  const trimmedCa = caCert?.trim();

  if (trimmedCa) {
    config.ssl = {
      ca: trimmedCa.replace(/\\n/g, "\n"),
      rejectUnauthorized: true,
    };
  } else if (sslmode === "disable") {
    config.ssl = false;
  } else if (sslmode === "verify-full" || sslmode === "verify-ca") {
    config.ssl = { rejectUnauthorized: true };
  } else if (
    sslmode === "require" ||
    sslmode === "prefer" ||
    sslmode === "no-verify"
  ) {
    config.ssl = { rejectUnauthorized: false };
  }

  return config;
}

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg(
    buildPoolConfig(process.env.DATABASE_URL, process.env.DATABASE_CA_CERT)
  );
  return new PrismaClient({ adapter });
}

const cached = globalForPrisma.prisma;
if (
  cached &&
  isStalePrismaClient(cached, globalForPrisma.prismaPoolConfigVersion)
) {
  void cached.$disconnect().catch(() => undefined);
  globalForPrisma.prisma = undefined;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaPoolConfigVersion = PRISMA_POOL_CONFIG_VERSION;
}
