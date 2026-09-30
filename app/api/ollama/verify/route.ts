import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getAuthenticatedAccountId } from "@/lib/auth";
import {
  normalizeOllamaBaseUrl,
  OllamaUnreachableError,
  probeOllamaTagsWithRetry,
} from "@/lib/llm";
import { prisma } from "@/lib/prisma";
import {
  accountRulesSchema,
  parseAccountRules,
} from "@/lib/validations/rules";

export const dynamic = "force-dynamic";

const verifyBodySchema = z.object({
  // Empty string from clients must not hard-fail as 400
  url: z.preprocess((val) => {
    if (typeof val !== "string") return undefined;
    const trimmed = val.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().url().optional()),
});

export type OllamaConnectionStatus =
  | "connected"
  | "waiting"
  | "offline"
  | "error";

/**
 * Allow Cloudflare Quick Tunnels and local Ollama during development.
 * Blocks other hosts to reduce SSRF risk from the verify proxy.
 */
function isAllowedOllamaUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    }
    if (host.endsWith(".trycloudflare.com") && parsed.protocol === "https:") {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** True only for a registered Cloudflare Quick Tunnel (not the schema default localhost). */
function isRegisteredTunnelUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.toLowerCase().endsWith(".trycloudflare.com")
    );
  } catch {
    return false;
  }
}

async function persistBridgeStatus(
  accountId: string,
  opts: {
    connected: boolean;
    models: string[];
    localOllamaUrl?: string | null;
    setLocalProvider?: boolean;
  }
): Promise<void> {
  const settings = await prisma.accountSettings.findUnique({
    where: { accountId },
  });
  if (!settings) return;

  const current = parseAccountRules(settings.rules);
  const validated = accountRulesSchema.parse({
    ...current,
    availableModels: opts.models,
    bridgeConnected: opts.connected,
  });

  await prisma.accountSettings.update({
    where: { accountId },
    data: {
      rules: validated as Prisma.InputJsonValue,
      ...(opts.localOllamaUrl !== undefined
        ? { localOllamaUrl: opts.localOllamaUrl }
        : {}),
      ...(opts.setLocalProvider && opts.connected
        ? { llmProvider: "LOCAL_OLLAMA" as const }
        : {}),
    },
  });
}

/**
 * Cloud→tunnel probes are flaky from Vercel. If the bridge CLI already
 * registered models (bridgeConnected + availableModels), keep that state —
 * do not force the user to re-verify from localhost/dev.
 */
async function handleUnreachable(
  accountId: string,
  error: string,
  status: OllamaConnectionStatus
): Promise<NextResponse> {
  const settings = await prisma.accountSettings.findUnique({
    where: { accountId },
  });
  const rules = settings ? parseAccountRules(settings.rules) : null;
  const cliModels = rules?.availableModels ?? [];
  const storedUrl = settings?.localOllamaUrl?.trim() ?? "";
  const trustCli =
    Boolean(rules?.bridgeConnected) &&
    cliModels.length > 0 &&
    storedUrl.length > 0 &&
    isRegisteredTunnelUrl(storedUrl);

  if (!trustCli) {
    // Never clear localOllamaUrl — wiping it forces a full CLI re-run.
    await persistBridgeStatus(accountId, { connected: false, models: [] });
  }

  if (trustCli) {
    return NextResponse.json({
      connected: true,
      status: "connected" satisfies OllamaConnectionStatus,
      models: cliModels,
      activeUrl: storedUrl.replace(/\/+$/, ""),
      cleared: false,
      trustedCli: true,
      error:
        "Cloud could not reach the tunnel, but your bridge CLI registration is still active.",
    });
  }

  return NextResponse.json({
    connected: false,
    status,
    models: [],
    cleared: false,
    error,
  });
}

