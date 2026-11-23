import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { encryptToken, decryptToken } from "@/lib/core/crypto";
import {
  isSameRegisteredOllamaUrl,
  probeOllamaTags,
  resetOllamaCircuit,
} from "../local-ollama";
import {
  callOllamaEmbedding,
  resolveEmbeddingConfig,
} from "../embedding-registry";
import {
  extractBridgeTokenFromHeaders,
  verifyBridgeTokenConstantTime,
} from "@/scripts/ollama-bridge.mjs";

const TEST_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

beforeEach(() => {
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", TEST_KEY);
  resetOllamaCircuit();
});

afterEach(() => {
  resetOllamaCircuit();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Ollama bridge token authentication & URL origin matching", () => {
  it("extracts bearer or bridge header tokens and rejects malformed headers", () => {
    expect(
      extractBridgeTokenFromHeaders({ authorization: "Bearer secret-token-123" })
    ).toBe("secret-token-123");
    expect(
      extractBridgeTokenFromHeaders({
        "x-mailpilot-bridge-token": "custom-token-456",
      })
    ).toBe("custom-token-456");
    expect(
      extractBridgeTokenFromHeaders({ authorization: "Basic abc123" })
    ).toBeNull();
    expect(
      extractBridgeTokenFromHeaders({ authorization: "Bearer " })
    ).toBeNull();
    expect(extractBridgeTokenFromHeaders({})).toBeNull();
  });

  it("verifies bridge tokens in constant time via SHA-256 digest comparison", () => {
    const expected = "a".repeat(64);
    expect(verifyBridgeTokenConstantTime(expected, expected)).toBe(true);
    expect(verifyBridgeTokenConstantTime("a".repeat(63) + "b", expected)).toBe(
      false
    );
    expect(verifyBridgeTokenConstantTime("short", expected)).toBe(false);
    expect(verifyBridgeTokenConstantTime("", expected)).toBe(false);
    expect(verifyBridgeTokenConstantTime(null, expected)).toBe(false);
  });

  it("matches registered Ollama URLs strictly and rejects prefix-spoofed hostnames", () => {
    expect(
      isSameRegisteredOllamaUrl(
        "https://abc-123.trycloudflare.com/",
        "https://abc-123.trycloudflare.com"
      )
    ).toBe(true);
    expect(
      isSameRegisteredOllamaUrl(
        "https://abc-123.trycloudflare.com.attacker.com",
        "https://abc-123.trycloudflare.com"
      )
    ).toBe(false);
    expect(
      isSameRegisteredOllamaUrl(
        "https://other.trycloudflare.com",
        "https://abc-123.trycloudflare.com"
      )
    ).toBe(false);
    expect(isSameRegisteredOllamaUrl(null, "https://abc.trycloudflare.com")).toBe(
      false
    );
  });

  it("attaches Authorization: Bearer header in probeOllamaTags and callOllamaEmbedding when authToken is present", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith("/api/tags")) {
          return new Response(
            JSON.stringify({ models: [{ name: "llama3.1:8b" }] }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ embedding: [0.1, 0.2, 0.3] }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      });

    const token = "bridge-ephemeral-token-64chars-0123456789abcdef0123456789abcdef";
    const encryptedTunnelToken = encryptToken(token);
    expect(decryptToken(encryptedTunnelToken)).toBe(token);

    const tags = await probeOllamaTags(
      "https://tunnel-test.trycloudflare.com",
      5000,
      { authToken: token }
    );
    expect(tags.models).toEqual(["llama3.1:8b"]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const tagHeaders = fetchSpy.mock.calls[0]?.[1]?.headers as Record<
      string,
      string
    >;
    expect(tagHeaders.Authorization).toBe(`Bearer ${token}`);

    const embCfg = resolveEmbeddingConfig({
      embeddingProvider: "local_ollama",
      embeddingModel: "nomic-embed-text",
      localOllamaUrl: "https://tunnel-test.trycloudflare.com",
      encryptedTunnelToken,
    });
    expect(embCfg?.authToken).toBe(token);

    const vectors = await callOllamaEmbedding(["sample text"], embCfg!);
    expect(vectors).toEqual([[0.1, 0.2, 0.3]]);
    const embHeaders = fetchSpy.mock.calls[1]?.[1]?.headers as Record<
      string,
      string
    >;
    expect(embHeaders.Authorization).toBe(`Bearer ${token}`);
  });
});
