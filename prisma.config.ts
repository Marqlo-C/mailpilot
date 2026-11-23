import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

const HERMETIC_FALLBACK_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:5432/mailpilot";

/**
 * Prisma 7 CLI configuration.
 *
 * Prisma 7 no longer reads `datasource.url` from `schema.prisma` and no longer
 * auto-loads `.env`, so the connection string is resolved here. A hermetic
 * fallback URL is provided when `DATABASE_URL` is unset or empty so
 * `prisma generate` and `prisma validate` succeed without a live database.
 */
if (!("DATABASE_URL" in process.env) && existsSync(".env")) {
  process.loadEnvFile(".env");
}

const rawDatabaseUrl = process.env.DATABASE_URL?.trim();

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url:
      rawDatabaseUrl && rawDatabaseUrl.length > 0
        ? rawDatabaseUrl
        : HERMETIC_FALLBACK_DATABASE_URL,
  },
});
