#!/usr/bin/env node

/**
 * Cross-platform Ollama ↔ MailPilot bridge via Cloudflare Quick Tunnel.
 *
 * Usage:
 *   npm run ollama:bridge -- you@gmail.com <bridge-secret>
 *
 * Keep this process running while using the production dashboard with LOCAL_OLLAMA.
 * Ctrl+C tears down the tunnel and resets the account to OPENROUTER.
 */

import { startTunnel } from "untun";

const email = process.argv[2];
const secret = process.argv[3] || "";
const PROD_API =
  "https://mailpilot-prod.vercel.app/api/settings/ollama-bridge";
const LOCAL_OLLAMA = "http://127.0.0.1:11434";

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

try {
  const check = await fetch(`${LOCAL_OLLAMA}/api/tags`);
  if (!check.ok) throw new Error(`HTTP ${check.status}`);
} catch {
  console.error(`\nCannot connect to local Ollama at ${LOCAL_OLLAMA}`);
  console.error(
    "  Make sure Ollama is open or run 'ollama serve' in another terminal.\n"
  );
  process.exit(1);
}

console.log("Local Ollama detected.");
console.log("Starting Cloudflare tunnel...");

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
  tunnel = await startTunnel({
    port: 11434,
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
  console.log("OLLAMA BRIDGE ACTIVE");
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
