import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ROOT_DIR,
  fileExists,
  readTextFile,
  readJsonFile,
  readRootPackageJson,
  readInstalledPackageJson,
  parseSemver,
  gteSemver,
  ltSemver,
  resolveRoot,
} from "./helpers/e2e-fixtures.mjs";

function runEslint(args) {
  const eslintBin = resolveRoot("node_modules", ".bin", "eslint");
  return execFileSync(eslintBin, args, {
    cwd: ROOT_DIR,
    encoding: "utf8",
    stdio: "pipe",
  });
}

afterEach(() => {
  vi.doUnmock("next/server");
  vi.doUnmock("@/lib/gmail/sync");
  vi.doUnmock("next/cache");
  vi.doUnmock("@/lib/core/auth");
  vi.doUnmock("@/lib/core/ratelimit");
  vi.doUnmock("@/lib/gmail/historical-scan");
  vi.doUnmock("@/lib/services/sync-orchestration.service");
  vi.doUnmock("@/lib/core/prisma");
  vi.doUnmock("@vercel/blob");
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

// ============================================================================
// F1 — Core Framework Upgrade (Next.js >= 16.4.6, Runtime, Config, Actions)
// ============================================================================
describe("F1: Core Framework Upgrade & Runtime", () => {
  it("T1-F1-01: package.json & node_modules resolve next >= 16.4.6 and matching eslint-config-next", () => {
    const pkg = readRootPackageJson();
    const nextSpec = pkg.dependencies?.next ?? "";
    const eslintNextSpec = pkg.devDependencies?.["eslint-config-next"] ?? "";

    expect(nextSpec).not.toMatch(/(?:^|[^\d.])15\./);
    expect(eslintNextSpec).not.toMatch(/(?:^|[^\d.])15\./);

    const installedNext = readInstalledPackageJson("next");
    const installedEslintNext = readInstalledPackageJson("eslint-config-next");

    expect(installedNext).not.toBeNull();
    expect(installedEslintNext).not.toBeNull();
    expect(gteSemver(installedNext.version, "16.4.6")).toBe(true);
    expect(gteSemver(installedEslintNext.version, "16.4.6")).toBe(true);
    expect(parseSemver(installedNext.version).major).toBe(16);
    expect(parseSemver(installedEslintNext.version).major).toBe(
      parseSemver(installedNext.version).major
    );
  });

  it("T1-F1-02: Gmail webhook returns 200 immediately and schedules processInboxDelta via after()", async () => {
    vi.resetModules();
    vi.stubEnv("GMAIL_WEBHOOK_SECRET", "webhook-secret-12345");

    const afterCallbacks = [];
    const processInboxDeltaMock = vi.fn(async () => ({ processed: 1 }));

    vi.doMock("next/server", async (importOriginal) => {
      const actual = await importOriginal();
      return {
        ...actual,
        after: vi.fn((cb) => {
          afterCallbacks.push(cb);
        }),
      };
    });
    vi.doMock("@/lib/gmail/sync", () => ({
      processInboxDelta: processInboxDeltaMock,
    }));

    const { NextRequest } = await import("next/server");
    const { POST } = await import("@/app/api/webhooks/gmail/route");

    const encoded = Buffer.from(
      JSON.stringify({ emailAddress: "candidate@example.com", historyId: 9001 })
    ).toString("base64");

    const req = new NextRequest(
      "https://app.test/api/webhooks/gmail?token=webhook-secret-12345",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: { data: encoded } }),
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(afterCallbacks).toHaveLength(1);
    expect(processInboxDeltaMock).not.toHaveBeenCalled();

    await afterCallbacks[0]();
    expect(processInboxDeltaMock).toHaveBeenCalledWith(
      "candidate@example.com",
      "9001"
    );
  });

  it("T1-F1-03: next.config.ts preserves serverExternalPackages & outputFileTracingIncludes", async () => {
    const mod = await import("@/next.config.ts");
    const nextConfig = mod.default;
    expect(nextConfig).toBeDefined();
    expect(Array.isArray(nextConfig.serverExternalPackages)).toBe(true);
    for (const pkgName of [
      "pdfkit",
      "pdf-parse",
      "pdfjs-dist",
      "@react-pdf/renderer",
      "mammoth",
    ]) {
      expect(nextConfig.serverExternalPackages).toContain(pkgName);
    }
    expect(nextConfig.outputFileTracingIncludes).toBeDefined();
    const tracedValues = Object.values(nextConfig.outputFileTracingIncludes).flat();
    expect(tracedValues.some((v) => v.includes("pdfkit"))).toBe(true);
    expect(tracedValues.some((v) => v.includes("pdfjs-dist"))).toBe(true);
  });

  it("T1-F1-04: Server Actions declare 'use server', export async functions, and schedule after()", async () => {
    const actionsDir = resolveRoot("app", "actions");
    const actionFiles = fs
      .readdirSync(actionsDir)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"));
    expect(actionFiles.length).toBeGreaterThan(0);

    for (const file of actionFiles) {
      const src = readTextFile("app", "actions", file);
      expect(src.trimStart().startsWith('"use server";')).toBe(true);
    }

    vi.resetModules();
    const afterCallbacks = [];
    const revalidatePathMock = vi.fn();
    const scanHistoricalMock = vi.fn(async () => ({ jobsFound: 3 }));
    const finalizeAccountSyncMock = vi.fn(async () => undefined);

    vi.doMock("next/server", async (importOriginal) => {
      const actual = await importOriginal();
      return {
        ...actual,
        after: vi.fn((cb) => {
          afterCallbacks.push(cb);
        }),
      };
    });
    vi.doMock("next/cache", () => ({
      revalidatePath: revalidatePathMock,
    }));
    vi.doMock("@/lib/core/auth", () => ({
      auth: vi.fn(async () => ({ accountId: "acc_1" })),
      getAuthenticatedAccountId: vi.fn(async () => "acc_1"),
      getSessionToken: vi.fn(async () => "acc_1"),
    }));
    vi.doMock("@/lib/core/ratelimit", () => ({
      checkRateLimit: vi.fn(async () => ({
        success: true,
        remaining: 10,
        reset: Date.now() + 1000,
        limit: 10,
      })),
    }));
    vi.doMock("@/lib/gmail/historical-scan", () => ({
      scanHistoricalEmails: scanHistoricalMock,
    }));
    vi.doMock("@/lib/services/sync-orchestration.service", () => ({
      getAccountScanTarget: vi.fn(async () => ({
        id: "acc_1",
        isActive: true,
        isSyncing: false,
      })),
      markAccountSyncStarted: vi.fn(async () => undefined),
      finalizeAccountSync: finalizeAccountSyncMock,
      readAccountSyncStatus: vi.fn(async () => ({ ok: true, data: {} })),
    }));

    const { triggerHistoricalScan } = await import("@/app/actions/scan");
    const result = await triggerHistoricalScan("acc_1", 5);
    expect(result).toEqual({
      success: true,
      ok: true,
      data: { message: "Sync started in background" },
    });
    expect(afterCallbacks).toHaveLength(1);
    await afterCallbacks[0]();
    expect(scanHistoricalMock).toHaveBeenCalledWith("acc_1", 5);
    expect(revalidatePathMock).toHaveBeenCalledWith("/");
    expect(revalidatePathMock).toHaveBeenCalledWith("/subscriptions");
    expect(revalidatePathMock).toHaveBeenCalledWith("/jobs");
    expect(finalizeAccountSyncMock).toHaveBeenCalledWith("acc_1", {
      errorMessage: null,
      jobsFound: 3,
    });
  });

  it("T1-F1-05: Next.js 16 runtime after() export, tsconfig.json & build script compatibility", async () => {
    const nextServer = await import("next/server");
    expect(typeof nextServer.after).toBe("function");

    const tsconfig = readJsonFile("tsconfig.json");
    expect(tsconfig.compilerOptions?.strict).toBe(true);
    expect(tsconfig.compilerOptions?.noEmit).toBe(true);
    expect(tsconfig.compilerOptions?.paths?.["@/*"]).toEqual(["./*"]);
    expect(["preserve", "react-jsx"]).toContain(tsconfig.compilerOptions?.jsx);
    expect(
      tsconfig.compilerOptions?.plugins?.some((p) => p?.name === "next")
    ).toBe(true);

    const pkg = readRootPackageJson();
    expect(pkg.scripts?.build).toContain("next build");
  });

  it("T2-F1-01: rejects Next.js < 16.4.6 or major version mismatch with eslint-config-next", () => {
    const installedNext = readInstalledPackageJson("next");
    const installedEslintNext = readInstalledPackageJson("eslint-config-next");

    expect(installedNext).not.toBeNull();
    expect(installedEslintNext).not.toBeNull();
    expect(ltSemver(installedNext.version, "16.4.6")).toBe(false);
    expect(ltSemver(installedEslintNext.version, "16.4.6")).toBe(false);
    expect(parseSemver(installedNext.version).major).toBe(
      parseSemver(installedEslintNext.version).major
    );
  });

  it("T2-F1-02: Gmail webhook returns 401 on missing or 1-char-wrong token without calling after()", async () => {
    vi.resetModules();
    vi.stubEnv("GMAIL_WEBHOOK_SECRET", "exact-token-999");

    const afterMock = vi.fn();
    vi.doMock("next/server", async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, after: afterMock };
    });
    vi.doMock("@/lib/gmail/sync", () => ({
      processInboxDelta: vi.fn(),
    }));

    const { NextRequest } = await import("next/server");
    const { POST } = await import("@/app/api/webhooks/gmail/route");

    const missingRes = await POST(
      new NextRequest("https://app.test/api/webhooks/gmail", { method: "POST" })
    );
    expect(missingRes.status).toBe(401);

    const wrongRes = await POST(
      new NextRequest(
        "https://app.test/api/webhooks/gmail?token=exact-token-998",
        { method: "POST" }
      )
    );
    expect(wrongRes.status).toBe(401);
    expect(await wrongRes.json()).toEqual({ error: "Unauthorized" });
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("T2-F1-03: Gmail webhook returns 200 { status: 'ignored' } for malformed JSON or invalid base64", async () => {
    vi.resetModules();
    vi.stubEnv("GMAIL_WEBHOOK_SECRET", "exact-token-999");

    const afterMock = vi.fn();
    vi.doMock("next/server", async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, after: afterMock };
    });
    vi.doMock("@/lib/gmail/sync", () => ({
      processInboxDelta: vi.fn(),
    }));

    const { NextRequest } = await import("next/server");
    const { POST } = await import("@/app/api/webhooks/gmail/route");

    const badJsonRes = await POST(
      new NextRequest(
        "https://app.test/api/webhooks/gmail?token=exact-token-999",
        { method: "POST", body: "{not-json" }
      )
    );
    expect(badJsonRes.status).toBe(200);
    expect(await badJsonRes.json()).toEqual({ status: "ignored" });

    const badPayloadRes = await POST(
      new NextRequest(
        "https://app.test/api/webhooks/gmail?token=exact-token-999",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: { data: Buffer.from("not-json").toString("base64") },
          }),
        }
      )
    );
    expect(badPayloadRes.status).toBe(200);
    expect(await badPayloadRes.json()).toEqual({ status: "ignored" });
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("T2-F1-04: Gmail webhook after() contains async errors without rejecting webhook response", async () => {
    vi.resetModules();
    vi.stubEnv("GMAIL_WEBHOOK_SECRET", "exact-token-999");

    const afterCallbacks = [];
    vi.doMock("next/server", async (importOriginal) => {
      const actual = await importOriginal();
      return {
        ...actual,
        after: vi.fn((cb) => {
          afterCallbacks.push(cb);
        }),
      };
    });
    vi.doMock("@/lib/gmail/sync", () => ({
      processInboxDelta: vi.fn(async () => {
        throw new Error("Simulated transient delta failure");
      }),
    }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { NextRequest } = await import("next/server");
    const { POST } = await import("@/app/api/webhooks/gmail/route");

    const encoded = Buffer.from(
      JSON.stringify({ emailAddress: "user@example.com", historyId: "42" })
    ).toString("base64");
    const res = await POST(
      new NextRequest(
        "https://app.test/api/webhooks/gmail?token=exact-token-999",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: { data: encoded } }),
        }
      )
    );
    expect(res.status).toBe(200);
    expect(afterCallbacks).toHaveLength(1);
    await expect(afterCallbacks[0]()).resolves.toBeUndefined();
  });

  it("T2-F1-05: next.config.ts ensures all 5 document packages remain externalized with tracing paths", async () => {
    const mod = await import("@/next.config.ts");
    const cfg = mod.default;
    const required = [
      "pdfkit",
      "pdf-parse",
      "pdfjs-dist",
      "@react-pdf/renderer",
      "mammoth",
    ];
    for (const pkg of required) {
      expect(cfg.serverExternalPackages).toContain(pkg);
    }
    expect(Object.keys(cfg.outputFileTracingIncludes ?? {}).length).toBeGreaterThan(0);
  });
});

