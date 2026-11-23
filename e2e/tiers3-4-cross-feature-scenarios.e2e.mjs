import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ROOT_DIR,
  TEST_ENCRYPTION_KEY,
  realPdfParse,
  fileExists,
  readTextFile,
  readJsonFile,
  readRootPackageJson,
  readInstalledPackageJson,
  parseSemver,
  gteSemver,
  ltSemver,
  resolveRoot,
  buildDocxFile,
  buildMinimalPdfBuffer,
  buildPdfFile,
  startMockOllamaServer,
  startRecordingHttpServer,
  generateHexToken,
} from "./helpers/e2e-fixtures.mjs";

const FIVE_MB = 5 * 1024 * 1024;

function runEslint(args) {
  const eslintBin = resolveRoot("node_modules", ".bin", "eslint");
  return execFileSync(eslintBin, args, {
    cwd: ROOT_DIR,
    encoding: "utf8",
    stdio: "pipe",
  });
}

function runPrisma(args, envExtra = {}) {
  const env = { ...process.env, ...envExtra };
  if (!("DATABASE_URL" in envExtra)) {
    delete env.DATABASE_URL;
  }
  const prismaBin = resolveRoot("node_modules", ".bin", "prisma");
  return execFileSync(prismaBin, args, {
    cwd: ROOT_DIR,
    env,
    encoding: "utf8",
    stdio: "pipe",
  });
}

async function startAuthProxy(targetUrl, authToken) {
  const bridgeSrc = readTextFile("scripts", "ollama-bridge.mjs");
  expect(bridgeSrc).toMatch(
    /export\s+(?:(?:async\s+)?function\s+createOllamaAuthProxy\b|const\s+createOllamaAuthProxy\b|\{[^}]*\bcreateOllamaAuthProxy\b[^}]*\})/
  );
  const mod = await import("../scripts/ollama-bridge.mjs");
  const proxyResult = await mod.createOllamaAuthProxy({
    targetUrl,
    authToken,
  });

  if (proxyResult && typeof proxyResult.listen === "function") {
    await new Promise((resolve) => proxyResult.listen(0, "127.0.0.1", resolve));
    const addr = proxyResult.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    return {
      url: `http://127.0.0.1:${port}`,
      close: () =>
        new Promise((resolve) => proxyResult.close(() => resolve())),
    };
  }

  if (proxyResult && proxyResult.server && !proxyResult.url) {
    await new Promise((resolve) =>
      proxyResult.server.listen(0, "127.0.0.1", resolve)
    );
    const addr = proxyResult.server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    return {
      url: `http://127.0.0.1:${port}`,
      close: () =>
        new Promise((resolve) => proxyResult.server.close(() => resolve())),
    };
  }

  return {
    url: proxyResult.url,
    close: () =>
      typeof proxyResult.close === "function"
        ? proxyResult.close()
        : new Promise((resolve) => proxyResult.server.close(() => resolve())),
  };
}

beforeEach(() => {
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", TEST_ENCRYPTION_KEY);
  vi.resetModules();
  vi.doMock("pdf-parse", () => ({ default: realPdfParse }));
});