export async function POST(request: Request) {
  try {
    const accountId = await getAuthenticatedAccountId();
    if (!accountId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const raw: unknown = await request.json().catch(() => ({}));
    const parsed = verifyBodySchema.safeParse(raw);
    if (!parsed.success) {
      // Treat bad/empty body like missing tunnel (no 400 loop in Network tab)
      return NextResponse.json({
        connected: false,
        status: "waiting" satisfies OllamaConnectionStatus,
        models: [],
        error:
          "Bridge tunnel not found. Run the terminal command, then Check Connection.",
      });
    }

    // Same AccountSettings row the bridge registers via accountId (session cookie).
    // Also re-resolve by email so casing / multi-path writes can't diverge.
    const account = await prisma.account.findFirst({
      where: { id: accountId, isActive: true },
      select: {
        id: true,
        email: true,
        settings: { select: { localOllamaUrl: true } },
      },
    });

    const settingsByEmail =
      account?.email != null
        ? await prisma.accountSettings.findFirst({
            where: {
              account: {
                email: { equals: account.email, mode: "insensitive" },
              },
            },
            select: { localOllamaUrl: true, accountId: true },
          })
        : null;

    const rawStored =
      account?.settings?.localOllamaUrl?.trim() ||
      settingsByEmail?.localOllamaUrl?.trim() ||
      "";
    // Prefer a registered Cloudflare tunnel; also accept local Ollama hosts.
    const storedTunnel = isRegisteredTunnelUrl(rawStored) ? rawStored : "";
    const payloadUrl = parsed.data.url?.trim() || "";
    const payloadTunnel = isRegisteredTunnelUrl(payloadUrl) ? payloadUrl : "";

    const isDev = process.env.NODE_ENV === "development";
    const storedLocal =
      rawStored && isAllowedOllamaUrl(normalizeOllamaBaseUrl(rawStored))
        ? normalizeOllamaBaseUrl(rawStored)
        : "";
    const payloadLocal =
      payloadUrl &&
      !isRegisteredTunnelUrl(payloadUrl) &&
      isAllowedOllamaUrl(normalizeOllamaBaseUrl(payloadUrl))
        ? normalizeOllamaBaseUrl(payloadUrl)
        : "";

    // Tunnel first in prod; in dev fall back to direct 127.0.0.1 when no tunnel.
    const targetUrl =
      payloadTunnel ||
      storedTunnel ||
      (isDev ? payloadLocal || storedLocal || "http://127.0.0.1:11434" : undefined);

    if (!targetUrl) {
      await persistBridgeStatus(accountId, { connected: false, models: [] });
      // 200 (not 400): missing tunnel is an expected bridge state, not a client error
      return NextResponse.json({
        success: false,
        connected: false,
        status: "waiting" satisfies OllamaConnectionStatus,
        models: [],
        error:
          "Bridge tunnel not found. Make sure the terminal command registered successfully with your email.",
      });
    }

    const hadStoredUrl = storedTunnel.length > 0 || storedLocal.length > 0;
    const base = normalizeOllamaBaseUrl(targetUrl);

    if (!isAllowedOllamaUrl(base)) {
      return handleUnreachable(
        accountId,
        "URL not allowed. Use a *.trycloudflare.com tunnel or localhost.",
        "error"
      );
    }

    let models: string[];
    try {
      // Quick Tunnels are flaky from serverless — retry with a longer timeout.
      const probe = await probeOllamaTagsWithRetry(base, {
        timeoutMs: isRegisteredTunnelUrl(base) ? 12_000 : 6_000,
        attempts: isRegisteredTunnelUrl(base) ? 3 : 2,
      });
      models = probe.models;
    } catch (err) {
      const isTimeout =
        err instanceof Error &&
        (err.name === "AbortError" ||
          err.name === "TimeoutError" ||
          /timeout|aborted/i.test(err.message));
      const detail =
        err instanceof OllamaUnreachableError
          ? err.message.replace(/^Local Ollama instance unreachable at [^:]+:\s*/, "")
          : err instanceof Error
            ? err.message
            : "Failed to reach tunnel endpoint.";
      return handleUnreachable(
        accountId,
        isTimeout
          ? "Connection timed out. Check that your terminal bridge is running."
          : detail || "Failed to reach tunnel endpoint.",
        hadStoredUrl ? "offline" : "waiting"
      );
    }

    await persistBridgeStatus(accountId, {
      connected: true,
      models,
      localOllamaUrl: base,
      setLocalProvider: true,
    });

    console.info("[Ollama:Verify]", {
      connected: true,
      reachable: true,
      url: base,
      modelsCount: models.length,
    });

    return NextResponse.json({
      success: true,
      connected: true,
      status: "connected" satisfies OllamaConnectionStatus,
      activeUrl: base,
      models,
    });
  } catch (err) {
    const isTimeout =
      err instanceof Error &&
      (err.name === "AbortError" || err.name === "TimeoutError");
    const message = isTimeout
      ? "Connection timed out. Check that your terminal bridge is running."
      : "Failed to reach tunnel endpoint.";

    try {
      const accountId = await getAuthenticatedAccountId();
      if (accountId) {
        return handleUnreachable(accountId, message, "offline");
      }
    } catch {
      // fall through
    }

    return NextResponse.json({
      connected: false,
      status: "offline" satisfies OllamaConnectionStatus,
      models: [],
      cleared: false,
      error: message,
    });
  }
}