// ============================================================================
// F2 — Proxy & ESLint CLI Migration
// ============================================================================
describe("F2: Proxy & ESLint Flat Config Migration", () => {
  it("T1-F2-01: proxy.ts replaces middleware.ts and exports proxy() + config.matcher", async () => {
    expect(fileExists("middleware.ts")).toBe(false);
    expect(fileExists("proxy.ts")).toBe(true);

    const src = readTextFile("proxy.ts");
    expect(src).not.toMatch(/runtime\s*=\s*["']edge["']/);

    const mod = await import("@/proxy");
    expect(typeof mod.proxy).toBe("function");
    expect(Array.isArray(mod.config?.matcher)).toBe(true);
    expect(mod.config.matcher.length).toBeGreaterThan(0);
  });

  it("T1-F2-02: unauthenticated protected route redirects 307 to /login?next=%2Fsettings", async () => {
    expect(fileExists("proxy.ts")).toBe(true);
    const { NextRequest } = await import("next/server");
    const { proxy } = await import("@/proxy");

    const res = proxy(new NextRequest("https://app.test/settings"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://app.test/login?next=%2Fsettings"
    );
  });

  it("T1-F2-03: authenticated user hitting /login redirects 307 to /", async () => {
    expect(fileExists("proxy.ts")).toBe(true);
    const { NextRequest } = await import("next/server");
    const { proxy } = await import("@/proxy");

    const req = new NextRequest("https://app.test/login", {
      headers: { cookie: "mailpilot_session=acc_123" },
    });
    const res = proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.test/");
  });

  it("T1-F2-04: public paths bypass auth redirect", async () => {
    expect(fileExists("proxy.ts")).toBe(true);
    const { NextRequest } = await import("next/server");
    const { proxy } = await import("@/proxy");

    for (const pathname of [
      "/login",
      "/api/auth/callback/google",
      "/logos/brand.png",
      "/favicon.ico",
    ]) {
      const res = proxy(new NextRequest(`https://app.test${pathname}`));
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    }
  });

  it("T1-F2-05: ESLint flat config replaces .eslintrc.json and 'lint' runs 'eslint .'", async () => {
    expect(fileExists(".eslintrc.json")).toBe(false);
    expect(fileExists("eslint.config.mjs")).toBe(true);

    const pkg = readRootPackageJson();
    expect(pkg.scripts?.lint).toBe("eslint .");

    const eslintConfigMod = await import("@/eslint.config.mjs");
    expect(Array.isArray(eslintConfigMod.default)).toBe(true);
    expect(eslintConfigMod.default.length).toBeGreaterThan(0);

    expect(fileExists("proxy.ts")).toBe(true);
    const out = runEslint([
      "--max-warnings=0",
      "proxy.ts",
      "eslint.config.mjs",
      "e2e/vitest.e2e.config.mjs",
    ]);
    expect(typeof out).toBe("string");
  });

  it("T2-F2-01: legacy middleware.ts must not exist alongside proxy.ts", () => {
    expect(fileExists("middleware.ts")).toBe(false);
  });

  it("T2-F2-02: unauthenticated '/' omits ?next= while nested '/jobs/123' preserves ?next=%2Fjobs%2F123", async () => {
    expect(fileExists("proxy.ts")).toBe(true);
    const { NextRequest } = await import("next/server");
    const { proxy } = await import("@/proxy");

    const rootRes = proxy(new NextRequest("https://app.test/"));
    expect(rootRes.status).toBe(307);
    expect(rootRes.headers.get("location")).toBe("https://app.test/login");

    const nestedRes = proxy(new NextRequest("https://app.test/jobs/123"));
    expect(nestedRes.status).toBe(307);
    expect(nestedRes.headers.get("location")).toBe(
      "https://app.test/login?next=%2Fjobs%2F123"
    );
  });

  it("T2-F2-03: whitespace-only or empty session cookie redirects unauthenticated /dashboard", async () => {
    expect(fileExists("proxy.ts")).toBe(true);
    const { NextRequest } = await import("next/server");
    const { proxy } = await import("@/proxy");

    for (const cookieVal of ["", "   ", "%20%20%20"]) {
      const req = new NextRequest("https://app.test/dashboard", {
        headers: { cookie: `mailpilot_session=${cookieVal}` },
      });
      const res = proxy(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe(
        "https://app.test/login?next=%2Fdashboard"
      );
    }
  });

  it("T2-F2-04: prefix boundary matching distinguishes /api/auth/* vs /api/auth-evil and /settings/* vs /settings-public", async () => {
    expect(fileExists("proxy.ts")).toBe(true);
    const { NextRequest } = await import("next/server");
    const { proxy } = await import("@/proxy");

    const authSession = proxy(new NextRequest("https://app.test/api/auth/session"));
    expect(authSession.status).toBe(200);
    expect(authSession.headers.get("location")).toBeNull();

    // /api/auth-evil does not match /api/auth/* prefix and is not a protected UI route
    const authEvil = proxy(new NextRequest("https://app.test/api/auth-evil"));
    expect(authEvil.status).toBe(200);
    expect(authEvil.headers.get("location")).toBeNull();

    const settingsNested = proxy(
      new NextRequest("https://app.test/settings/profile")
    );
    expect(settingsNested.status).toBe(307);
    expect(settingsNested.headers.get("location")).toBe(
      "https://app.test/login?next=%2Fsettings%2Fprofile"
    );

    const settingsPublic = proxy(
      new NextRequest("https://app.test/settings-public")
    );
    expect(settingsPublic.status).toBe(200);
    expect(settingsPublic.headers.get("location")).toBeNull();
  });

  it("T2-F2-05: eslint.config.mjs ignores generated artifacts and e2e/ lints with 0 warnings", async () => {
    expect(fileExists("eslint.config.mjs")).toBe(true);
    const cfgMod = await import("@/eslint.config.mjs");
    const ignoredPatterns = cfgMod.default.flatMap(
      (entry) => entry?.ignores ?? []
    );
    expect(ignoredPatterns.some((p) => p.includes(".next"))).toBe(true);
    expect(ignoredPatterns.some((p) => p.includes("extension/dist"))).toBe(
      true
    );

    const out = runEslint(["--max-warnings=0", "e2e/"]);
    expect(typeof out).toBe("string");
  });

  it("T2-F2-06: ESLint flat config cleanly lints representative app/ and lib/ modules", () => {
    expect(fileExists("eslint.config.mjs")).toBe(true);
    const out = runEslint([
      "app/actions/scan.ts",
      "lib/core/ssrf.ts",
      "lib/validations/rules.schema.ts",
    ]);
    expect(typeof out).toBe("string");
  });
});

// ============================================================================
// F3 — AGENTS.md Next.js 16 Alignment
// ============================================================================
describe("F3: AGENTS.md Next.js 16 Guidance Alignment", () => {
  it("T1-F3-01: AGENTS.md states Next.js 16 framework baseline", () => {
    const content = readTextFile("AGENTS.md");
    expect(content).toMatch(/Next\.js\s+16/i);
  });

  it("T1-F3-02: AGENTS.md documents Next.js 16 after() for /api/webhooks/gmail", () => {
    const content = readTextFile("AGENTS.md");
    expect(content).toMatch(/\/api\/webhooks\/gmail/);
    expect(content).toMatch(/Next\.js\s+16\s+`?after\(\)`?/i);
  });

  it("T1-F3-03: AGENTS.md aligns with Next.js 16 tooling without stale next lint or middleware.ts mandates", () => {
    const content = readTextFile("AGENTS.md");
    expect(content).toContain("proxy.ts");
    expect(content).toContain("eslint.config.mjs");
    expect(content).toContain("eslint .");
    const withoutMigrationNotes = content
      .replace(/replaces legacy `middleware\.ts`/gi, "")
      .replace(/replacing deprecated `next lint`/gi, "");
    expect(withoutMigrationNotes).not.toMatch(/`?next lint`?/i);
    expect(withoutMigrationNotes).not.toMatch(/\bmiddleware\.ts\b/i);
  });

  it("T1-F3-04: AGENTS.md preserves core architecture, OAuth, strict TS, SSOT, and career-agnosticism rules", () => {
    const content = readTextFile("AGENTS.md");
    expect(content).toContain("accountRulesSchema");
    expect(content).toContain("gmail.modify");
    expect(content).toContain("gmail.compose");
    expect(content).toContain("access_type: \"offline\"");
    expect(content).toContain("Single Source of Truth");
    expect(content).toContain("100% Career Agnosticism & Neutrality");
  });

  it("T1-F3-05: directories enumerated in AGENTS.md Target Directory Blueprint exist", () => {
    for (const dir of ["app", "components", "hooks", "lib", "extension", "prisma"]) {
      expect(fs.statSync(resolveRoot(dir)).isDirectory()).toBe(true);
    }
  });

  it("T2-F3-01: zero residual Next.js 15, next lint, or middleware.ts drift in AGENTS.md", () => {
    const content = readTextFile("AGENTS.md");
    expect(content).not.toMatch(/Next\.js\s+15/i);
    const withoutMigrationNotes = content
      .replace(/replaces legacy `middleware\.ts`/gi, "")
      .replace(/replacing deprecated `next lint`/gi, "");
    expect(withoutMigrationNotes).not.toMatch(/\bnext lint\b/i);
    expect(withoutMigrationNotes).not.toMatch(/\bmiddleware\.ts\b/i);
  });

  it("T2-F3-02: AGENTS.md retains 100% Career Agnosticism & Zero Hardcoding invariants", () => {
    const content = readTextFile("AGENTS.md");
    expect(content).toContain("Zero Discipline Bias");
    expect(content).toContain("Verbatim Document Anchoring");
    expect(content).toContain("Zero Hardcoding");
  });

  it("T2-F3-03: AGENTS.md retains AccountSettings.rules Json + accountRulesSchema rule", () => {
    const content = readTextFile("AGENTS.md");
    expect(content).toContain("rules Json");
    expect(content).toContain("accountRulesSchema");
  });

  it("T2-F3-04: AGENTS.md retains Hermetic Testing & __tests__/ co-location rule", () => {
    const content = readTextFile("AGENTS.md");
    expect(content).toContain("Hermetic Testing");
    expect(content).toContain("__tests__/");
    expect(content).toContain("kebab-case");
  });

  it("T2-F3-05: AGENTS.md retains strict TypeScript (no any) & Zod payload validation rule", () => {
    const content = readTextFile("AGENTS.md");
    expect(content).toContain("No `any` types");
    expect(content).toContain("Validate incoming payloads with Zod");
  });
});

// ============================================================================
// F4 — Peripheral Libraries & Version Pins
// ============================================================================
describe("F4: Peripheral Libraries & Version Pins", () => {
  it("T1-F4-01: upgraded peripherals resolve exact target versions", () => {
    const targets = {
      googleapis: "190.0.0",
      "lucide-react": "1.77.0",
      zod: "4.6.7",
      "@vercel/blob": "2.9.0",
    };

    for (const [pkgName, minVer] of Object.entries(targets)) {
      const installed = readInstalledPackageJson(pkgName);
      expect(installed, `${pkgName} missing in node_modules`).not.toBeNull();
      expect(gteSemver(installed.version, minVer)).toBe(true);
      expect(parseSemver(installed.version).major).toBe(
        parseSemver(minVer).major
      );
    }
  });

  it("T1-F4-02: tailwindcss remains pinned on v3 (^3.4.19) and dev tools stay on expected majors", () => {
    const pkg = readRootPackageJson();
    expect(pkg.devDependencies?.tailwindcss).toBe("^3.4.19");

    const tw = readInstalledPackageJson("tailwindcss");
    expect(tw).not.toBeNull();
    expect(parseSemver(tw.version).major).toBe(3);

    expect(parseSemver(readInstalledPackageJson("vitest").version).major).toBe(4);
    expect(parseSemver(readInstalledPackageJson("playwright").version).major).toBe(1);
    expect(parseSemver(readInstalledPackageJson("eslint").version).major).toBe(9);
    expect(parseSemver(readInstalledPackageJson("typescript").version).major).toBe(5);
  });

  it("T1-F4-03: zod validates MailPilot SSOT schemas cleanly", async () => {
    const { parseAccountRules } = await import("@/lib/validations/rules.schema");
    const { bridgeBodySchema } = await import("@/lib/validations/settings.schema");
    const { pubSubBodySchema, gmailNotificationSchema } = await import(
      "@/lib/validations/gmail-webhook.schema"
    );
    const { scanInputSchema } = await import("@/lib/validations/sync.schema");

    const rules = parseAccountRules({});
    expect(rules.rejectionMode).toBe("LABEL_ONLY");
    expect(rules.allowCloudFallback).toBe(true);

    expect(
      bridgeBodySchema.safeParse({
        email: "user@example.com",
        ollamaUrl: "https://demo.trycloudflare.com",
        bridgeSecret: "sec-1234",
      }).success
    ).toBe(true);

    expect(
      pubSubBodySchema.safeParse({ message: { data: "e30=" } }).success
    ).toBe(true);

    expect(
      gmailNotificationSchema.parse({
        emailAddress: "user@example.com",
        historyId: 42,
      })
    ).toEqual({ emailAddress: "user@example.com", historyId: "42" });

    expect(
      scanInputSchema.safeParse({ accountId: "acc_1", days: 15 }).success
    ).toBe(true);
  });

  it("T1-F4-04: googleapis initializes OAuth2 authorization URL and Gmail v1 client", async () => {
    vi.resetModules();
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("GOOGLE_REDIRECT_URI", "https://app.test/api/auth/callback/google");

    vi.doMock("@/lib/core/prisma", () => ({ prisma: {} }));

    const {
      getAuthorizationUrl,
      getGmailClient,
      isInsufficientScopeError,
      GMAIL_SCOPES,
    } = await import("@/lib/gmail/google");

    const authUrl = new URL(getAuthorizationUrl("e2e-state"));
    expect(authUrl.searchParams.get("access_type")).toBe("offline");
    expect(authUrl.searchParams.get("prompt")).toBe("consent");
    expect(authUrl.searchParams.get("state")).toBe("e2e-state");
    const scopeParam = authUrl.searchParams.get("scope") ?? "";
    for (const scope of GMAIL_SCOPES) {
      expect(scopeParam).toContain(scope);
    }

    const gmail = getGmailClient({
      accessToken: "fake-access-token",
      refreshToken: "fake-refresh-token",
      expiryDate: new Date(Date.now() + 3600_000),
    });
    expect(typeof gmail.users.getProfile).toBe("function");
    expect(typeof gmail.users.labels.list).toBe("function");
    expect(typeof gmail.users.watch).toBe("function");

    expect(
      isInsufficientScopeError({
        response: {
          status: 403,
          data: { error: { message: "Insufficient Authentication Scopes" } },
        },
      })
    ).toBe(true);
    expect(isInsufficientScopeError(new Error("network timeout"))).toBe(false);
  });

  it("T1-F4-05: lucide-react and @vercel/blob export required symbols cleanly", async () => {
    const lucide = await import("lucide-react");
    for (const name of [
      "Mail",
      "Briefcase",
      "Settings",
      "Sparkles",
      "Shield",
      "RefreshCw",
      "Trash2",
      "AlertTriangle",
    ]) {
      const icon = lucide[name];
      expect(icon, `Missing lucide-react icon ${name}`).toBeDefined();
      const validShape =
        typeof icon === "function" ||
        (typeof icon === "object" && icon !== null && "render" in icon);
      expect(validShape).toBe(true);
    }

    const blob = await import("@vercel/blob");
    expect(typeof blob.get).toBe("function");
    expect(typeof blob.put).toBe("function");
  });

  it("T1-F4-06: Tailwind v3 + PostCSS compiles app/globals.css in memory without v4 errors", async () => {
    const postcss = (await import("postcss")).default;
    const tailwindcss = (await import("tailwindcss")).default;
    const globalsCss = readTextFile("app", "globals.css");
    const result = await postcss([
      tailwindcss(resolveRoot("tailwind.config.ts")),
    ]).process(globalsCss, {
      from: resolveRoot("app", "globals.css"),
    });

    expect(result.warnings()).toHaveLength(0);
    expect(result.css.length).toBeGreaterThan(1000);
    expect(result.css).toContain("--background");
    expect(result.css).toContain(".font-brand");
  });

  it("T2-F4-01: Tailwind CSS v4 regression guard enforces < 4.0.0 and tailwindcss-animate", () => {
    const pkg = readRootPackageJson();
    expect(pkg.devDependencies?.["tailwindcss-animate"]).toBe("^1.0.7");
    expect(fileExists("tailwind.config.ts")).toBe(true);

    const tw = readInstalledPackageJson("tailwindcss");
    expect(ltSemver(tw.version, "4.0.0")).toBe(true);
    const postcssSrc = readTextFile("postcss.config.mjs");
    expect(postcssSrc).not.toContain("@tailwindcss/postcss");
  });

  it("T2-F4-02: guards against unnecessary major bumps on vitest, playwright, eslint, typescript", () => {
    expect(ltSemver(readInstalledPackageJson("vitest").version, "5.0.0")).toBe(
      true
    );
    expect(
      ltSemver(readInstalledPackageJson("playwright").version, "2.0.0")
    ).toBe(true);
    expect(ltSemver(readInstalledPackageJson("eslint").version, "10.0.0")).toBe(
      true
    );
    expect(
      ltSemver(readInstalledPackageJson("typescript").version, "6.0.0")
    ).toBe(true);
  });

  it("T2-F4-03: zod rejects malformed bridge payloads and strips deprecated matchScoreThreshold", async () => {
    const { parseAccountRules, accountRulesSchema } = await import(
      "@/lib/validations/rules.schema"
    );
    const { bridgeBodySchema } = await import("@/lib/validations/settings.schema");

    expect(
      bridgeBodySchema.safeParse({
        email: "not-an-email",
        ollamaUrl: "https://ok.trycloudflare.com",
        bridgeSecret: "valid-secret",
      }).success
    ).toBe(false);

    expect(
      bridgeBodySchema.safeParse({
        email: "user@example.com",
        ollamaUrl: "not-a-url",
        bridgeSecret: "valid-secret",
      }).success
    ).toBe(false);

    expect(
      bridgeBodySchema.safeParse({
        email: "user@example.com",
        ollamaUrl: "https://ok.trycloudflare.com",
        bridgeSecret: "",
      }).success
    ).toBe(false);

    expect(
      accountRulesSchema.safeParse({ maxAutoSendsPerDay: 99 }).success
    ).toBe(false);

    const parsed = parseAccountRules({ matchScoreThreshold: 88 });
    expect("matchScoreThreshold" in parsed).toBe(false);
  });

  it("T2-F4-04: googleapis missing OAuth env throws descriptive error", async () => {
    vi.resetModules();
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    vi.stubEnv("GOOGLE_REDIRECT_URI", "");
    vi.doMock("@/lib/core/prisma", () => ({ prisma: {} }));

    const { getAuthorizationUrl } = await import("@/lib/gmail/google");
    expect(() => getAuthorizationUrl("state-1")).toThrow(
      /GOOGLE_CLIENT_ID environment variable is not set/
    );
  });

  it("T2-F4-05: /api/login-background handles @vercel/blob 304, stream 200, and fallback cleanly", async () => {
    vi.resetModules();
    const getMock = vi.fn();

    vi.doMock("@vercel/blob", () => ({
      get: getMock,
    }));
    vi.doMock("@/lib/core/ratelimit", () => ({
      getClientIp: () => "127.0.0.1",
      checkRateLimit: async () => ({
        success: true,
        remaining: 20,
        reset: Date.now() + 1000,
        limit: 30,
      }),
    }));

    const { GET } = await import("@/app/api/login-background/route");

    getMock.mockResolvedValueOnce({
      statusCode: 304,
      headers: new Headers({ etag: '"etag-1"' }),
      stream: null,
    });
    const res304 = await GET(new Request("https://app.test/api/login-background"));
    expect(res304.status).toBe(304);
    expect(res304.headers.get("etag")).toBe('"etag-1"');

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });
    getMock.mockResolvedValueOnce({
      statusCode: 200,
      headers: new Headers({ "content-length": "3" }),
      blob: { contentType: "image/webp" },
      stream,
    });
    const res200 = await GET(
      new Request("https://app.test/api/login-background?asset=poster")
    );
    expect(res200.status).toBe(200);
    expect(res200.headers.get("content-type")).toBe("image/webp");
    await res200.body?.cancel();

    getMock.mockRejectedValueOnce(new Error("Blob store unavailable"));
    const resFallback = await GET(
      new Request("https://app.test/api/login-background?asset=poster")
    );
    const hasLocalPoster =
      fileExists("public", "videos", "login-bg-poster.webp") ||
      fileExists("public", "videos", "color-spin-poster.webp");
    if (hasLocalPoster) {
      expect(resFallback.status).toBe(200);
      expect(resFallback.headers.get("content-type")).toBe("image/webp");
      await resFallback.body?.cancel();
    } else {
      expect(resFallback.status).toBe(404);
      expect(await resFallback.text()).toBe("Login background asset not found");
    }
  });
});
