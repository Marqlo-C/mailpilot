#!/usr/bin/env node

/**
 * Cross-platform Ollama ↔ MailPilot bridge via Cloudflare Quick Tunnel
 * protected by an authenticating local streaming reverse proxy.
 *
 * Usage:
 *   npm run ollama:bridge -- you@gmail.com <bridge-secret>
 *
 * Keep this process running while using the production dashboard with LOCAL_OLLAMA.
 * Ctrl+C tears down the tunnel and resets the account to OPENROUTER.
 */

import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { startTunnel } from "untun";

export const DEFAULT_PROD_API =
  "https://mailpilot-prod.vercel.app/api/settings/ollama-bridge";
export const DEFAULT_LOCAL_OLLAMA = "http://127.0.0.1:11434";

/**
 * Strict allowlist of safe read/inference Ollama endpoints exposed across the tunnel.
 * Administrative/destructive endpoints (/api/pull, /api/delete, /api/push, /api/create)
 * are blocked at the local proxy boundary.
 */
export const DEFAULT_ALLOWED_ROUTES = new Map([
  ["/api/tags", new Set(["GET"])],
  ["/api/version", new Set(["GET"])],
  ["/api/generate", new Set(["POST"])],
  ["/api/embeddings", new Set(["POST"])],
  ["/api/chat", new Set(["POST"])],
]);

const STRIPPED_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "x-mailpilot-bridge-token",
  "cookie",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
]);

/**
 * Extracts a candidate bearer/bridge token from incoming HTTP headers.
 */
export function extractBridgeTokenFromHeaders(headers = {}) {
  const authHeader = Array.isArray(headers.authorization)
    ? headers.authorization[0]
    : headers.authorization;

  if (typeof authHeader === "string") {
    const trimmed = authHeader.trim();
    const match = trimmed.match(/^Bearer\s+([^\s]+)$/i);
    if (!match || !match[1]) {
      return null;
    }
    return match[1];
  }

  const customHeader = Array.isArray(headers["x-mailpilot-bridge-token"])
    ? headers["x-mailpilot-bridge-token"][0]
    : headers["x-mailpilot-bridge-token"];

  if (typeof customHeader === "string") {
    const trimmed = customHeader.trim();
    if (trimmed.length > 0 && !/\s/.test(trimmed)) {
      return trimmed;
    }
    return null;
  }

  return null;
}

/**
 * Constant-time token verification using SHA-256 digests so token length
 * differences never leak timing information.
 */
export function verifyBridgeTokenConstantTime(candidateToken, expectedToken) {
  if (
    typeof candidateToken !== "string" ||
    candidateToken.length === 0 ||
    typeof expectedToken !== "string" ||
    expectedToken.length === 0
  ) {
    return false;
  }

  const candidateDigest = crypto
    .createHash("sha256")
    .update(Buffer.from(candidateToken, "utf8"))
    .digest();
  const expectedDigest = crypto
    .createHash("sha256")
    .update(Buffer.from(expectedToken, "utf8"))
    .digest();

  return crypto.timingSafeEqual(candidateDigest, expectedDigest);
}

/**
 * Creates an authenticating HTTP streaming reverse proxy in front of local Ollama.
 */
export function createOllamaAuthProxy({
  targetUrl = DEFAULT_LOCAL_OLLAMA,
  authToken,
  allowedRoutes = DEFAULT_ALLOWED_ROUTES,
} = {}) {
  if (typeof authToken !== "string" || authToken.trim().length === 0) {
    throw new Error("createOllamaAuthProxy requires a non-empty authToken");
  }
  const cleanExpectedToken = authToken.trim();
  const target = new URL(targetUrl);

  return http.createServer((req, res) => {
    const candidateToken = extractBridgeTokenFromHeaders(req.headers);
    if (!verifyBridgeTokenConstantTime(candidateToken, cleanExpectedToken)) {
      res.writeHead(401, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "WWW-Authenticate": 'Bearer realm="mailpilot-ollama-bridge"',
      });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const rawUrl = req.url ?? "/";
    if (
      rawUrl.includes("..") ||
      rawUrl.includes("\\") ||
      /%2e/i.test(rawUrl) ||
      /%2f/i.test(rawUrl) ||
      /%5c/i.test(rawUrl)
    ) {
      res.writeHead(403, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify({ error: "Forbidden path" }));
      return;
    }

    let parsedUrl;
    let decodedPathname;
    try {
      parsedUrl = new URL(rawUrl, "http://127.0.0.1");
      decodedPathname = decodeURIComponent(parsedUrl.pathname);
    } catch {
      res.writeHead(403, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify({ error: "Forbidden malformed URL" }));
      return;
    }

    const normalizedPath = path.posix
      .normalize(decodedPathname)
      .replace(/\/+$/, "") || "/";
    const method = (req.method ?? "GET").toUpperCase();
    const allowedMethods = allowedRoutes.get(normalizedPath);

    if (!allowedMethods || !allowedMethods.has(method)) {
      res.writeHead(403, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify({ error: "Forbidden endpoint" }));
      return;
    }

    const upstreamHeaders = {};
    for (const [key, value] of Object.entries(req.headers)) {
      const lowerKey = key.toLowerCase();
      if (STRIPPED_HEADERS.has(lowerKey) || value === undefined) {
        continue;
      }
      upstreamHeaders[key] = value;
    }
    upstreamHeaders.host = target.host;

    const proxyReq = http.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || 80,
        method,
        path: normalizedPath,
        headers: upstreamHeaders,
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );

    proxyReq.on("error", () => {
      if (!res.headersSent) {
        res.writeHead(502, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
      }
      if (!res.writableEnded) {
        res.end(
          JSON.stringify({
            error: "Bad Gateway: local Ollama instance unreachable",
          })
        );
      }
    });

    req.on("aborted", () => {
      proxyReq.destroy();
    });

    req.pipe(proxyReq);
  });
}