afterEach(async () => {
  try {
    const { resetOllamaCircuit } = await import("@/lib/ai/local-ollama");
    resetOllamaCircuit();
  } catch {
    // Ignore if local-ollama cannot load during concurrent edits
  }
  vi.useRealTimers();
  vi.doUnmock("mammoth");
  vi.doUnmock("next/server");
  vi.doUnmock("@/lib/core/prisma");
  vi.doUnmock("@/lib/core/auth");
  vi.doUnmock("@/lib/gmail/sync");
  vi.doUnmock("@/lib/profile/resume-parser");
  vi.doMock("pdf-parse", () => ({ default: realPdfParse }));
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

// ============================================================================
// TIER 3 — Pairwise Cross-Feature Combinatorial Matrix (12 Tests)
// ============================================================================
describe("Tier 3: Cross-Feature Pairwise Interactions", () => {
  it("T3-01 (F1 + F2): proxy.ts passes ESLint flat config and enforces Next.js 16 redirects/allowlists", async () => {
    expect(fileExists("eslint.config.mjs")).toBe(true);
    expect(fileExists("proxy.ts")).toBe(true);
    expect(fileExists("middleware.ts")).toBe(false);

    runEslint(["--max-warnings=0", "proxy.ts"]);

    const { NextRequest } = await import("next/server");
    const { proxy } = await import("@/proxy");

    const anonRes = proxy(new NextRequest("https://app.test/radar"));
    expect(anonRes.status).toBe(307);
    expect(anonRes.headers.get("location")).toBe(
      "https://app.test/login?next=%2Fradar"
    );

    const pubRes = proxy(new NextRequest("https://app.test/api/auth/google"));
    expect(pubRes.status).toBe(200);
  });

  it("T3-02 (F1 + F5): Next.js 16 config/runtime and Prisma 7 hermetic client co-exist with DATABASE_URL unset", async () => {
    expect(fileExists("prisma.config.ts")).toBe(true);
    const out = runPrisma(["validate"]);
    expect(out.toLowerCase()).toContain("valid");

    delete globalThis.prisma;
    const prevDb = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    vi.resetModules();

    try {
      const { prisma } = await import("@/lib/core/prisma");
      const nextCfg = (await import("@/next.config.ts")).default;
      expect(prisma.account).toBeDefined();
      expect(nextCfg.serverExternalPackages).toContain("pdf-parse");
      expect(nextCfg.serverExternalPackages).toContain("mammoth");
      await prisma.$disconnect();
    } finally {
      if (prevDb !== undefined) process.env.DATABASE_URL = prevDb;
      delete globalThis.prisma;
    }
  });

  it("T3-03 (F2 + F3): AGENTS.md matches proxy.ts, eslint.config.mjs, and package.json 'lint' script", () => {
    expect(fileExists("proxy.ts")).toBe(true);
    expect(fileExists("eslint.config.mjs")).toBe(true);
    expect(fileExists("middleware.ts")).toBe(false);
    expect(fileExists(".eslintrc.json")).toBe(false);

    const pkg = readRootPackageJson();
    expect(pkg.scripts?.lint).toBe("eslint .");

    const agents = readTextFile("AGENTS.md");
    expect(agents).toMatch(/Next\.js\s+16/i);
    expect(agents).toContain("proxy.ts");
    expect(agents).toContain("eslint .");
    const withoutMigrationNotes = agents
      .replace(/replaces legacy `middleware\.ts`/gi, "")
      .replace(/replacing deprecated `next lint`/gi, "");
    expect(withoutMigrationNotes).not.toMatch(/Next\.js\s+15/i);
    expect(withoutMigrationNotes).not.toMatch(/\bnext lint\b/i);
    expect(withoutMigrationNotes).not.toMatch(/\bmiddleware\.ts\b/i);
  });

  it("T3-04 (F4 + F1): R4 upgrades & Tailwind v3 pin compile cleanly across Next 16 & extension config", async () => {
    expect(
      gteSemver(readInstalledPackageJson("next").version, "16.4.6")
    ).toBe(true);
    expect(
      gteSemver(readInstalledPackageJson("lucide-react").version, "1.77.0")
    ).toBe(true);
    expect(
      ltSemver(readInstalledPackageJson("tailwindcss").version, "4.0.0")
    ).toBe(true);

    const extVite = readTextFile("extension", "vite.config.ts");
    expect(extVite).toContain("postcss.config.mjs");
    const sidepanelSrc = readTextFile(
      "extension",
      "src",
      "sidepanel",
      "sidepanel.tsx"
    );
    expect(sidepanelSrc).toContain("@/app/globals.css");

    const postcss = (await import("postcss")).default;
    const tailwindcss = (await import("tailwindcss")).default;
    const res = await postcss([
      tailwindcss(resolveRoot("tailwind.config.ts")),
    ]).process(readTextFile("app", "globals.css"), {
      from: resolveRoot("app", "globals.css"),
    });
    expect(res.warnings()).toHaveLength(0);
    expect(res.css).toContain("--background");
  });

  it("T3-05 (F6 + F7): document-parser unified DOCX + PDF guards flow through extractResumeDraft", async () => {
    vi.resetModules();
    vi.doMock("@/lib/core/prisma", () => ({
      prisma: {
        account: {
          findUnique: vi.fn(async () => ({
            id: "acc_1",
            email: "user@example.com",
            settings: {
              llmProvider: "OPENROUTER",
              rules: {},
            },
          })),
        },
      },
    }));
    vi.doMock("@/lib/profile/resume-parser", () => ({
      parseResumeToStructuredProfile: vi.fn(async () => ({
        fullName: "Unified Candidate",
        email: "user@example.com",
        phone: null,
        location: null,
        summary: null,
        links: [],
        skills: [],
        experiences: [],
        projects: [],
        education: [],
        certifications: [],
        awards: [],
        interests: [],
      })),
    }));

    const { extractResumeDraft } = await import(
      "@/lib/services/profile-sync.service"
    );

    const okDocx = await buildDocxFile({
      paragraphs: ["DOCX Candidate"],
      externalLinkTarget: "file:///etc/passwd",
    });
    const fdDocx = new FormData();
    fdDocx.set("accountId", "acc_1");
    fdDocx.set("file", okDocx);
    const docxRes = await extractResumeDraft(fdDocx);
    expect(docxRes.ok).toBe(true);
    expect(docxRes.data?.sourceText).toContain("DOCX Candidate");

    const okPdf = buildPdfFile(buildMinimalPdfBuffer(2), "cv.pdf");
    const fdPdf = new FormData();
    fdPdf.set("accountId", "acc_1");
    fdPdf.set("file", okPdf);
    const pdfRes = await extractResumeDraft(fdPdf);
    expect(pdfRes.ok).toBe(true);
    expect(pdfRes.data?.sourceText).toContain("PAGE_2_SENTINEL");

    for (const [name, mime] of [
      ["huge.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      ["huge.pdf", "application/pdf"],
    ]) {
      const overFile = new File([Buffer.alloc(FIVE_MB + 1, 0x20)], name, {
        type: mime,
      });
      const spy = vi.spyOn(overFile, "arrayBuffer");
      const fdOver = new FormData();
      fdOver.set("accountId", "acc_1");
      fdOver.set("file", overFile);
      const res = await extractResumeDraft(fdOver);
      expect(res.ok).toBe(false);
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it("T3-06 (F5 + F8): AccountSettings.rules encryptedTunnelToken integrates with dispatcher & pingOllama without URL-override leakage", async () => {
    vi.resetModules();
    const mockOllama = await startMockOllamaServer({
      models: ["llama3.1:8b"],
      generatePayload: { score: 92 },
    });
    const attackerServer = await startRecordingHttpServer(200, {
      models: [{ name: "evil-model" }],
    });
    const token = generateHexToken(32);
    let proxy;

    try {
      proxy = await startAuthProxy(mockOllama.url, token);
      const { encryptToken } = await import("@/lib/core/crypto");
      const { accountRulesSchema } = await import(
        "@/lib/validations/rules.schema"
      );
      const encryptedTunnelToken = encryptToken(token);
      const rules = accountRulesSchema.parse({
        bridgeConnected: true,
        encryptedTunnelToken,
        localOllamaUrl: proxy.url,
      });

      const prismaMock = {
        accountSettings: {
          findUnique: vi.fn(async () => ({
            accountId: "acc_1",
            localOllamaUrl: proxy.url,
            ollamaModel: "llama3.1:8b",
            rules,
          })),
          update: vi.fn(async () => ({})),
        },
      };
      vi.doMock("@/lib/core/prisma", () => ({ prisma: prismaMock }));
      vi.doMock("@/lib/core/auth", () => ({
        getSessionToken: vi.fn(async () => "acc_1"),
      }));

      const { callLLMWithFallback } = await import("@/lib/ai/dispatcher");
      const llmRes = await callLLMWithFallback({
        accountId: "acc_1",
        llmProvider: "LOCAL_OLLAMA",
        localOllamaUrl: proxy.url,
        systemPrompt: "sys",
        userPrompt: "usr",
        allowCloudFallback: false,
      });
      expect(llmRes?.score).toBe(92);

      const { pingOllama } = await import("@/app/actions/accounts");
      const pingRes = await pingOllama("acc_1");
      expect(pingRes.success).toBe(true);
      expect(pingRes.data?.models).toContain("llama3.1:8b");

      // Mismatched options.localOllamaUrl must NOT receive tunnelToken
      await callLLMWithFallback({
        accountId: "acc_1",
        llmProvider: "LOCAL_OLLAMA",
        localOllamaUrl: attackerServer.url,
        systemPrompt: "sys",
        userPrompt: "usr",
        allowCloudFallback: false,
      }).catch(() => null);
      expect(attackerServer.requests.length).toBeGreaterThanOrEqual(1);
      for (const req of attackerServer.requests) {
        expect(req.headers.authorization).toBeUndefined();
        expect(req.headers["x-mailpilot-bridge-token"]).toBeUndefined();
      }
    } finally {
      if (proxy) await proxy.close();
      await attackerServer.close();
      await mockOllama.close();
    }
  });

  it("T3-07 (F4 + F8): zod bridgeBodySchema validates tunnelToken (64-char hex vs short token) & accountRulesSchema default", async () => {
    const { bridgeBodySchema } = await import(
      "@/lib/validations/settings.schema"
    );
    const { parseAccountRules } = await import(
      "@/lib/validations/rules.schema"
    );

    const base = {
      email: "user@example.com",
      ollamaUrl: "https://ok.trycloudflare.com",
      bridgeSecret: "secret-123",
    };

    expect(
      bridgeBodySchema.safeParse({ ...base, tunnelToken: "a".repeat(31) })
        .success
    ).toBe(false);
    expect(
      bridgeBodySchema.safeParse({
        ...base,
        tunnelToken: generateHexToken(32),
      }).success
    ).toBe(true);

    const rules = parseAccountRules({});
    expect(rules.encryptedTunnelToken).toBeNull();
  });

  it("T3-08 (F1 + F8): proxy.ts lets CLI bridge endpoint pass without cookie while verify endpoint requires session", async () => {
    expect(fileExists("proxy.ts")).toBe(true);
    const { NextRequest } = await import("next/server");
    const { proxy } = await import("@/proxy");

    const bridgeProxyRes = proxy(
      new NextRequest("https://app.test/api/settings/ollama-bridge", {
        method: "POST",
      })
    );
    expect(bridgeProxyRes.status).toBe(200);
    expect(bridgeProxyRes.headers.get("location")).toBeNull();

    vi.resetModules();
    vi.doMock("@/lib/core/auth", () => ({
      getAuthenticatedAccountId: vi.fn(async () => null),
    }));
    vi.doMock("@/lib/core/prisma", () => ({ prisma: {} }));

    const { POST: verifyPost } = await import("@/app/api/ollama/verify/route");
    const verifyRes = await verifyPost(
      new Request("https://app.test/api/ollama/verify", { method: "POST" })
    );
    expect(verifyRes.status).toBe(401);
  });

  it("T3-09 (F4 + F5): zod@4.6.7 parsed AccountRules & MasterProfile payloads are JSON-serializable for Prisma 7", async () => {
    const { parseAccountRules } = await import(
      "@/lib/validations/rules.schema"
    );
    const { masterProfileSchema, getEmptyMasterProfileData } = await import(
      "@/lib/validations/profile.schema"
    );

    const rules = parseAccountRules({
      matchScoreThreshold: 80,
      encryptedTunnelToken: "iv:tag:cipher",
    });
    expect(JSON.parse(JSON.stringify(rules))).toEqual(rules);

    const profile = masterProfileSchema.parse({
      ...getEmptyMasterProfileData(),
      fullName: "Taylor Morgan",
      email: "taylor@example.com",
    });
    expect(profile.fullName).toBe("Taylor Morgan");
    expect(JSON.parse(JSON.stringify(profile)).email).toBe(
      "taylor@example.com"
    );
  });

  it("T3-10 (F4 + F6/F7): extracted DOCX/PDF resume text feeds cleanly into masterProfileSchema validation", async () => {
    const { extractTextFromFile } = await import(
      "@/lib/document/document-parser"
    );
    const { masterProfileSchema, getEmptyMasterProfileData } = await import(
      "@/lib/validations/profile.schema"
    );

    const docxText = await extractTextFromFile(
      await buildDocxFile({ paragraphs: ["Morgan Lee", "Project Coordinator"] })
    );
    const pdfText = await extractTextFromFile(
      buildPdfFile(buildMinimalPdfBuffer(1))
    );

    const validated = masterProfileSchema.parse({
      ...getEmptyMasterProfileData(),
      fullName: "Morgan Lee",
      email: "morgan@example.com",
      summary: `${docxText} | ${pdfText}`,
    });
    expect(validated.summary).toContain("Morgan Lee");
    expect(validated.summary).toContain("PAGE_1_SENTINEL");
  });

  it("T3-11 (F3 + F5): lib/core/prisma.ts is SSOT singleton & vitest.config.mjs isolates E2E suite", () => {
    expect(fileExists("prisma.config.ts")).toBe(true);
    const vitestCfg = readTextFile("vitest.config.mjs");
    expect(vitestCfg).toContain("**/*.test.ts");

    const agents = readTextFile("AGENTS.md");
    expect(agents).toContain("Hermetic Testing");
    expect(agents).toContain("Single Source of Truth");

    const prismaHelper = readTextFile("lib", "core", "prisma.ts");
    expect(prismaHelper).toContain("PrismaPg");
  });

  it("T3-12 (F2 + F4): ESLint flat config lints R4 consumer files (googleapis, zod, @vercel/blob) cleanly", () => {
    expect(fileExists("eslint.config.mjs")).toBe(true);
    const out = runEslint([
      "lib/gmail/google.ts",
      "lib/validations/rules.schema.ts",
      "app/api/login-background/route.ts",
    ]);
    expect(typeof out).toBe("string");
  });
});

// ============================================================================
// TIER 4 — Real-World Application Workload Scenarios (6 Scenarios)
// ============================================================================
describe("Tier 4: Real-World Application Scenarios", () => {
  it("T4-01: End-to-End Candidate Resume Ingestion Pipeline (PDF + DOCX + CVE defense + >5 MB + timeout)", async () => {
    vi.resetModules();
    vi.doMock("@/lib/core/prisma", () => ({
      prisma: {
        account: {
          findUnique: vi.fn(async () => ({
            id: "acc_ingest",
            email: "candidate@example.com",
            settings: { llmProvider: "OPENROUTER", rules: {} },
          })),
        },
      },
    }));
    vi.doMock("@/lib/profile/resume-parser", () => ({
      parseResumeToStructuredProfile: vi.fn(async (rawText) => ({
        fullName: "Jordan Candidate",
        email: "candidate@example.com",
        phone: null,
        location: null,
        summary: rawText.slice(0, 120),
        links: [],
        skills: [],
        experiences: [],
        projects: [],
        education: [],
        certifications: [],
        awards: [],
        interests: [],
      })),
    }));

    const { extractResumeDraft } = await import(
      "@/lib/services/profile-sync.service"
    );

    // 1. Valid PDF
    const fdPdf = new FormData();
    fdPdf.set("accountId", "acc_ingest");
    fdPdf.set("file", buildPdfFile(buildMinimalPdfBuffer(2), "resume.pdf"));
    const pdfRes = await extractResumeDraft(fdPdf);
    expect(pdfRes.ok).toBe(true);
    expect(pdfRes.data?.sourceText).toContain("PAGE_1_SENTINEL");

    // 2. Valid DOCX with table & entities
    const fdDocx = new FormData();
    fdDocx.set("accountId", "acc_ingest");
    fdDocx.set(
      "file",
      await buildDocxFile({
        paragraphs: ["Jordan & Associates"],
        tableRows: [["Metric", "Impact"], ["Throughput", "+40%"]],
      })
    );
    const docxRes = await extractResumeDraft(fdDocx);
    expect(docxRes.ok).toBe(true);
    expect(docxRes.data?.sourceText).toContain("Jordan & Associates");

    // 3. Adversarial DOCX (r:link canary + __proto__ styles)
    const canaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailpilot-t401-"));
    const canaryFile = path.join(canaryDir, "secret.txt");
    fs.writeFileSync(canaryFile, "T401_SECRET_CANARY", "utf8");
    try {
      const fdEvil = new FormData();
      fdEvil.set("accountId", "acc_ingest");
      fdEvil.set(
        "file",
        await buildDocxFile({
          paragraphs: ["Public Resume Line"],
          externalLinkTarget: pathToFileURL(canaryFile).href,
          polluteStyles: true,
        })
      );
      const evilRes = await extractResumeDraft(fdEvil);
      if (evilRes.ok) {
        expect(evilRes.data?.sourceText).not.toContain("T401_SECRET_CANARY");
        expect(evilRes.data?.sourceText).not.toContain(
          Buffer.from("T401_SECRET_CANARY").toString("base64")
        );
      }
      expect({}.externalFileAccess).toBeUndefined();
    } finally {
      fs.rmSync(canaryDir, { recursive: true, force: true });
    }

    // 4. Oversized > 5 MB PDF rejected before arrayBuffer() & 0-byte DOCX rejected
    const hugePdf = buildPdfFile(Buffer.alloc(FIVE_MB + 1, 0x25), "huge.pdf");
    const abSpy = vi.spyOn(hugePdf, "arrayBuffer");
    const fdHuge = new FormData();
    fdHuge.set("accountId", "acc_ingest");
    fdHuge.set("file", hugePdf);
    const hugeRes = await extractResumeDraft(fdHuge);
    expect(hugeRes.ok).toBe(false);
    expect(abSpy).not.toHaveBeenCalled();

    const fdZero = new FormData();
    fdZero.set("accountId", "acc_ingest");
    fdZero.set("file", new File([Buffer.alloc(0)], "empty.docx"));
    const zeroRes = await extractResumeDraft(fdZero);
    expect(zeroRes.ok).toBe(false);

    // 5. Hung PDF parser timeout teardown
    vi.useFakeTimers();
    vi.resetModules();
    vi.doMock("pdf-parse", () => ({
      default: () => new Promise(() => {}),
    }));
    const { parsePdfBuffer } = await import("@/lib/document/document-parser");
    const hangPromise = parsePdfBuffer(buildMinimalPdfBuffer(1)).then(
      () => "RESOLVED_WITHOUT_TIMEOUT",
      (err) => err
    );
    await vi.advanceTimersByTimeAsync(5_001);
    const timeoutErr = await Promise.race([
      hangPromise,
      Promise.resolve("DID_NOT_TIMEOUT_IN_5001MS"),
    ]);
    expect(timeoutErr).toBeInstanceOf(Error);
    expect(timeoutErr.message).toMatch(/timed out|timeout/i);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("T4-02: End-to-End Local Ollama Tunnel Lifecycle (proxy -> register -> stream/embed -> block -> non-leakage -> disconnect)", async () => {
    vi.resetModules();
    const mockOllama = await startMockOllamaServer({
      models: ["llama3.1:8b", "nomic-embed-text"],
      generatePayload: { decision: "STRONG_MATCH" },
      embeddingVector: [0.2, 0.4, 0.6],
    });
    const attackerServer = await startRecordingHttpServer(200, {
      models: [{ name: "attacker-model" }],
    });

    const tunnelToken = generateHexToken(32);
    const bridgeSecret = "bridge-secret-lifecycle";
    let proxy;

    try {
      proxy = await startAuthProxy(mockOllama.url, tunnelToken);
      const { encryptToken, decryptToken } = await import("@/lib/core/crypto");

      const dbState = {
        account: {
          id: "acc_t402",
          email: "lifecycle@example.com",
          settings: {
            accountId: "acc_t402",
            llmProvider: "OPENROUTER",
            localOllamaUrl: null,
            ollamaModel: "llama3.1:8b",
            rules: {
              encryptedBridgeSecret: encryptToken(bridgeSecret),
              bridgeConnected: false,
              availableModels: [],
            },
          },
        },
      };

      const prismaMock = {
        account: {
          findFirst: vi.fn(async () => dbState.account),
          findUnique: vi.fn(async () => dbState.account),
        },
        accountSettings: {
          findUnique: vi.fn(async () => dbState.account.settings),
          upsert: vi.fn(async ({ update }) => {
            dbState.account.settings = { ...dbState.account.settings, ...update };
            return dbState.account.settings;
          }),
          update: vi.fn(async ({ data }) => {
            dbState.account.settings = { ...dbState.account.settings, ...data };
            return dbState.account.settings;
          }),
        },
      };

      vi.doMock("@/lib/core/prisma", () => ({ prisma: prismaMock }));
      vi.doMock("@/lib/core/auth", () => ({
        getAuthenticatedAccountId: vi.fn(async () => "acc_t402"),
      }));

      // 1. Register bridge with tunnelToken
      const { POST: bridgePost } = await import(
        "@/app/api/settings/ollama-bridge/route"
      );
      const regRes = await bridgePost(
        new Request("https://app.test/api/settings/ollama-bridge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "lifecycle@example.com",
            ollamaUrl: "https://sim-tunnel.trycloudflare.com",
            bridgeSecret,
            tunnelToken,
            models: ["llama3.1:8b", "nomic-embed-text"],
          }),
        })
      );
      expect(regRes.status).toBe(200);
      expect(
        decryptToken(dbState.account.settings.rules.encryptedTunnelToken)
      ).toBe(tunnelToken);

      // Point registered URL at local 127.0.0.1:0 proxy to verify end-to-end wire calls
      dbState.account.settings.localOllamaUrl = proxy.url;
      dbState.account.settings.rules = {
        ...dbState.account.settings.rules,
        localOllamaUrl: proxy.url,
      };

      // 2. Authorized callers succeed & upstream sees no Authorization/Cookie
      const { probeOllamaTags } = await import("@/lib/ai/local-ollama");
      const { callLLMWithFallback } = await import("@/lib/ai/dispatcher");
      const { resolveEmbeddingConfig, callOllamaEmbedding } = await import(
        "@/lib/ai/embedding-registry"
      );

      expect(
        (await probeOllamaTags(proxy.url, 5000, { authToken: tunnelToken }))
          .models
      ).toContain("llama3.1:8b");
      const llmRes = await callLLMWithFallback({
        accountId: "acc_t402",
        llmProvider: "LOCAL_OLLAMA",
        localOllamaUrl: proxy.url,
        ollamaModel: "llama3.1:8b",
        systemPrompt: "sys",
        userPrompt: "usr",
        allowCloudFallback: false,
      });
      expect(llmRes?.decision).toBe("STRONG_MATCH");

      const embCfg = resolveEmbeddingConfig(dbState.account.settings.rules);
      expect(await callOllamaEmbedding(["skill"], embCfg)).toEqual([
        [0.2, 0.4, 0.6],
      ]);

      // Positive /api/ollama/verify against registered proxy.url
      const { POST: verifyPost } = await import("@/app/api/ollama/verify/route");
      const verifyAuthRes = await verifyPost(
        new Request("https://app.test/api/ollama/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      );
      expect(verifyAuthRes.status).toBe(200);
      expect((await verifyAuthRes.json()).connected).toBe(true);

      for (const req of mockOllama.requests) {
        expect(req.headers.authorization).toBeUndefined();
        expect(req.headers.cookie).toBeUndefined();
      }

      // 3. Attacker probes blocked (401 unauth, 403/404 disallowed)
      expect((await fetch(`${proxy.url}/api/tags`)).status).toBe(401);
      const delRes = await fetch(`${proxy.url}/api/delete`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${tunnelToken}` },
      });
      expect([403, 404]).toContain(delRes.status);

      // 4. clientSuppliedUrl never leaks tunnelToken
      const realFetch = globalThis.fetch;
      const capturedVerifyCalls = [];
      const verifyFetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (input, init) => {
          const url =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.href
                : input.url;
          const parsedUrl = new URL(url);
          if (parsedUrl.hostname === "evil.trycloudflare.com") {
            const headers = new Headers(
              init?.headers ??
                (input instanceof Request ? input.headers : undefined)
            );
            capturedVerifyCalls.push({ url, headers });
            const rewrittenUrl = `${attackerServer.url}${parsedUrl.pathname}${parsedUrl.search}`;
            return realFetch(rewrittenUrl, init);
          }
          return realFetch(input, init);
        });
      let verifyRes;
      try {
        verifyRes = await verifyPost(
          new Request("https://app.test/api/ollama/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: "https://evil.trycloudflare.com" }),
          })
        );
      } finally {
        verifyFetchSpy.mockRestore();
      }
      expect(verifyRes.status).toBe(200);
      expect(capturedVerifyCalls.length).toBeGreaterThanOrEqual(1);
      expect(capturedVerifyCalls[0].headers.get("authorization")).toBeNull();
      expect(
        capturedVerifyCalls[0].headers.get("x-mailpilot-bridge-token")
      ).toBeNull();
      expect(attackerServer.requests).toHaveLength(1);
      expect(attackerServer.requests[0].headers.authorization).toBeUndefined();
      expect(
        attackerServer.requests[0].headers["x-mailpilot-bridge-token"]
      ).toBeUndefined();

      // 5. Disconnect wipes token & URL
      const discRes = await bridgePost(
        new Request("https://app.test/api/settings/ollama-bridge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "lifecycle@example.com",
            action: "disconnect",
            bridgeSecret,
          }),
        })
      );
      expect(discRes.status).toBe(200);
      expect(dbState.account.settings.localOllamaUrl).toBeNull();
      expect(dbState.account.settings.rules.encryptedTunnelToken).toBeNull();
      expect(dbState.account.settings.rules.bridgeConnected).toBe(false);
    } finally {
      if (proxy) await proxy.close();
      await attackerServer.close();
      await mockOllama.close();
    }
  });

  it("T4-03: End-to-End CI / Production Pre-Flight Gate (versions, proxy, eslint, AGENTS, Prisma 7)", () => {
    expect(gteSemver(readInstalledPackageJson("next").version, "16.4.6")).toBe(
      true
    );
    expect(
      gteSemver(readInstalledPackageJson("eslint-config-next").version, "16.4.6")
    ).toBe(true);
    expect(
      parseSemver(readInstalledPackageJson("@prisma/client").version).major
    ).toBe(7);
    expect(parseSemver(readInstalledPackageJson("prisma").version).major).toBe(
      7
    );
    expect(readInstalledPackageJson("googleapis").version).toBe("190.0.0");
    expect(readInstalledPackageJson("lucide-react").version).toBe("1.77.0");
    expect(readInstalledPackageJson("zod").version).toBe("4.6.7");
    expect(readInstalledPackageJson("@vercel/blob").version).toBe("2.9.0");
    expect(readRootPackageJson().devDependencies?.tailwindcss).toBe("^3.4.19");

    expect(fileExists("middleware.ts")).toBe(false);
    expect(fileExists("proxy.ts")).toBe(true);
    expect(fileExists(".eslintrc.json")).toBe(false);
    expect(fileExists("eslint.config.mjs")).toBe(true);
    expect(fileExists("prisma.config.ts")).toBe(true);

    const agents = readTextFile("AGENTS.md");
    expect(agents).toMatch(/Next\.js\s+16/i);
    expect(agents).not.toMatch(/Next\.js\s+15/i);

    expect(runPrisma(["validate"]).toLowerCase()).toContain("valid");
    runEslint(["--max-warnings=0", "proxy.ts", "e2e/"]);

    const vitestCfg = readTextFile("vitest.config.mjs");
    expect(vitestCfg).toContain("**/*.test.ts");
  });

  it("T4-04: End-to-End Serverless Gmail Webhook & Google OAuth2 Compatibility", async () => {
    vi.resetModules();
    vi.stubEnv("GMAIL_WEBHOOK_SECRET", "prod-webhook-secret");
    vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "csec");
    vi.stubEnv("GOOGLE_REDIRECT_URI", "https://app.test/api/auth/callback/google");

    const afterCallbacks = [];
    const processInboxDeltaMock = vi.fn(async () => ({ processed: 2 }));

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
    vi.doMock("@/lib/core/prisma", () => ({ prisma: {} }));

    const { NextRequest } = await import("next/server");
    const { POST } = await import("@/app/api/webhooks/gmail/route");
    const { getAuthorizationUrl, getGmailClient, GMAIL_SCOPES } = await import(
      "@/lib/gmail/google"
    );

    const authUrl = new URL(getAuthorizationUrl("nonce-44"));
    expect(authUrl.searchParams.get("access_type")).toBe("offline");
    expect(authUrl.searchParams.get("prompt")).toBe("consent");
    for (const s of GMAIL_SCOPES) {
      expect(authUrl.searchParams.get("scope")).toContain(s);
    }
    expect(
      typeof getGmailClient({
        accessToken: "tok",
        refreshToken: "ref",
        expiryDate: new Date(Date.now() + 3600_000),
      }).users.watch
    ).toBe("function");

    const badRes = await POST(
      new NextRequest("https://app.test/api/webhooks/gmail?token=wrong", {
        method: "POST",
      })
    );
    expect(badRes.status).toBe(401);

    const encoded = Buffer.from(
      JSON.stringify({ emailAddress: "user@example.com", historyId: 777 })
    ).toString("base64");
    const okRes = await POST(
      new NextRequest(
        "https://app.test/api/webhooks/gmail?token=prod-webhook-secret",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: { data: encoded } }),
        }
      )
    );
    expect(okRes.status).toBe(200);
    expect(await okRes.json()).toEqual({ status: "ok" });
    await afterCallbacks[0]();
    expect(processInboxDeltaMock).toHaveBeenCalledWith("user@example.com", "777");
  });

  it("T4-05: End-to-End Extension + Web UI Toolchain Coherence (Tailwind v3 + Vite + Packaging + ESLint)", async () => {
    expect(fileExists("eslint.config.mjs")).toBe(true);

    const extVite = readTextFile("extension", "vite.config.ts");
    expect(extVite).toContain("postcss.config.mjs");
    expect(extVite).toContain('formats: ["iife"]');
    expect(extVite).toContain("sidepanel.html");
    expect(extVite).toContain("service-worker");

    const pkgExtScript = readTextFile("scripts", "package-extension.mjs");
    expect(pkgExtScript).toContain("jszip");
    expect(pkgExtScript).not.toMatch(/\.\.\//);

    const manifest = readJsonFile("extension", "manifest.json");
    expect(manifest.manifest_version).toBe(3);

    const postcss = (await import("postcss")).default;
    const tailwindcss = (await import("tailwindcss")).default;
    const compiled = await postcss([
      tailwindcss(resolveRoot("tailwind.config.ts")),
    ]).process(readTextFile("app", "globals.css"), {
      from: resolveRoot("app", "globals.css"),
    });
    expect(compiled.warnings()).toHaveLength(0);

    const eslintCfg = (await import("@/eslint.config.mjs")).default;
    const ignoredPatterns = eslintCfg.flatMap((entry) => entry?.ignores ?? []);
    expect(ignoredPatterns.some((p) => p.includes("extension/dist"))).toBe(
      true
    );
    expect(ignoredPatterns.some((p) => p.includes("public/downloads"))).toBe(
      true
    );

    runEslint(["extension/src/sidepanel/sidepanel.tsx"]);
  });

  it("T4-06: End-to-End Security Regression Defense Audit across CVEs & SSRF", async () => {
    // 1. Next.js & jszip security floors
    expect(gteSemver(readInstalledPackageJson("next").version, "16.4.6")).toBe(
      true
    );
    expect(
      gteSemver(readInstalledPackageJson("eslint-config-next").version, "16.4.6")
    ).toBe(true);
    expect(
      gteSemver(readInstalledPackageJson("jszip").version, "3.10.2")
    ).toBe(true);

    // 2. SSRF protection (lib/core/ssrf.ts)
    const { isBlockedIp, assertSafeHttpsUrl } = await import(
      "@/lib/core/ssrf"
    );
    expect(isBlockedIp("127.0.0.1")).toBe(true);
    expect(isBlockedIp("169.254.169.254")).toBe(true);
    expect(isBlockedIp("::1")).toBe(true);
    await expect(assertSafeHttpsUrl("http://example.com")).rejects.toThrow();

    // 3. Document parser security constants & CVE-2026-97151 / CVE-2025-11849
    const parser = await import("@/lib/document/document-parser");
    expect(parser.MAX_DOCUMENT_BYTES).toBe(FIVE_MB);
    expect(parser.DOCUMENT_PARSE_TIMEOUT_MS).toBe(5_000);
    expect(parser.MAX_PDF_PAGES).toBe(50);

    const evilDocx = await buildDocxFile({
      paragraphs: ["Audit Ok"],
      externalLinkTarget: "file:///etc/passwd",
      polluteStyles: true,
    });
    const extracted = await parser.extractTextFromFile(evilDocx);
    expect(extracted).toContain("Audit Ok");
    expect({}.externalFileAccess).toBeUndefined();

    // 4. Bridge proxy auth & route allowlist
    const mockOllama = await startMockOllamaServer();
    const token = generateHexToken(32);
    let proxy;
    try {
      proxy = await startAuthProxy(mockOllama.url, token);
      expect((await fetch(`${proxy.url}/api/tags`)).status).toBe(401);
      const delRes = await fetch(`${proxy.url}/api/delete`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      expect([403, 404]).toContain(delRes.status);
    } finally {
      if (proxy) await proxy.close();
      await mockOllama.close();
    }
  });
});
