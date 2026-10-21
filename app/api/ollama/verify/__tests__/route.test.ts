import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @/lib/auth
vi.mock("@/lib/auth", () => ({
  getAuthenticatedAccountId: vi.fn(),
}));

// Mock @/lib/prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    account: {
      findUnique: vi.fn(),
    },
    accountSettings: {
      upsert: vi.fn(),
    },
  },
}));

import { getAuthenticatedAccountId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

describe("Ollama Verify Route (/api/ollama/verify)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    vi.mocked(getAuthenticatedAccountId).mockResolvedValueOnce(null);

    const req = new Request("http://localhost:3000/api/ollama/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.connected).toBe(false);
  });

  it("prioritizes registered database tunnel URL when client sends empty body", async () => {
    vi.mocked(getAuthenticatedAccountId).mockResolvedValueOnce("acc_123");
    vi.mocked(prisma.account.findUnique).mockResolvedValueOnce({
      id: "acc_123",
      email: "test@example.com",
      settings: {
        localOllamaUrl: "https://registered-host-123.trycloudflare.com",
        rules: {},
      },
    } as any);

    // Mock global fetch to intercept Ollama /api/tags
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          models: [{ name: "llama3.1:8b" }, { name: "mistral:7b" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const req = new Request("http://localhost:3000/api/ollama/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://registered-host-123.trycloudflare.com/api/tags",
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "application/json",
        }),
      })
    );

    const data = await res.json();
    expect(data.connected).toBe(true);
    expect(data.activeUrl).toBe("https://registered-host-123.trycloudflare.com");
    expect(data.models).toEqual(["llama3.1:8b", "mistral:7b"]);

    // Verify DB update
    expect(prisma.accountSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountId: "acc_123" },
        update: expect.objectContaining({
          llmProvider: "LOCAL_OLLAMA",
          localOllamaUrl: "https://registered-host-123.trycloudflare.com",
        }),
      })
    );
  });

  it("uses manual external URL when client sends an explicit non-localhost URL", async () => {
    vi.mocked(getAuthenticatedAccountId).mockResolvedValueOnce("acc_123");
    vi.mocked(prisma.account.findUnique).mockResolvedValueOnce({
      id: "acc_123",
      email: "test@example.com",
      settings: {
        localOllamaUrl: "https://old-tunnel.trycloudflare.com",
        rules: {},
      },
    } as any);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          models: [{ name: "llama3.1:8b" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const req = new Request("http://localhost:3000/api/ollama/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://new-manual-tunnel.trycloudflare.com" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://new-manual-tunnel.trycloudflare.com/api/tags",
      expect.anything()
    );

    const data = await res.json();
    expect(data.connected).toBe(true);
    expect(data.activeUrl).toBe("https://new-manual-tunnel.trycloudflare.com");
  });

  it("falls back to trusted CLI registration in DB if public tunnel probe times out", async () => {
    vi.mocked(getAuthenticatedAccountId).mockResolvedValue("acc_123");
    vi.mocked(prisma.account.findUnique).mockResolvedValue({
      id: "acc_123",
      email: "test@example.com",
      settings: {
        localOllamaUrl: "https://registered-host-123.trycloudflare.com",
        rules: {
          bridgeConnected: true,
          availableModels: ["llama3.1:8b"],
        },
      },
    } as any);

    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(abortError);

    const req = new Request("http://localhost:3000/api/ollama/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.connected).toBe(true);
    expect(data.trustedCli).toBe(true);
    expect(data.activeUrl).toBe("https://registered-host-123.trycloudflare.com");
    expect(data.models).toEqual(["llama3.1:8b"]);
  });
});