async function runBridgeCli() {
  const email = process.argv[2];
  const secret = process.argv[3] || "";
  const PROD_API = process.env.MAILPILOT_BRIDGE_API_URL?.trim() || DEFAULT_PROD_API;
  const LOCAL_OLLAMA =
    process.env.OLLAMA_BASE_URL?.trim() || DEFAULT_LOCAL_OLLAMA;

  if (!email || !secret) {
    console.error("Missing email or bridge secret.");
    console.log(
      "Usage: npm run ollama:bridge -- <your-email@gmail.com> <bridge-secret>"
    );
    console.log(
      "Generate the secret in Settings → AI & Models → Automated Bridge."
    );
    process.exit(1);
  }

  // Non-interactive cloudflared install consent for CI / first run
  process.env.UNTUN_ACCEPT_CLOUDFLARE_NOTICE ??= "true";

  /** @type {string[]} */
  let detectedModels = [];
  try {
    const check = await fetch(`${LOCAL_OLLAMA}/api/tags`);
    if (!check.ok) throw new Error(`HTTP ${check.status}`);
    const payload = await check.json().catch(() => ({}));
    if (Array.isArray(payload?.models)) {
      detectedModels = payload.models
        .map((m) => (typeof m?.name === "string" ? m.name.trim() : ""))
        .filter(Boolean);
    }
  } catch {
    console.error(`\nCannot connect to local Ollama at ${LOCAL_OLLAMA}`);
    console.error(
      "  Make sure Ollama is open or run 'ollama serve' in another terminal.\n"
    );
    process.exit(1);
  }

  console.log("Local Ollama detected.");
  console.log("Starting local authenticating proxy and Cloudflare tunnel...");

  const tunnelToken =
    process.env.OLLAMA_BRIDGE_TOKEN?.trim() ||
    crypto.randomBytes(32).toString("hex");

  /** @type {import("node:http").Server | undefined} */
  let proxyServer;
  /** @type {{ getURL: () => Promise<string>; close: () => Promise<void> } | undefined} */
  let tunnel;
  let isShuttingDown = false;

  async function cleanup() {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log("\nClosing tunnel and resetting MailPilot profile...");
    try {
      await fetch(PROD_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          action: "disconnect",
          bridgeSecret: secret,
        }),
      });
    } catch {
      // Best-effort disconnect against production
    }

    if (tunnel) {
      try {
        await tunnel.close();
      } catch {
        // Tunnel may already be stopped by untun signal handlers
      }
    }

    if (proxyServer) {
      await new Promise((resolve) => proxyServer.close(() => resolve()));
    }

    console.log("Bridge disconnected successfully.\n");
    process.exit(0);
  }

  process.on("SIGINT", () => {
    void cleanup();
  });
  process.on("SIGTERM", () => {
    void cleanup();
  });

  try {
    proxyServer = createOllamaAuthProxy({
      targetUrl: LOCAL_OLLAMA,
      authToken: tunnelToken,
    });

    await new Promise((resolve, reject) => {
      proxyServer.once("error", reject);
      proxyServer.listen(0, "127.0.0.1", resolve);
    });

    const address = proxyServer.address();
    const proxyPort =
      typeof address === "object" && address ? address.port : 0;
    if (!proxyPort) {
      throw new Error("Failed to bind local authenticating proxy port");
    }

    tunnel = await startTunnel({
      port: proxyPort,
      hostname: "127.0.0.1",
      acceptCloudflareNotice: true,
    });

    if (!tunnel) {
      throw new Error(
        "Tunnel failed to start (cloudflared binary missing or notice declined)"
      );
    }

    const tunnelUrl = await tunnel.getURL();
    if (!tunnelUrl || typeof tunnelUrl !== "string") {
      throw new Error("Tunnel started but no public URL was returned");
    }

    const normalizedUrl = tunnelUrl.replace(/\/+$/, "");

    console.log("\n=======================================================");
    console.log("OLLAMA BRIDGE ACTIVE (Authenticated Proxy Gate Enabled)");
    console.log(`Public URL: ${normalizedUrl}`);
    console.log("=======================================================\n");

    console.log(`Linking URL to account: ${email}...`);
    const res = await fetch(PROD_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        ollamaUrl: normalizedUrl,
        bridgeSecret: secret,
        tunnelToken,
        ...(detectedModels.length > 0 ? { models: detectedModels } : {}),
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        typeof data.error === "string" ? data.error : "Failed to link profile"
      );
    }

    console.log("Linked! MailPilot requests are now routed to your local GPU.");
    console.log("Keep this terminal window open while using MailPilot.");
    console.log("  Press Ctrl+C when finished to tear down the bridge.\n");

    // Keep process alive until signal
    await new Promise(() => {});
  } catch (err) {
    console.error(
      "Bridge error:",
      err instanceof Error ? err.message : String(err)
    );
    await cleanup();
  }
}

const isMainModule =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  void runBridgeCli();
}
