import { spawnSync } from "node:child_process";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ROOT_DIR,
  TEST_ENCRYPTION_KEY,
  readTextFile,
  startMockOllamaServer,
  startRecordingHttpServer,
  getClosedLocalUrl,
  generateHexToken,
} from "./helpers/e2e-fixtures.mjs";

/**
 * Starts the authenticating proxy from scripts/ollama-bridge.mjs on 127.0.0.1:0.
 * Guards against importing pre-M3 CLI-only scripts that execute process.exit(1).
 */
async function startBridgeAuthProxy({ targetUrl, authToken }) {
  const bridgeSrc = readTextFile("scripts", "ollama-bridge.mjs");
  expect(bridgeSrc).toMatch(
    /export\s+(?:(?:async\s+)?function\s+createOllamaAuthProxy\b|const\s+createOllamaAuthProxy\b|\{[^}]*\bcreateOllamaAuthProxy\b[^}]*\})/
  );

  const mod = await import("../scripts/ollama-bridge.mjs");
  expect(typeof mod.createOllamaAuthProxy).toBe("function");

  const proxyResult = await mod.createOllamaAuthProxy({
    targetUrl,
    authToken,
  });

  if (proxyResult && typeof proxyResult.listen === "function") {
    await new Promise((resolve) =>
      proxyResult.listen(0, "127.0.0.1", resolve)
    );
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

function createInMemoryBridgeDb({ encryptedBridgeSecret, rulesOverride = {} }) {
  const state = {
    account: {
      id: "acc_bridge_1",
      email: "bridge-user@example.com",
      settings: {
        accountId: "acc_bridge_1",
        llmProvider: "OPENROUTER",
        localOllamaUrl: null,
        ollamaModel: "llama3.1:8b",
        rules: {
          encryptedBridgeSecret,
          bridgeConnected: false,
          availableModels: [],
          ...rulesOverride,
        },
      },
    },
  };

  const prismaMock = {
    account: {
      findFirst: vi.fn(async () => state.account),
      findUnique: vi.fn(async () => state.account),
    },
    accountSettings: {
      findUnique: vi.fn(async () => state.account.settings),
      upsert: vi.fn(async ({ update }) => {
        state.account.settings = {
          ...state.account.settings,
          ...update,
        };
        return state.account.settings;
      }),
      update: vi.fn(async ({ data }) => {
        state.account.settings = {
          ...state.account.settings,
          ...data,
        };
        return state.account.settings;
      }),
    },
  };

  return { state, prismaMock };
}

beforeEach(async () => {
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", TEST_ENCRYPTION_KEY);
  try {
    const { resetOllamaCircuit } = await import("@/lib/ai/local-ollama");
    resetOllamaCircuit();
  } catch {
    // Allow tests whose source guards fail pre-M3 to report their own assertion cleanly
  }
});

afterEach(async () => {
  try {
    const { resetOllamaCircuit } = await import("@/lib/ai/local-ollama");
    resetOllamaCircuit();
  } catch {
    // Ignore if local-ollama cannot load during pre-M3/concurrent edits
  }
  vi.doUnmock("@/lib/core/prisma");
  vi.doUnmock("@/lib/core/auth");
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

// ============================================================================
// F8 — Ollama Bridge Proxy & Server-Side Token Auth Hardening
// ============================================================================
describe("F8: Ollama Bridge & Client Auth Hardening", () => {
  it("T1-F8-01: bridge proxy forwards authorized GET /api/tags and strips Authorization header", async () => {
    const mockOllama = await startMockOllamaServer({
      models: ["llama3.1:8b", "nomic-embed-text"],
    });
    const token = generateHexToken(32);
    let proxy;

    try {
      proxy = await startBridgeAuthProxy({
        targetUrl: mockOllama.url,
        authToken: token,
      });

      const res = await fetch(`${proxy.url}/api/tags`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.models.map((m) => m.name)).toEqual([
        "llama3.1:8b",
        "nomic-embed-text",
      ]);

      expect(mockOllama.requests).toHaveLength(1);
      expect(mockOllama.requests[0].headers.authorization).toBeUndefined();
    } finally {
      if (proxy) await proxy.close();
      await mockOllama.close();
    }
  });

  it("T1-F8-02: bridge proxy accepts X-MailPilot-Bridge-Token on GET /api/version and strips it upstream", async () => {
    const mockOllama = await startMockOllamaServer();
    const token = generateHexToken(32);
    let proxy;

    try {
      proxy = await startBridgeAuthProxy({
        targetUrl: mockOllama.url,
        authToken: token,
      });

      const res = await fetch(`${proxy.url}/api/version`, {
        headers: { "X-MailPilot-Bridge-Token": token },
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ version: "0.6.2" });

      expect(mockOllama.requests).toHaveLength(1);
      expect(
        mockOllama.requests[0].headers["x-mailpilot-bridge-token"]
      ).toBeUndefined();
    } finally {
      if (proxy) await proxy.close();
      await mockOllama.close();
    }
  });

  it("T1-F8-03: bridge proxy streams NDJSON chunks on POST /api/generate", async () => {
    const mockOllama = await startMockOllamaServer({
      generatePayload: { status: "streamed", ok: true },
      streamChunks: 4,
      chunkDelayMs: 5,
    });
    const token = generateHexToken(32);
    let proxy;

    try {
      proxy = await startBridgeAuthProxy({
        targetUrl: mockOllama.url,
        authToken: token,
      });

      const res = await fetch(`${proxy.url}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          model: "llama3.1:8b",
          prompt: "hello",
          stream: true,
        }),
      });
      expect(res.status).toBe(200);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assembled = "";
      let readCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        readCount++;
        assembled += decoder.decode(value, { stream: true });
      }
      assembled += decoder.decode();

      expect(readCount).toBeGreaterThanOrEqual(1);
      const lines = assembled
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(lines.length).toBe(4);
      const joined = lines.map((l) => l.response).join("");
      expect(JSON.parse(joined)).toEqual({ status: "streamed", ok: true });
    } finally {
      if (proxy) await proxy.close();
      await mockOllama.close();
    }
  });

  it("T1-F8-04: bridge registration persists AES-256-GCM encryptedTunnelToken in AccountSettings.rules", async () => {
    vi.resetModules();
    const { encryptToken, decryptToken, isEncryptedToken } = await import(
      "@/lib/core/crypto"
    );
    const bridgeSecret = "bridge-secret-1234";
    const tunnelToken = generateHexToken(32);
    const { state, prismaMock } = createInMemoryBridgeDb({
      encryptedBridgeSecret: encryptToken(bridgeSecret),
    });

    vi.doMock("@/lib/core/prisma", () => ({ prisma: prismaMock }));

    const { POST } = await import("@/app/api/settings/ollama-bridge/route");
    const req = new Request("https://app.test/api/settings/ollama-bridge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "bridge-user@example.com",
        ollamaUrl: "https://abc-123.trycloudflare.com",
        bridgeSecret,
        tunnelToken,
        models: ["llama3.1:8b"],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.connected).toBe(true);

    const savedRules = state.account.settings.rules;
    expect(typeof savedRules.encryptedTunnelToken).toBe("string");
    expect(savedRules.encryptedTunnelToken).not.toBe(tunnelToken);
    expect(isEncryptedToken(savedRules.encryptedTunnelToken)).toBe(true);
    expect(decryptToken(savedRules.encryptedTunnelToken)).toBe(tunnelToken);

    // Re-registering without tunnelToken (standalone cloudflared script) clears stale token
    const reregRes = await POST(
      new Request("https://app.test/api/settings/ollama-bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "bridge-user@example.com",
          ollamaUrl: "https://standalone-123.trycloudflare.com",
          bridgeSecret,
          models: ["llama3.1:8b"],
        }),
      })
    );
    expect(reregRes.status).toBe(200);
    expect(state.account.settings.rules.encryptedTunnelToken).toBeNull();
  });

  it("T1-F8-05: bridge disconnect clears localOllamaUrl, bridgeConnected, and encryptedTunnelToken", async () => {
    vi.resetModules();
    const { encryptToken } = await import("@/lib/core/crypto");
    const bridgeSecret = "bridge-secret-1234";
    const tunnelToken = generateHexToken(32);
    const { state, prismaMock } = createInMemoryBridgeDb({
      encryptedBridgeSecret: encryptToken(bridgeSecret),
      rulesOverride: {
        bridgeConnected: true,
        availableModels: ["llama3.1:8b"],
        encryptedTunnelToken: encryptToken(tunnelToken),
      },
    });
    state.account.settings.localOllamaUrl = "https://abc-123.trycloudflare.com";

    vi.doMock("@/lib/core/prisma", () => ({ prisma: prismaMock }));

    const { POST } = await import("@/app/api/settings/ollama-bridge/route");
    const res = await POST(
      new Request("https://app.test/api/settings/ollama-bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "bridge-user@example.com",
          action: "disconnect",
          bridgeSecret,
        }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(state.account.settings.localOllamaUrl).toBeNull();
    expect(state.account.settings.rules.bridgeConnected).toBe(false);
    expect(state.account.settings.rules.encryptedTunnelToken).toBeNull();
  });

  it("T1-F8-06: server-side Ollama callers attach Bearer token to registered proxy and omit when null", async () => {
    vi.resetModules();
    const mockOllama = await startMockOllamaServer({
      models: ["llama3.1:8b", "nomic-embed-text"],
      generatePayload: { candidate: "ok" },
      embeddingVector: [0.5, 0.25, 0.75],
    });
    const token = generateHexToken(32);
    let proxy;

    try {
      proxy = await startBridgeAuthProxy({
        targetUrl: mockOllama.url,
        authToken: token,
      });

      const { encryptToken } = await import("@/lib/core/crypto");
      const encryptedTunnelToken = encryptToken(token);

      const { state, prismaMock } = createInMemoryBridgeDb({
        encryptedBridgeSecret: encryptToken("bridge-secret"),
        rulesOverride: {
          bridgeConnected: true,
          encryptedTunnelToken,
          localOllamaUrl: proxy.url,
          embeddingProvider: "local_ollama",
          embeddingModel: "nomic-embed-text",
        },
      });
      state.account.settings.localOllamaUrl = proxy.url;

      vi.doMock("@/lib/core/prisma", () => ({ prisma: prismaMock }));
      vi.doMock("@/lib/core/auth", () => ({
        getAuthenticatedAccountId: vi.fn(async () => "acc_bridge_1"),
        getSessionToken: vi.fn(async () => "acc_bridge_1"),
      }));

      const { probeOllamaTags } = await import("@/lib/ai/local-ollama");
      const tagsRes = await probeOllamaTags(proxy.url, 5000, {
        authToken: token,
      });
      expect(tagsRes.models).toContain("llama3.1:8b");

      const { callLLMWithFallback } = await import("@/lib/ai/dispatcher");
      const llmRes = await callLLMWithFallback({
        accountId: "acc_bridge_1",
        llmProvider: "LOCAL_OLLAMA",
        localOllamaUrl: proxy.url,
        ollamaModel: "llama3.1:8b",
        systemPrompt: "system",
        userPrompt: "user",
        allowCloudFallback: false,
      });
      expect(llmRes?.candidate).toBe("ok");

      const { resolveEmbeddingConfig, callOllamaEmbedding } = await import(
        "@/lib/ai/embedding-registry"
      );
      const embCfg = resolveEmbeddingConfig({
        embeddingProvider: "local_ollama",
        embeddingModel: "nomic-embed-text",
        localOllamaUrl: proxy.url,
        encryptedTunnelToken,
      });
      const embVectors = await callOllamaEmbedding(["resume bullet"], embCfg);
      expect(embVectors).toEqual([[0.5, 0.25, 0.75]]);

      const { POST: verifyPost } = await import("@/app/api/ollama/verify/route");
      const reqCountBeforeVerify = mockOllama.requests.length;
      const verifyAuthRes = await verifyPost(
        new Request("https://app.test/api/ollama/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      );
      expect(verifyAuthRes.status).toBe(200);
      const verifyAuthBody = await verifyAuthRes.json();
      expect(verifyAuthBody.connected).toBe(true);
      expect(mockOllama.requests.length).toBeGreaterThan(reqCountBeforeVerify);

      // Backward compatibility when tunnelToken is null against unauthenticated server
      const unauthEmbCfg = resolveEmbeddingConfig({
        embeddingProvider: "local_ollama",
        embeddingModel: "nomic-embed-text",
        localOllamaUrl: mockOllama.url,
        encryptedTunnelToken: null,
      });
      const unauthVectors = await callOllamaEmbedding(["bullet"], unauthEmbCfg);
      expect(unauthVectors).toEqual([[0.5, 0.25, 0.75]]);
      expect(
        mockOllama.requests[mockOllama.requests.length - 1].headers.authorization
      ).toBeUndefined();

      state.account.settings.localOllamaUrl = mockOllama.url;
      state.account.settings.rules = {
        ...state.account.settings.rules,
        localOllamaUrl: mockOllama.url,
        encryptedTunnelToken: null,
      };
      const verifyUnauthRes = await verifyPost(
        new Request("https://app.test/api/ollama/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      );
      expect(verifyUnauthRes.status).toBe(200);
      expect((await verifyUnauthRes.json()).connected).toBe(true);
      expect(
        mockOllama.requests[mockOllama.requests.length - 1].headers.authorization
      ).toBeUndefined();
    } finally {
      if (proxy) await proxy.close();
      await mockOllama.close();
    }
  });

  it("T2-F8-01: tunnel proxy returns 401 on missing, empty, or malformed auth headers", async () => {
    const mockOllama = await startMockOllamaServer();
    const token = generateHexToken(32);
    let proxy;

    try {
      proxy = await startBridgeAuthProxy({
        targetUrl: mockOllama.url,
        authToken: token,
      });

      const invalidHeadersList = [
        {},
        { Authorization: "Basic dXNlcjpwYXNz" },
        { Authorization: "Bearer " },
        { "X-MailPilot-Bridge-Token": "" },
      ];

      for (const headers of invalidHeadersList) {
        const res = await fetch(`${proxy.url}/api/tags`, { headers });
        expect(res.status).toBe(401);
      }

      expect(mockOllama.requests).toHaveLength(0);
    } finally {
      if (proxy) await proxy.close();
      await mockOllama.close();
    }
  });

  it("T2-F8-02: tunnel proxy rejects truncated, extended, and 1-char-diff tokens in constant time", async () => {
    const mockOllama = await startMockOllamaServer();
    const token = generateHexToken(32);
    const lastChar = token.endsWith("a") ? "b" : "a";
    const oneCharDiff = token.slice(0, -1) + lastChar;
    let proxy;

    try {
      proxy = await startBridgeAuthProxy({
        targetUrl: mockOllama.url,
        authToken: token,
      });

      for (const candidate of [
        token.slice(0, 16),
        `${token}x`,
        oneCharDiff,
      ]) {
        const bearerRes = await fetch(`${proxy.url}/api/tags`, {
          headers: { Authorization: `Bearer ${candidate}` },
        });
        expect(bearerRes.status).toBe(401);

        const customHeaderRes = await fetch(`${proxy.url}/api/tags`, {
          headers: { "X-MailPilot-Bridge-Token": candidate },
        });
        expect(customHeaderRes.status).toBe(401);
      }
      expect(mockOllama.requests).toHaveLength(0);
    } finally {
      if (proxy) await proxy.close();
      await mockOllama.close();
    }
  });

  it("T2-F8-03: tunnel proxy blocks disallowed paths & methods and allows valid query strings", async () => {
    const mockOllama = await startMockOllamaServer();
    const token = generateHexToken(32);
    let proxy;

    try {
      proxy = await startBridgeAuthProxy({
        targetUrl: mockOllama.url,
        authToken: token,
      });

      const disallowed = [
        { method: "GET", path: "/" },
        { method: "POST", path: "/api/pull" },
        { method: "DELETE", path: "/api/delete" },
        { method: "GET", path: "/api/%64elete" },
        { method: "POST", path: "/api/push" },
        { method: "POST", path: "/api/create" },
        { method: "DELETE", path: "/api/tags" },
        { method: "GET", path: "/api/tags/../delete" },
      ];

      for (const reqSpec of disallowed) {
        const res = await fetch(`${proxy.url}${reqSpec.path}`, {
          method: reqSpec.method,
          headers: { Authorization: `Bearer ${token}` },
        });
        expect([403, 404]).toContain(res.status);
      }

      expect(mockOllama.requests).toHaveLength(0);

      const okQueryRes = await fetch(`${proxy.url}/api/tags?foo=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(okQueryRes.status).toBe(200);
    } finally {
      if (proxy) await proxy.close();
      await mockOllama.close();
    }
  });

  it("T2-F8-04: tunnel proxy strips authorization, proxy-authorization, x-mailpilot-bridge-token, and cookie headers upstream", async () => {
    const mockOllama = await startMockOllamaServer();
    const token = generateHexToken(32);
    let proxy;

    try {
      proxy = await startBridgeAuthProxy({
        targetUrl: mockOllama.url,
        authToken: token,
      });

      const res = await fetch(`${proxy.url}/api/tags`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Proxy-Authorization": "Basic c2VjcmV0",
          "X-MailPilot-Bridge-Token": token,
          Cookie: "mailpilot_session=super-secret-cookie",
        },
      });
      expect(res.status).toBe(200);
      expect(mockOllama.requests).toHaveLength(1);
      const upstreamHeaders = mockOllama.requests[0].headers;
      expect(upstreamHeaders.authorization).toBeUndefined();
      expect(upstreamHeaders["proxy-authorization"]).toBeUndefined();
      expect(upstreamHeaders["x-mailpilot-bridge-token"]).toBeUndefined();
      expect(upstreamHeaders.cookie).toBeUndefined();
    } finally {
      if (proxy) await proxy.close();
      await mockOllama.close();
    }
  });

  it("T2-F8-05: tunnel proxy returns 502 Bad Gateway cleanly when upstream Ollama is down", async () => {
    const closedUrl = await getClosedLocalUrl();
    const token = generateHexToken(32);
    let proxy;

    try {
      proxy = await startBridgeAuthProxy({
        targetUrl: closedUrl,
        authToken: token,
      });

      const res = await fetch(`${proxy.url}/api/tags`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(502);
    } finally {
      if (proxy) await proxy.close();
    }
  });

  it("T2-F8-06: bridge registration rejects SSRF URLs (400), wrong bridgeSecret (403), and CLI exits 1 on missing args", async () => {
    vi.resetModules();
    const { encryptToken } = await import("@/lib/core/crypto");
    const bridgeSecret = "correct-secret-123";
    const { prismaMock } = createInMemoryBridgeDb({
      encryptedBridgeSecret: encryptToken(bridgeSecret),
    });
    vi.doMock("@/lib/core/prisma", () => ({ prisma: prismaMock }));

    const { POST } = await import("@/app/api/settings/ollama-bridge/route");

    const badSecretRes = await POST(
      new Request("https://app.test/api/settings/ollama-bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "bridge-user@example.com",
          ollamaUrl: "https://valid.trycloudflare.com",
          bridgeSecret: "wrong-secret-000",
        }),
      })
    );
    expect(badSecretRes.status).toBe(403);

    for (const badUrl of [
      "http://127.0.0.1:11434",
      "https://evil.com",
    ]) {
      const ssrfRes = await POST(
        new Request("https://app.test/api/settings/ollama-bridge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "bridge-user@example.com",
            ollamaUrl: badUrl,
            bridgeSecret,
          }),
        })
      );
      expect(ssrfRes.status).toBe(400);
    }

    const cliRes = spawnSync(
      process.execPath,
      ["scripts/ollama-bridge.mjs"],
      {
        cwd: ROOT_DIR,
        encoding: "utf8",
      }
    );
    expect(cliRes.status).toBe(1);
  });

  it("T2-F8-07: /api/ollama/verify & pingOllama authenticate registered proxy but NEVER leak tunnelToken on arbitrary/spoofed URLs", async () => {
    vi.resetModules();
    const mockOllama = await startMockOllamaServer({
      models: ["llama3.1:8b"],
    });
    const attackerServer = await startRecordingHttpServer(200, {
      models: [{ name: "evil-model" }],
    });
    const secretToken = generateHexToken(32);
    let proxy;

    try {
      proxy = await startBridgeAuthProxy({
        targetUrl: mockOllama.url,
        authToken: secretToken,
      });

      const { encryptToken } = await import("@/lib/core/crypto");
      const { state, prismaMock } = createInMemoryBridgeDb({
        encryptedBridgeSecret: encryptToken("secret"),
        rulesOverride: {
          bridgeConnected: true,
          encryptedTunnelToken: encryptToken(secretToken),
          localOllamaUrl: proxy.url,
        },
      });
      state.account.settings.localOllamaUrl = proxy.url;

      vi.doMock("@/lib/core/prisma", () => ({ prisma: prismaMock }));
      vi.doMock("@/lib/core/auth", () => ({
        getAuthenticatedAccountId: vi.fn(async () => "acc_bridge_1"),
        getSessionToken: vi.fn(async () => "acc_bridge_1"),
      }));

      const { POST } = await import("@/app/api/ollama/verify/route");

      // 1. Positive path: registered localOllamaUrl receives Bearer token via proxy
      const regRes = await POST(
        new Request("https://app.test/api/ollama/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      );
      expect(regRes.status).toBe(200);
      expect((await regRes.json()).connected).toBe(true);
      expect(mockOllama.requests).toHaveLength(1);

      // 2. Arbitrary clientSuppliedUrl never receives tunnelToken
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
          if (parsedUrl.hostname === "attacker.trycloudflare.com") {
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
      let attackerRes;
      try {
        attackerRes = await POST(
          new Request("https://app.test/api/ollama/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: "https://attacker.trycloudflare.com" }),
          })
        );
      } finally {
        verifyFetchSpy.mockRestore();
      }
      expect(attackerRes.status).toBe(200);
      expect(capturedVerifyCalls.length).toBeGreaterThanOrEqual(1);
      expect(capturedVerifyCalls[0].headers.get("authorization")).toBeNull();
      expect(
        capturedVerifyCalls[0].headers.get("x-mailpilot-bridge-token")
      ).toBeNull();
      expect(attackerServer.requests).toHaveLength(1);
      const verifyHeaders = attackerServer.requests[0].headers;
      expect(verifyHeaders.authorization).toBeUndefined();
      expect(verifyHeaders["x-mailpilot-bridge-token"]).toBeUndefined();

      // 3. pingOllama(accountId, attackerUrl) never leaks tunnelToken
      state.account.settings.localOllamaUrl = proxy.url;
      const { pingOllama } = await import("@/app/actions/accounts");
      await pingOllama("acc_bridge_1", attackerServer.url);
      expect(attackerServer.requests.length).toBeGreaterThanOrEqual(2);
      const pingHeaders =
        attackerServer.requests[attackerServer.requests.length - 1].headers;
      expect(pingHeaders.authorization).toBeUndefined();
      expect(pingHeaders["x-mailpilot-bridge-token"]).toBeUndefined();

      // 4. Prefix-spoofed hostname never receives tunnelToken
      state.account.settings.localOllamaUrl =
        "https://registered-user.trycloudflare.com";
      state.account.settings.rules = {
        ...state.account.settings.rules,
        localOllamaUrl: "https://registered-user.trycloudflare.com",
      };
      const capturedFetchCalls = [];
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (input, init) => {
          capturedFetchCalls.push({ url: String(input), init });
          return new Response(JSON.stringify({ models: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        });
      const spoofRes = await POST(
        new Request("https://app.test/api/ollama/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: "https://registered-user.trycloudflare.com.attacker.com",
          }),
        })
      );
      expect(spoofRes.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const spoofHeaders = new Headers(capturedFetchCalls[0].init?.headers);
      expect(spoofHeaders.get("authorization")).toBeNull();
      expect(spoofHeaders.get("x-mailpilot-bridge-token")).toBeNull();
    } finally {
      if (proxy) await proxy.close();
      await attackerServer.close();
      await mockOllama.close();
    }
  });
});
