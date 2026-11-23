import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ROOT_DIR,
  fileExists,
  readTextFile,
  readRootPackageJson,
  readInstalledPackageJson,
  parseSemver,
  gteSemver,
  ltSemver,
  resolveRoot,
} from "./helpers/e2e-fixtures.mjs";

function envWithoutDatabaseUrl(extra = {}) {
  const env = { ...process.env, ...extra };
  if (!("DATABASE_URL" in extra)) {
    delete env.DATABASE_URL;
  }
  return env;
}

function runPrisma(args, { cwd = ROOT_DIR, env = envWithoutDatabaseUrl() } = {}) {
  const prismaBin = resolveRoot("node_modules", ".bin", "prisma");
  return execFileSync(prismaBin, args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: "pipe",
  });
}

function walkTsFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".next" ||
      entry.name === "generated" ||
      entry.name === "__tests__"
    ) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTsFiles(full, acc);
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      acc.push(full);
    }
  }
  return acc;
}

afterEach(() => {
  vi.doUnmock("@/lib/core/prisma");
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

// ============================================================================
// F5 — Prisma 7 ORM Migration & Hermetic Client
// ============================================================================
describe("F5: Prisma 7 ORM Migration & Hermetic Client", () => {
  it("T1-F5-01: Prisma 7 packages, adapter-pg, prisma.config.ts, and schema.prisma structure", () => {
    const pkg = readRootPackageJson();
    expect(pkg.dependencies?.["@prisma/adapter-pg"]).toBeDefined();
    expect(pkg.dependencies?.pg).toBeDefined();

    const clientPkg = readInstalledPackageJson("@prisma/client");
    const cliPkg = readInstalledPackageJson("prisma");
    const adapterPkg = readInstalledPackageJson("@prisma/adapter-pg");
    expect(clientPkg).not.toBeNull();
    expect(cliPkg).not.toBeNull();
    expect(adapterPkg).not.toBeNull();
    expect(parseSemver(clientPkg.version).major).toBe(7);
    expect(parseSemver(cliPkg.version).major).toBe(7);
    expect(parseSemver(adapterPkg.version).major).toBe(7);

    expect(fileExists("prisma.config.ts")).toBe(true);
    const schema = readTextFile("prisma", "schema.prisma");
    const generatorMatch = schema.match(/generator\s+client\s*\{([\s\S]*?)\}/);
    expect(generatorMatch).not.toBeNull();
    expect(generatorMatch[1]).toMatch(/provider\s*=\s*"prisma-client"/);
    expect(generatorMatch[1]).toMatch(/\boutput\s*=/);

    const datasourceMatch = schema.match(/datasource\s+db\s*\{([\s\S]*?)\}/);
    expect(datasourceMatch).not.toBeNull();
    expect(datasourceMatch[1]).not.toMatch(/\burl\s*=/);
  });

  it("T1-F5-02: npx prisma validate succeeds hermetically with DATABASE_URL unset", () => {
    expect(fileExists("prisma.config.ts")).toBe(true);
    const out = runPrisma(["validate"]);
    expect(out.toLowerCase()).toContain("valid");
  });

  it("T1-F5-03: npx prisma generate succeeds hermetically inside isolated os.tmpdir() with DATABASE_URL unset", () => {
    expect(fileExists("prisma.config.ts")).toBe(true);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailpilot-prisma7-"));

    try {
      fs.symlinkSync(
        resolveRoot("node_modules"),
        path.join(tmpDir, "node_modules"),
        "dir"
      );
      const generatedDir = path.join(tmpDir, "generated");
      const schemaSrc = readTextFile("prisma", "schema.prisma");
      const rewrittenSchema = schemaSrc.replace(
        /output\s*=\s*["'][^"']+["']/,
        `output = ${JSON.stringify(generatedDir)}`
      );
      const tmpSchemaPath = path.join(tmpDir, "schema.prisma");
      fs.writeFileSync(tmpSchemaPath, rewrittenSchema, "utf8");

      const tmpConfigPath = path.join(tmpDir, "prisma.config.ts");
      fs.writeFileSync(
        tmpConfigPath,
        `import { defineConfig } from "prisma/config";
export default defineConfig({
  schema: ${JSON.stringify(tmpSchemaPath)},
  datasource: {
    url: process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/mailpilot_hermetic",
  },
});
`,
        "utf8"
      );

      runPrisma(["generate", "--config", tmpConfigPath], {
        cwd: tmpDir,
        env: envWithoutDatabaseUrl(),
      });

      expect(
        fs.existsSync(path.join(generatedDir, "client.ts")) ||
          fs.existsSync(path.join(generatedDir, "index.d.ts"))
      ).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("T1-F5-04: @/lib/core/prisma imports hermetically without DATABASE_URL and exposes model delegates", async () => {
    expect(fileExists("prisma.config.ts")).toBe(true);
    delete globalThis.prisma;
    const prevDbUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    vi.resetModules();

    try {
      const { prisma } = await import("@/lib/core/prisma");
      expect(prisma).toBeDefined();
      for (const delegate of [
        "account",
        "accountSettings",
        "persistentProfile",
        "subscriptionBriefing",
        "jobOpportunity",
        "$transaction",
        "$disconnect",
      ]) {
        expect(prisma[delegate], `Missing delegate ${delegate}`).toBeDefined();
      }
      await expect(prisma.$disconnect()).resolves.toBeUndefined();
    } finally {
      if (prevDbUrl !== undefined) {
        process.env.DATABASE_URL = prevDbUrl;
      }
      delete globalThis.prisma;
    }
  });

  it("T1-F5-05: standalone scripts avoid bare new PrismaClient() and cleanDeveloperRules runs hermetically", async () => {
    expect(fileExists("prisma.config.ts")).toBe(true);
    const scriptFiles = [
      ["scripts", "clean-developer-rules.ts"],
      ["scripts", "cleanup-duplicates.ts"],
      ["scripts", "archive", "revert-false-applied.ts"],
    ];

    for (const segments of scriptFiles) {
      const src = readTextFile(...segments);
      expect(
        src,
        `${segments.join("/")} must not instantiate bare new PrismaClient()`
      ).not.toMatch(/new\s+PrismaClient\s*\(\s*\)/);
    }

    const mockPrisma = {
      account: {
        findMany: vi.fn(async () => [
          {
            id: "acc_1",
            email: "candidate@example.com",
            settings: {
              rules: {
                featureFlags: { embedded_ai: false },
              },
            },
            persistentProfile: {
              id: "prof_1",
              permanentSettings: {
                rules: {},
              },
            },
          },
        ]),
      },
      accountSettings: { upsert: vi.fn(async () => ({})) },
      permanentSettings: { upsert: vi.fn(async () => ({})) },
      $disconnect: vi.fn(async () => undefined),
    };

    const envSnapshot = { ...process.env };
    try {
      const { cleanDeveloperRules } = await import(
        "@/scripts/clean-developer-rules"
      );
      const results = await cleanDeveloperRules({
        targetEmail: "candidate@example.com",
        prisma: mockPrisma,
      });

      expect(results).toHaveLength(1);
      expect(results[0].accountSettingsUpdated).toBe(true);
      expect(results[0].accountRules.embeddingProvider).toBe("local_ollama");
      expect(results[0].accountRules.featureFlags).toEqual({
        shadow_evaluation: true,
      });
      expect(mockPrisma.$disconnect).not.toHaveBeenCalled();
    } finally {
      for (const key of Object.keys(process.env)) {
        if (!(key in envSnapshot)) {
          delete process.env[key];
        }
      }
      for (const [key, val] of Object.entries(envSnapshot)) {
        process.env[key] = val;
      }
    }
  });

  it("T2-F5-01: Prisma version strictly locked to >=7.0.0 and <8.0.0 (no 6.x or 8.x RC)", () => {
    const clientPkg = readInstalledPackageJson("@prisma/client");
    const cliPkg = readInstalledPackageJson("prisma");
    expect(clientPkg).not.toBeNull();
    expect(cliPkg).not.toBeNull();

    expect(gteSemver(clientPkg.version, "7.0.0")).toBe(true);
    expect(ltSemver(clientPkg.version, "8.0.0")).toBe(true);
    expect(parseSemver(clientPkg.version).major).toBe(7);
    expect(parseSemver(clientPkg.version).prerelease).toBe(false);
    expect(gteSemver(cliPkg.version, "7.0.0")).toBe(true);
    expect(ltSemver(cliPkg.version, "8.0.0")).toBe(true);
    expect(parseSemver(cliPkg.version).major).toBe(7);
    expect(parseSemver(cliPkg.version).prerelease).toBe(false);
  });

  it("T2-F5-02: prisma/schema.prisma omits datasource.url (P1012 guard)", () => {
    const schema = readTextFile("prisma", "schema.prisma");
    const datasourceMatch = schema.match(/datasource\s+\w+\s*\{([\s\S]*?)\}/);
    expect(datasourceMatch).not.toBeNull();
    expect(datasourceMatch[1]).not.toMatch(/\burl\s*=/);
  });

  it("T2-F5-03: prisma.config.ts handles both unset and empty-string DATABASE_URL without PrismaConfigEnvError", () => {
    expect(fileExists("prisma.config.ts")).toBe(true);

    const outUnset = runPrisma(["validate"], {
      env: envWithoutDatabaseUrl(),
    });
    expect(outUnset.toLowerCase()).toContain("valid");

    const outEmpty = runPrisma(["validate"], {
      env: envWithoutDatabaseUrl({ DATABASE_URL: "" }),
    });
    expect(outEmpty.toLowerCase()).toContain("valid");
  });

  it("T2-F5-04: lib/core/prisma.ts creates lazy pool without opening DB socket on import", async () => {
    expect(fileExists("prisma.config.ts")).toBe(true);
    delete globalThis.prisma;
    const prevDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@127.0.0.1:1/unreachable_test_db";
    vi.resetModules();

    try {
      const start = Date.now();
      const { prisma } = await import("@/lib/core/prisma");
      const elapsed = Date.now() - start;
      expect(prisma).toBeDefined();
      expect(elapsed).toBeLessThan(3000);

      await expect(prisma.$disconnect()).resolves.toBeUndefined();
    } finally {
      if (prevDbUrl !== undefined) {
        process.env.DATABASE_URL = prevDbUrl;
      } else {
        delete process.env.DATABASE_URL;
      }
      delete globalThis.prisma;
    }
  });

  it("T2-F5-05: migration state inspection reports schema-only (db push) or valid non-empty migrations", () => {
    expect(fileExists("prisma", "schema.prisma")).toBe(true);
    const schema = readTextFile("prisma", "schema.prisma");
    expect(schema).toContain("model Account");
    expect(schema).toContain("model AccountSettings");

    const migrationsDir = resolveRoot("prisma", "migrations");
    if (fs.existsSync(migrationsDir)) {
      const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
      const sqlDirs = entries.filter((e) => e.isDirectory());
      for (const dir of sqlDirs) {
        const sqlFile = path.join(migrationsDir, dir.name, "migration.sql");
        expect(fs.existsSync(sqlFile)).toBe(true);
        expect(fs.readFileSync(sqlFile, "utf8").trim().length).toBeGreaterThan(
          0
        );
      }
    } else {
      // Repository uses `prisma db push` schema-only workflow; assert truthfully
      expect(fs.existsSync(migrationsDir)).toBe(false);
    }
  });

  it("T2-F5-06: zero stale bare '@prisma/client' imports remain across app/lib/components/hooks/scripts", async () => {
    expect(fileExists("prisma.config.ts")).toBe(true);
    const schema = readTextFile("prisma", "schema.prisma");
    const generatorMatch = schema.match(/generator\s+client\s*\{([\s\S]*?)\}/);
    expect(generatorMatch).not.toBeNull();
    expect(generatorMatch[1]).toMatch(/\boutput\s*=/);

    const scanRoots = ["app", "components", "hooks", "lib", "scripts"];
    const offenders = [];

    for (const root of scanRoots) {
      for (const file of walkTsFiles(resolveRoot(root))) {
        const text = fs.readFileSync(file, "utf8");
        if (/from\s+["']@prisma\/client["']/.test(text)) {
          offenders.push(path.relative(ROOT_DIR, file));
        }
      }
    }

    expect(offenders).toEqual([]);

    vi.doMock("@/lib/core/prisma", () => ({
      prisma: { account: { findUnique: vi.fn() } },
    }));
    const syncSvc = await import("@/lib/services/profile-sync.service");
    expect(typeof syncSvc.extractResumeDraft).toBe("function");
  });
});
