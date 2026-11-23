import { describe, it, expect } from "vitest";
import { buildPoolConfig } from "../prisma";

describe("buildPoolConfig (Prisma 7 pg driver adapter TLS & pooling)", () => {
  it("strips sslmode=require from connectionString and sets ssl.rejectUnauthorized = false for self-signed CAs (e.g. Aiven)", () => {
    const cfg = buildPoolConfig(
      "postgres://user:pass@host.aivencloud.com:25060/defaultdb?sslmode=require&connection_limit=3",
      undefined
    );
    expect(cfg.max).toBe(3);
    expect(cfg.connectionString).not.toContain("sslmode=");
    expect(cfg.connectionString).not.toContain("connection_limit=");
    expect(cfg.ssl).toEqual({ rejectUnauthorized: false });
  });

  it("enforces rejectUnauthorized = true when DATABASE_CA_CERT is provided", () => {
    const cfg = buildPoolConfig(
      "postgres://user:pass@host.aivencloud.com:25060/defaultdb?sslmode=require",
      "-----BEGIN CERTIFICATE-----\\nMIIB...\\n-----END CERTIFICATE-----"
    );
    expect(cfg.connectionString).not.toContain("sslmode=");
    expect(cfg.ssl).toEqual({
      ca: "-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----",
      rejectUnauthorized: true,
    });
  });

  it("enforces rejectUnauthorized = true when sslmode=verify-full is specified", () => {
    const cfg = buildPoolConfig(
      "postgresql://user:pass@ep-cool.neon.tech/neondb?sslmode=verify-full",
      undefined
    );
    expect(cfg.connectionString).not.toContain("sslmode=");
    expect(cfg.ssl).toEqual({ rejectUnauthorized: true });
  });

  it("disables TLS when sslmode=disable is specified", () => {
    const cfg = buildPoolConfig(
      "postgresql://postgres:postgres@localhost:5432/mailpilot?sslmode=disable",
      undefined
    );
    expect(cfg.ssl).toBe(false);
  });
});
